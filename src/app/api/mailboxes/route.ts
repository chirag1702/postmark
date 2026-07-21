import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAILBOX_SELECT, shapeMailbox, type MailboxRow } from "@/lib/mailboxes/shape";
import { getUnlockedMailboxIds } from "@/lib/mailboxes/session-unlocks";

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
    .select(MAILBOX_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load mailboxes" }, { status: 500 });
  }

  const unlockedMailboxIds = await getUnlockedMailboxIds(supabase, user.id);

  return NextResponse.json(
    data.map((m) => shapeMailbox(m as unknown as MailboxRow, unlockedMailboxIds))
  );
}
