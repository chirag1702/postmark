import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncMailboxProvider = "gmail" | "outlook";

export interface SyncStateRow {
  last_history_id: string | null;
  last_delta_link: string | null;
  backfill_complete: boolean;
}

export async function getSyncState(
  admin: SupabaseClient,
  mailboxId: string
): Promise<SyncStateRow | null> {
  const { data } = await admin
    .from("sync_state")
    .select("last_history_id, last_delta_link, backfill_complete")
    .eq("mailbox_id", mailboxId)
    .maybeSingle<SyncStateRow>();
  return data;
}

/** Persists the provider-specific cursor into the one `sync_state` column that provider
 * actually uses (Gmail's historyId vs. Graph's JSON-encoded per-folder delta-link map), plus
 * `last_synced_at`/`backfill_complete`. Called after every page during backfill and after every
 * poll tick. */
export async function checkpointSyncState(
  admin: SupabaseClient,
  mailboxId: string,
  provider: SyncMailboxProvider,
  cursor: string | null,
  backfillComplete: boolean
): Promise<void> {
  const cursorColumn = provider === "gmail" ? "last_history_id" : "last_delta_link";
  await admin
    .from("sync_state")
    .update({
      [cursorColumn]: cursor,
      backfill_complete: backfillComplete,
      last_synced_at: new Date().toISOString(),
    })
    .eq("mailbox_id", mailboxId);
}
