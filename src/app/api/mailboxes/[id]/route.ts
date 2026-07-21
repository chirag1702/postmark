import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/mailboxes/[id]">
) {
  const { id } = await params;
  const parsed = paramsSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mailbox id" }, { status: 400 });
  }

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
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Failed to unlink mailbox" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
