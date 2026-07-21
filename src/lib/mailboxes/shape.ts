import type { Mailbox } from "@/types";

export const MAILBOX_SELECT =
  "id, email, provider, is_default, send_pin_hash, lock_pin_hash";

export interface MailboxRow {
  id: string;
  email: string;
  provider: string;
  is_default: boolean;
  send_pin_hash: string | null;
  lock_pin_hash: string | null;
}

/** Shared DB-row -> client `Mailbox` mapper, used by both `GET /api/mailboxes` and the `/mail`
 * layout's initial server-side hydration, so this shaping logic can't drift between the two call
 * sites. */
export function shapeMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    email: row.email,
    provider: row.provider as Mailbox["provider"],
    isDefault: row.is_default,
    sendPin: row.send_pin_hash ? "set" : null,
    lockPin: row.lock_pin_hash ? "set" : null,
    locked: false,
  };
}
