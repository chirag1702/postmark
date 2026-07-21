import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./token-refresh";
import { escapeHtml } from "@/lib/mail/compose";
import type {
  FetchMessagesParams,
  FetchMessagesResult,
  FetchMessageBodyParams,
  FetchMessageBodyResult,
  SyncableFolderId,
} from "@/lib/providers/types";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const POLL_PAGE_GUARD = 5; // bound on how many nextLink pages one folder can page through per poll tick

// "sentitems" is deliberately omitted -- outbound mail sent through this app is already
// persisted (with tracking) by the send path, so syncing it here would create untracked
// duplicates. Mail sent from the provider's own native UI never appears in Postmark's Sent
// folder; accepted limitation for this module.
const WELL_KNOWN_FOLDERS: { name: string; folder: SyncableFolderId }[] = [
  { name: "inbox", folder: "inbox" },
  { name: "drafts", folder: "drafts" },
  { name: "archive", folder: "archive" },
  { name: "deleteditems", folder: "trash" },
];

interface FolderCursorEntry {
  link: string;
  kind: "next" | "delta";
}

type GraphCursor = Partial<Record<string, FolderCursorEntry>>;

function parseCursor(raw: string | null | undefined): GraphCursor {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as GraphCursor;
  } catch {
    return {};
  }
}

function isFolderPending(cursor: GraphCursor, folderName: string): boolean {
  const entry = cursor[folderName];
  return !entry || entry.kind === "next";
}

interface GraphDeltaMessage {
  id?: string;
  conversationId?: string;
  "@removed"?: { reason: string };
}

interface GraphDeltaResponse {
  value: GraphDeltaMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export class GraphHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GraphHttpError";
  }
}

export async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GraphHttpError(res.status, `Microsoft Graph request failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function graphSend(
  accessToken: string,
  method: "PATCH" | "POST",
  url: string,
  body: unknown
): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GraphHttpError(res.status, `Microsoft Graph request failed: ${res.status} ${text}`);
  }
}

export function graphPatch(accessToken: string, url: string, body: unknown): Promise<void> {
  return graphSend(accessToken, "PATCH", url, body);
}

export function graphPost(accessToken: string, url: string, body: unknown): Promise<void> {
  return graphSend(accessToken, "POST", url, body);
}

function extractMessages(
  data: GraphDeltaResponse,
  folder: SyncableFolderId
): FetchMessagesResult["messages"] {
  return data.value
    .filter((m): m is { id: string; conversationId?: string } => Boolean(m.id) && !m["@removed"])
    .map((m) => ({ providerMessageId: m.id, threadId: m.conversationId ?? null, folder }));
}

/**
 * Backfill: one HTTP call per `fetchMessages` invocation, advancing exactly one well-known
 * folder at a time through its initial `/delta` pagination (nextLink -> ... -> deltaLink).
 * `hasMore` stays true until every folder has reached its terminal deltaLink. This one-call-per-
 * page granularity is what lets the caller checkpoint `sync_state` after every page for a large
 * mailbox's initial history load.
 */
async function backfillOneFolder(
  accessToken: string,
  cursorRaw: string | null | undefined
): Promise<FetchMessagesResult> {
  const cursor = parseCursor(cursorRaw);
  const target = WELL_KNOWN_FOLDERS.find((f) => isFolderPending(cursor, f.name));
  if (!target) {
    return { messages: [], nextCursor: JSON.stringify(cursor), hasMore: false };
  }

  const existing = cursor[target.name];
  const url =
    existing?.link ??
    `${GRAPH_BASE}/me/mailFolders/${target.name}/messages/delta?$select=id,conversationId`;

  let data: GraphDeltaResponse;
  try {
    data = await graphGet<GraphDeltaResponse>(accessToken, url);
  } catch (err) {
    if (err instanceof GraphHttpError && err.status === 404) {
      // This account has no folder by this well-known name (e.g. no Archive) -- mark it
      // done-and-empty rather than failing the whole mailbox.
      cursor[target.name] = { link: "", kind: "delta" };
      return {
        messages: [],
        nextCursor: JSON.stringify(cursor),
        hasMore: WELL_KNOWN_FOLDERS.some((f) => isFolderPending(cursor, f.name)),
      };
    }
    throw err;
  }

  if (data["@odata.nextLink"]) {
    cursor[target.name] = { link: data["@odata.nextLink"], kind: "next" };
  } else if (data["@odata.deltaLink"]) {
    cursor[target.name] = { link: data["@odata.deltaLink"], kind: "delta" };
  }

  return {
    messages: extractMessages(data, target.folder),
    nextCursor: JSON.stringify(cursor),
    hasMore: WELL_KNOWN_FOLDERS.some((f) => isFolderPending(cursor, f.name)),
  };
}

/**
 * Poll: re-checks EVERY well-known folder's stored deltaLink for changes in one call (unlike
 * backfill, poll cursors always start with all 4 folders already at their terminal "delta"
 * state, so there is no "pending folder" to find -- every folder needs exactly one refresh
 * check each tick). Small per-tick payloads expected, so this drains internally (bounded
 * nextLink following per folder) rather than splitting across multiple job-loop iterations.
 * Always returns `hasMore: false`, mirroring Gmail's poll shape.
 */
async function pollAllFolders(
  accessToken: string,
  cursorRaw: string | null | undefined
): Promise<FetchMessagesResult> {
  const cursor = parseCursor(cursorRaw);
  const messages: FetchMessagesResult["messages"] = [];

  for (const { name, folder } of WELL_KNOWN_FOLDERS) {
    const startLink =
      cursor[name]?.link ||
      `${GRAPH_BASE}/me/mailFolders/${name}/messages/delta?$select=id,conversationId`;

    let page: GraphDeltaResponse;
    try {
      page = await graphGet<GraphDeltaResponse>(accessToken, startLink);
    } catch (err) {
      if (err instanceof GraphHttpError && err.status === 404) {
        cursor[name] = { link: "", kind: "delta" };
        continue;
      }
      throw err;
    }
    messages.push(...extractMessages(page, folder));

    let guard = 0;
    while (page["@odata.nextLink"] && guard < POLL_PAGE_GUARD) {
      page = await graphGet<GraphDeltaResponse>(accessToken, page["@odata.nextLink"]);
      messages.push(...extractMessages(page, folder));
      guard += 1;
    }

    cursor[name] = { link: page["@odata.deltaLink"] ?? cursor[name]?.link ?? "", kind: "delta" };
  }

  return { messages, nextCursor: JSON.stringify(cursor), hasMore: false };
}

export async function fetchGraphMessages(
  supabase: SupabaseClient,
  params: FetchMessagesParams
): Promise<FetchMessagesResult> {
  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  return params.mode === "poll"
    ? pollAllFolders(accessToken, params.cursor)
    : backfillOneFolder(accessToken, params.cursor);
}

interface GraphEmailAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessageDetail {
  subject?: string;
  from?: GraphEmailAddress;
  toRecipients?: GraphEmailAddress[];
  ccRecipients?: GraphEmailAddress[];
  body?: { contentType?: "html" | "text"; content?: string };
  sentDateTime?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
}

function toAddress(r?: GraphEmailAddress): { name: string; email: string } {
  return { name: r?.emailAddress?.name ?? "", email: r?.emailAddress?.address ?? "" };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchGraphMessageBody(
  supabase: SupabaseClient,
  params: FetchMessageBodyParams
): Promise<FetchMessageBodyResult> {
  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  const select = [
    "subject",
    "from",
    "toRecipients",
    "ccRecipients",
    "body",
    "sentDateTime",
    "receivedDateTime",
    "isRead",
    "flag",
  ].join(",");

  const data = await graphGet<GraphMessageDetail>(
    accessToken,
    `${GRAPH_BASE}/me/messages/${params.providerMessageId}?$select=${select}`
  );

  const rawContent = data.body?.content ?? "";
  const isHtml = data.body?.contentType === "html";
  const bodyHtml = isHtml ? rawContent : `<pre>${escapeHtml(rawContent)}</pre>`;
  const bodyText = isHtml ? stripTags(rawContent) : rawContent;

  return {
    subject: data.subject ?? "",
    from: toAddress(data.from),
    to: (data.toRecipients ?? []).map(toAddress).filter((a) => a.email),
    cc: (data.ccRecipients ?? []).map(toAddress).filter((a) => a.email),
    bodyHtml,
    bodyText,
    sentAt: data.sentDateTime ?? data.receivedDateTime ?? new Date().toISOString(),
    // folder intentionally omitted -- Graph already resolves it during fetchMessages.
    unread: data.isRead === false,
    starred: data.flag?.flagStatus === "flagged",
  };
}
