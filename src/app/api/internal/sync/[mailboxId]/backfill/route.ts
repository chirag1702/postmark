import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enqueueBackfillJob } from "@/lib/sync/enqueue";

const paramsSchema = z.object({ mailboxId: z.string().uuid() });

/** Authenticated, thin manual re-trigger for a mailbox's backfill (e.g. a future "resync"
 * button) -- the primary trigger path is the OAuth callback routes calling enqueueBackfillJob
 * directly in-process; this route exists for re-running it later. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/internal/sync/[mailboxId]/backfill">
) {
  const { mailboxId } = await params;
  const parsedParams = paramsSchema.safeParse({ mailboxId });
  if (!parsedParams.success) {
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

  const { data: mailbox, error: mailboxError } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("id", parsedParams.data.mailboxId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (mailboxError || !mailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  try {
    await enqueueBackfillJob(mailbox.id);
  } catch {
    return NextResponse.json({ error: "Failed to enqueue backfill" }, { status: 500 });
  }

  return NextResponse.json({ enqueued: true });
}
