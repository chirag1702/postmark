import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProviderAdapter, ProviderMethodNotImplementedError } from "@/lib/providers";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";
import { isUuidEmailId, parseLiveEmailId, shapeLiveEmailDetail } from "@/lib/mail/live-shape";

const patchBodySchema = z
  .object({
    starred: z.boolean().optional(),
    folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).optional(),
    unread: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/mail/[id]">
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const live = parseLiveEmailId(id);
  if (live) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("provider")
      .eq("id", live.mailboxId)
      .maybeSingle<{ provider: string }>();
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    try {
      const adapter = getProviderAdapter(mailbox.provider);
      const body = await adapter.fetchMessageBody(supabase, {
        mailboxId: live.mailboxId,
        providerMessageId: live.providerMessageId,
      });
      return NextResponse.json(
        shapeLiveEmailDetail(live.mailboxId, live.folder, live.providerMessageId, body)
      );
    } catch (err) {
      console.error("GET /api/mail/[id] (live) failed", err);
      return NextResponse.json({ error: "Failed to load email" }, { status: 502 });
    }
  }

  if (!isUuidEmailId(id)) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("emails")
    .select(MAIL_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  return NextResponse.json(shapeEmail(data as unknown as EmailRow));
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/mail/[id]">
) {
  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsedBody = patchBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const live = parseLiveEmailId(id);
  if (live) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("provider")
      .eq("id", live.mailboxId)
      .maybeSingle<{ provider: string }>();
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    // No local row to update -- there's nothing to return early with, so this is a direct,
    // awaited provider write rather than a deferred `after()` one. The frontend has already
    // applied the change optimistically; this call is just the real write + confirmation.
    const adapter = getProviderAdapter(mailbox.provider);
    const patch = parsedBody.data;
    try {
      if (patch.starred !== undefined || patch.unread !== undefined) {
        await adapter.applyFlags(supabase, {
          mailboxId: live.mailboxId,
          providerMessageId: live.providerMessageId,
          flags: { starred: patch.starred, unread: patch.unread },
        });
      }
      if (patch.folder !== undefined) {
        await adapter.moveToFolder(supabase, {
          mailboxId: live.mailboxId,
          providerMessageId: live.providerMessageId,
          folder: patch.folder,
        });
      }
    } catch (err) {
      if (err instanceof ProviderMethodNotImplementedError) {
        return NextResponse.json({ error: err.message }, { status: 501 });
      }
      console.error("PATCH /api/mail/[id] (live) failed", err);
      return NextResponse.json({ error: "Failed to update email" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  if (!isUuidEmailId(id)) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("emails")
    .update(parsedBody.data)
    .eq("id", id)
    .select(MAIL_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  return NextResponse.json(shapeEmail(data as unknown as EmailRow));
}
