import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ pin: z.string().min(1) });

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/mailboxes/[id]/unlock">
) {
  const { id } = await params;
  const paramsParsed = paramsSchema.safeParse({ id });
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid mailbox id" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const bodyParsed = bodySchema.safeParse(json);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: mailbox, error: mailboxError } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("id", paramsParsed.data.id)
    .eq("user_id", user.id)
    .single();
  if (mailboxError || !mailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  const { data: pinOk, error: pinError } = await supabase.rpc("verify_lock_pin", {
    p_mailbox_id: mailbox.id,
    p_pin: bodyParsed.data.pin,
  });
  if (pinError || !pinOk) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims?.session_id as string | undefined;
  if (claimsError || !sessionId) {
    return NextResponse.json({ error: "Failed to unlock mailbox" }, { status: 500 });
  }

  const { error: upsertError } = await supabase
    .from("session_unlocks")
    .upsert(
      { session_id: sessionId, mailbox_id: mailbox.id, user_id: user.id },
      { onConflict: "session_id,mailbox_id" }
    );
  if (upsertError) {
    return NextResponse.json({ error: "Failed to unlock mailbox" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
