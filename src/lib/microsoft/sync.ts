import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./token-refresh";
import { escapeHtml } from "@/lib/mail/compose";
import type {
  ListMessagesParams,
  ListMessagesResult,
  FetchMessageBodyParams,
  FetchMessageBodyResult,
  SyncableFolderId,
} from "@/lib/providers/types";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// "sentitems" is deliberately omitted -- outbound mail sent through this app is already
// persisted (with tracking) by the send path, so syncing it here would create untracked
// duplicates. Mail sent from the provider's own native UI never appears in Postmark's Sent
// folder; accepted limitation for this module.
const WELL_KNOWN_FOLDERS: Record<Exclude<SyncableFolderId, "sent">, string> = {
  inbox: "inbox",
  drafts: "drafts",
  archive: "archive",
  trash: "deleteditems",
};

interface GraphListMessage {
  id?: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
}

interface GraphListResponse {
  value: GraphListMessage[];
}

// Bounded to the last 10 days rather than full history, to keep every live request fast.
const LIST_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const LIST_PAGE_SIZE = 50;

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

/** Live, uncached folder listing -- one HTTP call per `GET /api/mail` call, nothing persisted.
 * Graph's `$select` on the message-list endpoint returns everything the list view needs in a
 * single round trip (unlike Gmail, which needs a per-message follow-up). */
export async function listGraphMessages(
  supabase: SupabaseClient,
  params: ListMessagesParams
): Promise<ListMessagesResult> {
  if (params.folder === "sent") return { messages: [] };

  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  const folderName = WELL_KNOWN_FOLDERS[params.folder];
  const cutoff = new Date(Date.now() - LIST_WINDOW_MS).toISOString();
  const select = "id,conversationId,subject,from,bodyPreview,receivedDateTime,isRead,flag";
  const url =
    `${GRAPH_BASE}/me/mailFolders/${folderName}/messages` +
    `?$select=${select}&$filter=receivedDateTime ge ${cutoff}` +
    `&$orderby=receivedDateTime desc&$top=${LIST_PAGE_SIZE}`;

  let data: GraphListResponse;
  try {
    data = await graphGet<GraphListResponse>(accessToken, url);
  } catch (err) {
    // This account has no folder by this well-known name (e.g. no Archive) -- treat as empty.
    if (err instanceof GraphHttpError && err.status === 404) return { messages: [] };
    throw err;
  }

  const messages = data.value
    .filter((m): m is GraphListMessage & { id: string } => Boolean(m.id))
    .map((m) => ({
      providerMessageId: m.id,
      threadId: m.conversationId ?? null,
      subject: m.subject ?? "",
      from: { name: m.from?.emailAddress?.name ?? "", email: m.from?.emailAddress?.address ?? "" },
      previewText: m.bodyPreview ?? "",
      sentAt: m.receivedDateTime ?? new Date().toISOString(),
      unread: m.isRead === false,
      starred: m.flag?.flagStatus === "flagged",
    }));

  return { messages };
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
    // folder intentionally omitted -- Graph already resolves it during listMessages.
    unread: data.isRead === false,
    starred: data.flag?.flagStatus === "flagged",
  };
}
