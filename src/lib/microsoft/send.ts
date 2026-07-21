import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./token-refresh";

export interface SendOutlookMessageParams {
  mailboxId: string;
  from: string; // unused -- Graph infers the sender from the authenticated /me mailbox
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string; // unused -- Graph's message.body only carries one contentType; HTML is sent
  headers?: Record<string, string>; // unused -- send/route.ts never populates this today
}

export interface SendOutlookMessageResult {
  messageId: string | null; // Graph sendMail returns 202 with no body; no id is available
  threadId: string | null;
}

function toRecipients(addresses?: string[]) {
  return (addresses ?? []).map((email) => ({ emailAddress: { address: email } }));
}

/**
 * Sends a message through Microsoft Graph on behalf of an already-connected mailbox. `supabase`
 * must be the caller's request-scoped, RLS-bound client -- RLS on both `mailboxes` and
 * `oauth_tokens` ensures a caller can only send from their own mailbox.
 */
export async function sendOutlookMessage(
  supabase: SupabaseClient,
  params: SendOutlookMessageParams
): Promise<SendOutlookMessageResult> {
  const accessToken = await getValidAccessToken(supabase, params.mailboxId);

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "HTML", content: params.html },
        toRecipients: toRecipients(params.to),
        ccRecipients: toRecipients(params.cc),
        bccRecipients: toRecipients(params.bcc),
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph sendMail failed: ${res.status} ${text}`);
  }

  return { messageId: null, threadId: null };
}
