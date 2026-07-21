import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";

const listQuerySchema = z.object({
  mailboxId: z.string().uuid(),
  folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  let query = supabase
    .from("emails")
    .select(MAIL_SELECT)
    .eq("mailbox_id", parsed.data.mailboxId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (parsed.data.folder) {
    query = query.eq("folder", parsed.data.folder);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load mail" }, { status: 500 });
  }

  return NextResponse.json((data as unknown as EmailRow[]).map(shapeEmail));
}
