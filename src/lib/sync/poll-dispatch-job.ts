import { createAdminClient } from "@/lib/supabase/admin";
import { getBoss } from "@/lib/queue/boss";
import { SYNC_POLL_QUEUE, type SyncPollJobData } from "./queue-names";

/**
 * Cron-triggered fan-out (every 5 minutes, see `register-jobs.ts`): enqueues one `sync.poll` job
 * per mailbox that's finished backfilling, rather than looping every mailbox inline in this one
 * job -- keeps retry/failure isolated per mailbox, so one broken mailbox's Gmail/Graph error
 * doesn't block anyone else's poll from running.
 */
export async function handlePollDispatchJob(): Promise<void> {
  const admin = createAdminClient();
  const { data: mailboxes } = await admin
    .from("sync_state")
    .select("mailbox_id")
    .eq("backfill_complete", true);

  if (!mailboxes || mailboxes.length === 0) return;

  const boss = await getBoss();
  await Promise.all(
    mailboxes.map((m) =>
      boss.send(
        SYNC_POLL_QUEUE,
        { mailboxId: m.mailbox_id } satisfies SyncPollJobData,
        { singletonKey: m.mailbox_id }
      )
    )
  );
}
