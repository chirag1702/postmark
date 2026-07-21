import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ pin: z.string().regex(/^\d{4,12}$/).nullable() });

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/mailboxes/[id]/send-pin">
) {
  const { id } = await params;
  const paramsParsed = paramsSchema.safeParse({ id });
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid mailbox id" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const bodyParsed = bodySchema.safeParse(json);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "PIN must be 4-12 digits" }, { status: 400 });
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

  const { error: rpcError } = await supabase.rpc("set_send_pin", {
    p_mailbox_id: mailbox.id,
    p_pin: bodyParsed.data.pin,
  });
  if (rpcError) {
    return NextResponse.json({ error: "Failed to update send PIN" }, { status: 500 });
  }

  return NextResponse.json({ sendPin: bodyParsed.data.pin === null ? null : "set" });
}
