import type { SupabaseClient } from "@supabase/supabase-js";
import { google, gmail_v1 } from "googleapis";
import { createGoogleOAuthClient } from "./oauth-client";
import { getValidAccessToken } from "./token-refresh";
import { escapeHtml } from "@/lib/mail/compose";
import { mapWithConcurrency } from "@/lib/sync/concurrency";
import type {
  ListMessagesParams,
  ListMessagesResult,
  FetchMessageBodyParams,
  FetchMessageBodyResult,
  SyncableFolderId,
} from "@/lib/providers/types";

const LIST_PAGE_SIZE = 50;
const LIST_FETCH_CONCURRENCY = 5;

export async function getGmailClient(supabase: SupabaseClient, mailboxId: string) {
  const accessToken = await getValidAccessToken(supabase, mailboxId);
  const client = createGoogleOAuthClient();
  client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: client });
}

/** Live, uncached folder listing -- runs on every `GET /api/mail` call, nothing is persisted.
 * Gmail's `messages.list` only returns ids, so a `format: "metadata"` follow-up per message
 * (lighter than `format: "full"` -- no body download) fills in what the list view needs. */
export async function listGmailMessages(
  supabase: SupabaseClient,
  params: ListMessagesParams
): Promise<ListMessagesResult> {
  const gmail = await getGmailClient(supabase, params.mailboxId);

  const { data } = await gmail.users.messages.list({
    userId: "me",
    maxResults: LIST_PAGE_SIZE,
    // Gmail excludes Trash (and Spam) from list results by default -- without this, the "trash"
    // folder would never return anything.
    includeSpamTrash: true,
    // Bounded to a recent window rather than full history, to keep every live request fast.
    q: `newer_than:10d ${gmailQueryForFolder(params.folder)}`,
  });

  const ids = (data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const items = await mapWithConcurrency(ids, LIST_FETCH_CONCURRENCY, (id) =>
    gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Subject", "From"] })
  );

  const messages = items
    .map(({ data: m }) => {
      const headers = m.payload?.headers;
      const fromAddresses = parseAddressHeader(headerValue(headers, "From"));
      const internalDateMs = Number(m.internalDate);
      return {
        providerMessageId: m.id ?? "",
        threadId: m.threadId ?? null,
        subject: headerValue(headers, "Subject"),
        from: fromAddresses[0] ?? { name: "", email: "" },
        previewText: m.snippet ?? "",
        sentAt: new Date(Number.isFinite(internalDateMs) ? internalDateMs : Date.now()).toISOString(),
        unread: (m.labelIds ?? []).includes("UNREAD"),
        starred: (m.labelIds ?? []).includes("STARRED"),
      };
    })
    .filter((m) => m.providerMessageId);

  return { messages };
}

/** Gmail has no per-folder listing endpoint -- `q` search operators stand in for it. */
function gmailQueryForFolder(folder: SyncableFolderId): string {
  switch (folder) {
    case "inbox":
      return "in:inbox";
    case "drafts":
      return "in:drafts";
    case "archive":
      return "-in:inbox -in:trash -in:drafts -in:sent";
    case "trash":
      return "in:trash";
    case "sent":
      return "in:sent";
  }
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
