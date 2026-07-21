import type { Mailbox } from "@/types";

export const MAILBOX_SELECT =
  "id, email, provider, is_default, send_pin_hash, lock_pin_hash, sync_state(backfill_complete)";

interface SyncStateEmbed {
  backfill_complete: boolean;
}

export interface MailboxRow {
  id: string;
  email: string;
  provider: string;
  is_default: boolean;
  send_pin_hash: string | null;
  lock_pin_hash: string | null;
  sync_state: SyncStateEmbed | SyncStateEmbed[] | null;
}

/** Shared DB-row -> client `Mailbox` mapper, used by both `GET /api/mailboxes` and the `/mail`
 * layout's initial server-side hydration, so this shaping logic can't drift between the two call
 * sites again -- that exact drift (the layout's own ad hoc query never joining `sync_state`) is
 * what made the "setting up" screen never appear after connecting a mailbox. */
export function shapeMailbox(row: MailboxRow): Mailbox {
  const syncState = Array.isArray(row.sync_state) ? row.sync_state[0] : row.sync_state;
  return {
    id: row.id,
    email: row.email,
    provider: row.provider as Mailbox["provider"],
    isDefault: row.is_default,
    sendPin: row.send_pin_hash ? "set" : null,
    lockPin: row.lock_pin_hash ? "set" : null,
    locked: false,
    backfillComplete: syncState?.backfill_complete ?? false,
  };
}
