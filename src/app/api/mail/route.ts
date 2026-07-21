import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getProviderAdapter } from "@/lib/providers";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";
import { shapeLiveEmailListItem } from "@/lib/mail/live-shape";
import type { SyncableFolderId } from "@/lib/providers/types";
import type { Email } from "@/types";

const listQuerySchema = z.object({
  mailboxId: z.string().uuid(),
  folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).optional(),
});

// Every folder except "sent" is fetched live from the provider -- "sent" is the only folder this
// app ever writes to Postgres itself (Module 3's send path), since read-receipt tracking has
// nowhere else to live.
const LIVE_FOLDERS: SyncableFolderId[] = ["inbox", "drafts", "archive", "trash"];

async function fetchSentEmails(supabase: SupabaseClient, mailboxId: string): Promise<Email[]> {
  const { data, error } = await supabase
    .from("emails")
    .select(MAIL_SELECT)
    .eq("mailbox_id", mailboxId)
    .eq("folder", "sent");

  if (error) throw new Error(`Failed to load sent mail: ${error.message}`);
  return (data as unknown as EmailRow[]).map(shapeEmail);
}

async function fetchLiveEmails(
  supabase: SupabaseClient,
  mailboxId: string,
  provider: string,
  folder: SyncableFolderId
): Promise<Email[]> {
  const adapter = getProviderAdapter(provider);
  const { messages } = await adapter.listMessages(supabase, { mailboxId, folder });
  return messages.map((item) => shapeLiveEmailListItem(mailboxId, folder, item));
}

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

  const { mailboxId, folder } = parsed.data;

  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("provider")
    .eq("id", mailboxId)
    .maybeSingle<{ provider: string }>();

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  try {
    let emails: Email[];

    if (folder === "sent") {
      emails = await fetchSentEmails(supabase, mailboxId);
    } else if (folder) {
      emails = await fetchLiveEmails(supabase, mailboxId, mailbox.provider, folder);
    } else {
      // No folder specified -- the frontend loads an entire account in one call and filters
      // client-side, so fetch sent (DB) plus every live folder and merge.
      const results = await Promise.all([
        fetchSentEmails(supabase, mailboxId),
        ...LIVE_FOLDERS.map((f) => fetchLiveEmails(supabase, mailboxId, mailbox.provider, f)),
      ]);
      emails = results.flat();
    }

    emails.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
    return NextResponse.json(emails);
  } catch (err) {
    console.error("GET /api/mail failed", err);
    return NextResponse.json({ error: "Failed to load mail" }, { status: 502 });
  }
}
