import { sanitizeInboundHtml } from "@/lib/sync/sanitize-html";
import type { EmailListItem, FetchMessageBodyResult, SyncableFolderId } from "@/lib/providers/types";
import type { Email } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNCABLE_FOLDERS = new Set<string>(["inbox", "drafts", "archive", "trash", "sent"]);

export function isUuidEmailId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Composite id for a live (uncached) email, distinguishing it from a sent-mail Postgres UUID.
 * Folder is encoded in the id (not just looked up from the fetched message) because Graph's
 * message-detail response doesn't resolve which well-known folder a message lives in -- the
 * caller already knows it from whichever folder it listed the message out of. */
export function liveEmailId(mailboxId: string, folder: SyncableFolderId, providerMessageId: string): string {
  return `${mailboxId}:${folder}:${providerMessageId}`;
}

/** A local (Postgres) email id is a bare UUID; a live email id is
 * `mailboxId:folder:providerMessageId`. */
export function parseLiveEmailId(
  id: string
): { mailboxId: string; folder: SyncableFolderId; providerMessageId: string } | null {
  if (UUID_RE.test(id)) return null;

  const firstColon = id.indexOf(":");
  const secondColon = id.indexOf(":", firstColon + 1);
  if (firstColon === -1 || secondColon === -1) return null;

  const mailboxId = id.slice(0, firstColon);
  const folder = id.slice(firstColon + 1, secondColon);
  const providerMessageId = id.slice(secondColon + 1);
  if (!SYNCABLE_FOLDERS.has(folder) || !providerMessageId) return null;

  return { mailboxId, folder: folder as SyncableFolderId, providerMessageId };
}

/** Shapes a folder-listing item into the frontend `Email` type -- no body/tracking data, since
 * the list view never fetches either. */
export function shapeLiveEmailListItem(
  mailboxId: string,
  folder: SyncableFolderId,
  item: EmailListItem
): Email {
  return {
    id: liveEmailId(mailboxId, folder, item.providerMessageId),
    accountId: mailboxId,
    folderId: folder,
    subject: item.subject,
    from: item.from,
    to: [],
    bodyParagraphs: [],
    bodyHtml: "",
    bodyText: "",
    previewText: item.previewText,
    timestamp: new Date(item.sentAt).toLocaleString(),
    sortDate: item.sentAt,
    unread: item.unread,
    starred: item.starred,
  };
}

/** Shapes a full message-body fetch into the frontend `Email` type for the reading pane. */
export function shapeLiveEmailDetail(
  mailboxId: string,
  folder: SyncableFolderId,
  providerMessageId: string,
  body: FetchMessageBodyResult
): Email {
  const bodyHtml = sanitizeInboundHtml(body.bodyHtml);
  return {
    id: liveEmailId(mailboxId, folder, providerMessageId),
    accountId: mailboxId,
    folderId: body.folder ?? folder,
    subject: body.subject,
    from: body.from,
    to: body.to,
    cc: body.cc && body.cc.length > 0 ? body.cc : undefined,
    bodyParagraphs: body.bodyText.split(/\n{2,}/).filter(Boolean),
    bodyHtml,
    bodyText: body.bodyText,
    previewText: body.bodyText.replace(/\s+/g, " ").trim().slice(0, 120),
    timestamp: new Date(body.sentAt).toLocaleString(),
    sortDate: body.sentAt,
    unread: body.unread,
    starred: body.starred,
  };
}
