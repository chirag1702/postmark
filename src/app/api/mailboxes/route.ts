import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mailboxes")
    .select(
      "id, email, provider, is_default, send_pin_hash, lock_pin_hash, sync_state(backfill_complete)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load mailboxes" }, { status: 500 });
  }

  return NextResponse.json(
    data.map((m) => {
      // Supabase's embedded-relation shape depends on whether it infers a to-one relationship;
      // `sync_state.mailbox_id` is a PK/unique FK so it should come back as an object, but a
      // freshly-connected mailbox may have no sync_state row yet at all -- default to `false`
      // (not ready), never `true`, when the row is missing.
      const syncState = Array.isArray(m.sync_state) ? m.sync_state[0] : m.sync_state;
      return {
        id: m.id,
        email: m.email,
        provider: m.provider,
        isDefault: m.is_default,
        sendPin: m.send_pin_hash ? "set" : null,
        lockPin: m.lock_pin_hash ? "set" : null,
        locked: false,
        backfillComplete: syncState?.backfill_complete ?? false,
      };
    })
  );
}
