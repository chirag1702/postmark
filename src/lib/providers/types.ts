import type { SupabaseClient } from "@supabase/supabase-js";
import type { FolderId } from "@/types";

/** "starred" is a UI-only pseudo-folder (see the `email_folder` Postgres enum) -- sync never
 * resolves a message to it, only to one of the 5 folders actually stored on `emails.folder`. */
export type SyncableFolderId = Exclude<FolderId, "starred">;

export interface SendMailParams {
  mailboxId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendMailResult {
  messageId: string | null;
  threadId: string | null;
}

export interface ListMessagesParams {
  mailboxId: string;
  /** Which mailbox folder to list -- always fetched fresh, bounded to a recent window; nothing
   * is persisted, so there's no cursor/resume concept. */
  folder: SyncableFolderId;
}

export interface EmailListItem {
  providerMessageId: string;
  threadId: string | null;
  subject: string;
  from: { name: string; email: string };
  previewText: string;
  sentAt: string;
  unread: boolean;
  starred: boolean;
}

export interface ListMessagesResult {
  messages: EmailListItem[];
}

export interface FetchMessageBodyParams {
  mailboxId: string;
  providerMessageId: string;
}

export interface FetchMessageBodyResult {
  subject: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  bodyHtml: string;
  bodyText: string;
  sentAt: string;
  /** Populated only by providers that can't determine folder any other way (Gmail -- comes for
   * free off the same `messages.get` call this body fetch already makes). Providers whose caller
   * already knows the folder (Graph -- encoded in the live email id) leave this undefined. */
  folder?: SyncableFolderId;
  unread: boolean;
  starred: boolean;
}

export interface ApplyFlagsParams {
  mailboxId: string;
  providerMessageId: string;
  flags: { starred?: boolean; unread?: boolean };
}

export interface MoveToFolderParams {
  mailboxId: string;
  providerMessageId: string;
  folder: FolderId;
}

/**
 * One abstraction over "the connected mailbox provider" so callers don't need provider-specific
 * branches. `listMessages`/`fetchMessageBody` are always live, uncached provider calls -- nothing
 * they return is ever persisted.
 */
export interface ProviderAdapter {
  sendMail(supabase: SupabaseClient, params: SendMailParams): Promise<SendMailResult>;
  listMessages(
    supabase: SupabaseClient,
    params: ListMessagesParams
  ): Promise<ListMessagesResult>;
  fetchMessageBody(
    supabase: SupabaseClient,
    params: FetchMessageBodyParams
  ): Promise<FetchMessageBodyResult>;
  applyFlags(supabase: SupabaseClient, params: ApplyFlagsParams): Promise<void>;
  moveToFolder(supabase: SupabaseClient, params: MoveToFolderParams): Promise<void>;
}

export class ProviderMethodNotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(`${method} is not implemented yet for provider "${provider}" (lands in a later module)`);
    this.name = "ProviderMethodNotImplementedError";
  }
}
