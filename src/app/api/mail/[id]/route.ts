import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAdapter, ProviderMethodNotImplementedError } from "@/lib/providers";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";

const paramsSchema = z.object({ id: z.string().uuid() });

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
  const parsedParams = paramsSchema.safeParse({ id });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
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
    .from("emails")
    .select(MAIL_SELECT)
    .eq("id", parsedParams.data.id)
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
  const parsedParams = paramsSchema.safeParse({ id });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
  }

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

  const { data, error } = await supabase
    .from("emails")
    .update(parsedBody.data)
    .eq("id", parsedParams.data.id)
    .select(MAIL_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const row = data as unknown as EmailRow;

  // Sent mail has no provider_message_id (Module 3's send path doesn't persist the Gmail/Graph
  // message id it gets back), so there's nothing addressable to write back to for those rows.
  if (row.provider_message_id) {
    const mailboxId = row.mailbox_id;
    const providerMessageId = row.provider_message_id;
    const patch = parsedBody.data;

    after(async () => {
      const admin = createAdminClient();
      const { data: mailbox } = await admin
        .from("mailboxes")
        .select("provider")
        .eq("id", mailboxId)
        .maybeSingle<{ provider: "gmail" | "outlook" }>();
      if (!mailbox) return; // mailbox was disconnected/deleted since this PATCH was issued

      const adapter = getProviderAdapter(mailbox.provider);
      try {
        if (patch.starred !== undefined || patch.unread !== undefined) {
          await adapter.applyFlags(admin, {
            mailboxId,
            providerMessageId,
            flags: { starred: patch.starred, unread: patch.unread },
          });
        }
        if (patch.folder !== undefined) {
          await adapter.moveToFolder(admin, { mailboxId, providerMessageId, folder: patch.folder });
        }
      } catch (err) {
        if (err instanceof ProviderMethodNotImplementedError) {
          console.warn(`mail write-back: skipping unsupported action -- ${err.message}`);
          return;
        }
        console.error("Deferred mail write-back failed", err);
      }
    });
  }

  return NextResponse.json(shapeEmail(row));
}
