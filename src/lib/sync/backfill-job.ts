import type PgBoss from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAdapter } from "@/lib/providers";
import { processMessagePage } from "./normalize";
import { checkpointSyncState, type SyncMailboxProvider } from "./sync-state";
import type { SyncBackfillJobData } from "./queue-names";

/**
 * Runs a mailbox's full history backfill to completion in one job execution, checkpointing
 * `sync_state` after every page (so an operator can see progress via `last_synced_at` even
 * mid-run, and so `sync.poll` never starts against a stale mailbox).
 *
 * Always starts from a fresh cursor rather than resuming a prior partial attempt: a crash mid-
 * backfill (or a manual re-trigger) just restarts from page 1, which is safe because
 * `processMessagePage`'s upsert is idempotent -- already-synced messages are cheap no-ops on
 * replay. This sidesteps a real ambiguity a "resume from checkpoint" design would hit: once
 * `backfill_complete` flips true, the same cursor column is reinterpreted as the poll cursor, so
 * a stale in-progress-backfill cursor can't be safely distinguished from a finished backfill's
 * poll cursor using only the existing `sync_state` columns.
 */
export async function handleBackfillJob(jobs: PgBoss.Job<SyncBackfillJobData>[]): Promise<void> {
  const admin = createAdminClient();

  for (const job of jobs) {
    const { mailboxId } = job.data;

    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("provider")
      .eq("id", mailboxId)
      .maybeSingle<{ provider: SyncMailboxProvider }>();

    if (!mailbox) continue; // mailbox was disconnected/deleted since this job was enqueued

    const adapter = getProviderAdapter(mailbox.provider);

    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const result = await adapter.fetchMessages(admin, { mailboxId, mode: "backfill", cursor });
      await processMessagePage(admin, mailboxId, result.messages, adapter);
      cursor = result.nextCursor;
      hasMore = result.hasMore;
      await checkpointSyncState(admin, mailboxId, mailbox.provider, cursor, !hasMore);
    }
  }
}
