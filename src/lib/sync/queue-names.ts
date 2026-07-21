import type { FolderId } from "@/types";

export const SYNC_BACKFILL_QUEUE = "sync.backfill";
export const SYNC_POLL_QUEUE = "sync.poll";
export const SYNC_POLL_DISPATCH_QUEUE = "sync.poll-dispatch";
export const MAIL_WRITEBACK_QUEUE = "mail.writeback";

export interface SyncBackfillJobData {
  mailboxId: string;
}

export interface SyncPollJobData {
  mailboxId: string;
}

export type SyncPollDispatchJobData = Record<string, never>;

export interface MailWritebackJobData {
  mailboxId: string;
  providerMessageId: string;
  patch: { starred?: boolean; unread?: boolean; folder?: FolderId };
}
