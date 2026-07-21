import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseAddressList } from "@/lib/utils";
import { buildOutboundBody } from "@/lib/mail/compose";
import { MAIL_SELECT, shapeEmail, type EmailRow } from "@/lib/mail/shape";
import { getProviderAdapter } from "@/lib/providers";
import type { EmailAddress } from "@/types";

const sendMailSchema = z.object({
  mailboxId: z.string().uuid(),
  to: z.string().trim().min(1),
  cc: z.string().trim().optional(),
  bcc: z.string().trim().optional(),
  subject: z.string().trim().optional().default(""),
  body: z.string(),
  trackingEnabled: z.boolean(),
  pin: z.string().optional(),
});

interface TokenPair {
  recipientEmail: string;
  tokenId: string;
}

function baseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

function pixelTag(origin: string, tokenId: string) {
  return `<img src="${origin}/api/track/open/${tokenId}" width="1" height="1" alt="" style="display:none" />`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = sendMailSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = parsed.data;

  const { data: mailbox, error: mailboxError } = await supabase
    .from("mailboxes")
    .select("id, email, provider, send_pin_hash")
    .eq("id", input.mailboxId)
    .eq("user_id", user.id)
    .single();

  if (mailboxError || !mailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  if (mailbox.send_pin_hash) {
    if (!input.pin) {
      return NextResponse.json({ error: "PIN required" }, { status: 400 });
    }
    const { data: pinOk, error: pinError } = await supabase.rpc("verify_send_pin", {
      p_mailbox_id: mailbox.id,
      p_pin: input.pin,
    });
    if (pinError || !pinOk) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 403 });
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const to = parseAddressList(input.to);
  const cc = input.cc ? parseAddressList(input.cc) : [];
  const bcc = input.bcc ? parseAddressList(input.bcc) : [];
  if (to.length === 0) {
    return NextResponse.json({ error: "No valid recipients" }, { status: 400 });
  }
  const subject = input.subject || "(no subject)";
  const { bodyHtml, bodyText, previewText } = buildOutboundBody(input.body);

  const { data: created, error: createError } = await supabase.rpc("create_sent_email", {
    p_mailbox_id: mailbox.id,
    p_subject: subject,
    p_from_name: profile?.name ?? "",
    p_from_email: mailbox.email,
    p_body_html: bodyHtml,
    p_body_text: bodyText,
    p_preview_text: previewText,
    p_to: to,
    p_cc: cc,
    p_bcc: bcc,
    p_tracking_enabled: input.trackingEnabled,
  });

  if (createError || !created) {
    return NextResponse.json({ error: "Failed to persist email" }, { status: 500 });
  }

  const { emailId, tokens } = created as { emailId: string; tokens: TokenPair[] };
  const origin = baseUrl(request);

  const toEmailAddresses = (list: EmailAddress[]) =>
    list.length > 0 ? list.map((r) => r.email) : undefined;

  const providerAdapter = getProviderAdapter(mailbox.provider);
  let sendResults: PromiseSettledResult<unknown>[];

  if (input.trackingEnabled && tokens.length > 0) {
    sendResults = await Promise.allSettled(
      to.map((recipient, index) => {
        const token = tokens.find((t) => t.recipientEmail === recipient.email);
        const html = token ? `${bodyHtml}\n${pixelTag(origin, token.tokenId)}` : bodyHtml;

        return providerAdapter.sendMail(supabase, {
          mailboxId: mailbox.id,
          from: mailbox.email,
          to: [recipient.email],
          cc: index === 0 ? toEmailAddresses(cc) : undefined,
          bcc: index === 0 ? toEmailAddresses(bcc) : undefined,
          subject,
          html,
          text: bodyText,
        });
      })
    );
  } else {
    sendResults = await Promise.allSettled([
      providerAdapter.sendMail(supabase, {
        mailboxId: mailbox.id,
        from: mailbox.email,
        to: to.map((r) => r.email),
        cc: toEmailAddresses(cc),
        bcc: toEmailAddresses(bcc),
        subject,
        html: bodyHtml,
        text: bodyText,
      }),
    ]);
  }

  const allFailed = sendResults.every((r) => r.status === "rejected");
  if (allFailed) {
    await supabase.rpc("delete_email", { p_email_id: emailId });
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("emails")
    .select(MAIL_SELECT)
    .eq("id", emailId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Sent, but failed to load email" }, { status: 500 });
  }

  return NextResponse.json(shapeEmail(row as unknown as EmailRow));
}
