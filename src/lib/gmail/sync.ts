import type { SupabaseClient } from "@supabase/supabase-js";
import { google, gmail_v1 } from "googleapis";
import { createGoogleOAuthClient } from "./oauth-client";
import { getValidAccessToken } from "./token-refresh";
import { escapeHtml } from "@/lib/mail/compose";
import type {
  FetchMessagesParams,
  FetchMessagesResult,
  FetchMessageBodyParams,
  FetchMessageBodyResult,
  SyncableFolderId,
} from "@/lib/providers/types";

const BACKFILL_PAGE_SIZE = 50;
const MAX_HISTORY_PAGES = 10;

/** Thrown when Gmail rejects `startHistoryId` as stale/invalid (404) -- the only startHistoryId
 * still valid after this is "none," so the caller must fall back to a fresh backfill. */
export class GmailHistoryGapError extends Error {
  constructor() {
    super("Gmail historyId is stale or invalid -- a fresh backfill is required");
    this.name = "GmailHistoryGapError";
  }
}

function isNotFound(err: unknown): boolean {
  const status = (err as { response?: { status?: number }; code?: number | string })?.response
    ?.status;
  const code = (err as { code?: number | string })?.code;
  return status === 404 || code === 404;
}

export async function getGmailClient(supabase: SupabaseClient, mailboxId: string) {
  const accessToken = await getValidAccessToken(supabase, mailboxId);
  const client = createGoogleOAuthClient();
  client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: client });
}

export async function fetchGmailMessages(
  supabase: SupabaseClient,
  params: FetchMessagesParams
): Promise<FetchMessagesResult> {
  const gmail = await getGmailClient(supabase, params.mailboxId);

  if (params.mode === "backfill") {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      maxResults: BACKFILL_PAGE_SIZE,
      pageToken: params.cursor ?? undefined,
      // Gmail excludes Trash (and Spam) from list results by default -- without this, the
      // "trash" folder mapping below would never actually be reachable during backfill.
      includeSpamTrash: true,
    });

    const messages = (data.messages ?? [])
      .filter((m): m is { id: string; threadId?: string | null } => Boolean(m.id))
      .map((m) => ({ providerMessageId: m.id, threadId: m.threadId ?? null }));

    if (data.nextPageToken) {
      return { messages, nextCursor: data.nextPageToken, hasMore: true };
    }

    // Last backfill page: seed the poll cursor with the mailbox's current historyId so the
    // very next poll tick picks up from here with no gap.
    const { data: profile } = await gmail.users.getProfile({ userId: "me" });
    return { messages, nextCursor: profile.historyId ?? null, hasMore: false };
  }

  // mode === "poll" -- caller guarantees backfill already ran, so a historyId cursor exists.
  if (!params.cursor) {
    throw new Error("Gmail poll requires a startHistoryId cursor");
  }

  const messages: FetchMessagesResult["messages"] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = params.cursor;

  for (let i = 0; i < MAX_HISTORY_PAGES; i++) {
    let data: gmail_v1.Schema$ListHistoryResponse;
    try {
      ({ data } = await gmail.users.history.list({
        userId: "me",
        startHistoryId: params.cursor,
        historyTypes: ["messageAdded"],
        pageToken,
      }));
    } catch (err) {
      if (isNotFound(err)) throw new GmailHistoryGapError();
      throw err;
    }

    for (const record of data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          messages.push({ providerMessageId: id, threadId: added.message?.threadId ?? null });
        }
      }
    }

    if (data.historyId) latestHistoryId = data.historyId;
    pageToken = data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return { messages, nextCursor: latestHistoryId, hasMore: false };
}

function findPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): gmail_v1.Schema$MessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Naive "Name <email>, Name2 <email2>" splitter -- good enough for standard RFC 2822 address
 * headers, mirrors the leniency of the existing client-side `parseAddressList`. */
function parseAddressHeader(value: string): { name: string; email: string }[] {
  if (!value) return [];
  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*)<(.+)>$/);
      if (match) {
        return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
      }
      return { name: "", email: entry };
    })
    .filter((addr) => addr.email.includes("@"));
}

function mapGmailLabelsToFolder(labelIds: string[]): SyncableFolderId {
  if (labelIds.includes("TRASH")) return "trash";
  if (labelIds.includes("DRAFT")) return "drafts";
  if (labelIds.includes("SENT")) return "sent";
  if (labelIds.includes("INBOX")) return "inbox";
  return "archive";
}

export async function fetchGmailMessageBody(
  supabase: SupabaseClient,
  params: FetchMessageBodyParams
): Promise<FetchMessageBodyResult> {
  const gmail = await getGmailClient(supabase, params.mailboxId);
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: params.providerMessageId,
    format: "full",
  });

  const headers = data.payload?.headers;
  const htmlPart = findPart(data.payload, "text/html");
  const textPart = findPart(data.payload, "text/plain");

  const bodyText = textPart?.body?.data ? decodeBase64Url(textPart.body.data) : "";
  const bodyHtml = htmlPart?.body?.data
    ? decodeBase64Url(htmlPart.body.data)
    : `<pre>${escapeHtml(bodyText)}</pre>`;

  const labelIds = data.labelIds ?? [];
  const fromAddresses = parseAddressHeader(headerValue(headers, "From"));
  const internalDateMs = Number(data.internalDate);

  return {
    subject: headerValue(headers, "Subject"),
    from: fromAddresses[0] ?? { name: "", email: "" },
    to: parseAddressHeader(headerValue(headers, "To")),
    cc: parseAddressHeader(headerValue(headers, "Cc")),
    bodyHtml,
    bodyText: bodyText || bodyHtml.replace(/<[^>]+>/g, ""),
    sentAt: new Date(Number.isFinite(internalDateMs) ? internalDateMs : Date.now()).toISOString(),
    folder: mapGmailLabelsToFolder(labelIds),
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
  };
}
