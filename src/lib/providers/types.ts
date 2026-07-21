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

export interface FetchMessagesParams {
  mailboxId: string;
  /** "backfill" pages through full history; "poll" fetches only what changed since `cursor`. */
  mode: "backfill" | "poll";
  /** Opaque, provider-defined. Omit/null only on a mailbox's very first backfill call. */
  cursor?: string | null;
}

export interface FetchMessagesResult {
  messages: { providerMessageId: string; threadId?: string | null; folder?: SyncableFolderId }[];
  /** Persist to `sync_state` after EVERY call (both modes), not just when `hasMore` goes false --
   * this is what lets a crashed backfill resume without redoing already-processed pages. */
  nextCursor: string | null;
  /** true => caller must call fetchMessages again with `nextCursor` before this run is done. */
  hasMore: boolean;
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
  /** Populated only by providers that can't determine folder during fetchMessages (Gmail --
   * comes for free off the same `messages.get` call this body fetch already makes). Providers
   * that resolve folder during fetchMessages (Graph) leave this undefined. */
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
 * One abstraction over "the connected mailbox provider" so callers (send route today, sync/
 * write-back jobs in later modules) don't need provider-specific branches. `fetchMessages`,
 * `fetchMessageBody`, `applyFlags`, and `moveToFolder` are declared now so the interface shape
 * is stable, but aren't implemented until Modules 6/7 actually need them.
 */
export interface ProviderAdapter {
  sendMail(supabase: SupabaseClient, params: SendMailParams): Promise<SendMailResult>;
  fetchMessages(
    supabase: SupabaseClient,
    params: FetchMessagesParams
  ): Promise<FetchMessagesResult>;
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
