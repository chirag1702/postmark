import { getBoss } from "@/lib/queue/boss";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SYNC_BACKFILL_QUEUE,
  MAIL_WRITEBACK_QUEUE,
  type SyncBackfillJobData,
  type MailWritebackJobData,
} from "./queue-names";

/**
 * Ensures a `sync_state` row exists for the mailbox (backfill_complete reset to false) and
 * enqueues its backfill job. Used both right after a mailbox is created (Gmail/Microsoft OAuth
 * callbacks) and by the manual re-trigger route -- the upsert's reset-to-false doubles as the
 * "resync" reset, so callers never need a separate step for that.
 *
 * Runs on the admin (service-role) client: this is called from the OAuth callback route (which
 * does have a user session) and, more importantly, needs to work identically when invoked from
 * a self-healing poll job that has no session at all -- so it always uses the RLS-bypassing
 * client rather than assuming a caller-supplied one.
 */
export async function enqueueBackfillJob(mailboxId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: mailbox, error } = await admin
    .from("mailboxes")
    .select("provider")
    .eq("id", mailboxId)
    .single();

  if (error || !mailbox) {
    throw new Error(`Cannot enqueue backfill: mailbox ${mailboxId} not found`);
  }

  const { error: upsertError } = await admin
    .from("sync_state")
    .upsert(
      { mailbox_id: mailboxId, provider: mailbox.provider, backfill_complete: false },
      { onConflict: "mailbox_id" }
    );

  if (upsertError) {
    throw new Error(`Failed to reset sync_state for mailbox ${mailboxId}: ${upsertError.message}`);
  }

  const boss = await getBoss();
  await boss.send(
    SYNC_BACKFILL_QUEUE,
    { mailboxId } satisfies SyncBackfillJobData,
    { singletonKey: mailboxId }
  );
}

/** Enqueues a provider write-back for a local star/unread/folder change. Fire-and-forget from
 * the caller's perspective -- the PATCH route awaits this only to catch enqueue-time failures
 * (e.g. pg-boss unreachable), not the provider round-trip itself, which happens later in the
 * standalone worker. */
export async function enqueueMailWritebackJob(data: MailWritebackJobData): Promise<void> {
  const boss = await getBoss();
  await boss.send(MAIL_WRITEBACK_QUEUE, data satisfies MailWritebackJobData);
}
