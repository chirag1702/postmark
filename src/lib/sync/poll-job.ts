import type PgBoss from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAdapter } from "@/lib/providers";
import { processMessagePage } from "./normalize";
import { checkpointSyncState, getSyncState, type SyncMailboxProvider } from "./sync-state";
import { enqueueBackfillJob } from "./enqueue";
import { GmailHistoryGapError } from "@/lib/gmail/sync";
import type { SyncPollJobData } from "./queue-names";

/**
 * One incremental sync tick for a single mailbox. On Gmail's `HISTORY_GAP` (stale/invalid
 * `startHistoryId` -- the mailbox fell too far behind, e.g. worker was down past Gmail's ~1
 * week history retention), self-heals by resetting to a fresh backfill instead of retrying the
 * same doomed `startHistoryId` forever.
 */
export async function handlePollJob(jobs: PgBoss.Job<SyncPollJobData>[]): Promise<void> {
  const admin = createAdminClient();

  for (const job of jobs) {
    const { mailboxId } = job.data;

    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("provider")
      .eq("id", mailboxId)
      .maybeSingle<{ provider: SyncMailboxProvider }>();

    if (!mailbox) continue;

    const state = await getSyncState(admin, mailboxId);
    if (!state || !state.backfill_complete) continue; // dispatch only sends completed mailboxes; guard anyway

    const cursor = mailbox.provider === "gmail" ? state.last_history_id : state.last_delta_link;
    const adapter = getProviderAdapter(mailbox.provider);

    try {
      const result = await adapter.fetchMessages(admin, { mailboxId, mode: "poll", cursor });
      await processMessagePage(admin, mailboxId, result.messages, adapter);
      await checkpointSyncState(admin, mailboxId, mailbox.provider, result.nextCursor, true);
    } catch (err) {
      if (err instanceof GmailHistoryGapError) {
        await enqueueBackfillJob(mailboxId);
        continue;
      }
      throw err;
    }
  }
}
