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
    .select("id, email, provider, is_default, send_pin_hash, lock_pin_hash")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load mailboxes" }, { status: 500 });
  }

  return NextResponse.json(
    data.map((m) => ({
      id: m.id,
      email: m.email,
      provider: m.provider,
      isDefault: m.is_default,
      sendPin: m.send_pin_hash ? "set" : null,
      lockPin: m.lock_pin_hash ? "set" : null,
      locked: false,
    }))
  );
}
