import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import mailcomposer from "mailcomposer";
import { createGoogleOAuthClient } from "./oauth-client";
import { getValidAccessToken } from "./token-refresh";

export interface SendGmailMessageParams {
  mailboxId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendGmailMessageResult {
  messageId: string;
  threadId: string;
}

function buildRawMessage(params: SendGmailMessageParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const message = mailcomposer({
      from: params.from,
      to: params.to.join(", "),
      cc: params.cc?.join(", "),
      bcc: params.bcc?.join(", "),
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
    });

    message.build((err, buffer) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(
        buffer
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
      );
    });
  });
}

/**
 * Sends a message through Gmail on behalf of an already-connected mailbox. `supabase` must be
 * the caller's request-scoped, RLS-bound client -- RLS on both `mailboxes` and `oauth_tokens`
 * ensures a caller can only send from their own mailbox.
 */
export async function sendGmailMessage(
  supabase: SupabaseClient,
  params: SendGmailMessageParams
): Promise<SendGmailMessageResult> {
  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  const raw = await buildRawMessage(params);

  const client = createGoogleOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: client });

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  if (!data.id || !data.threadId) {
    throw new Error("Gmail did not return a message id");
  }

  return { messageId: data.id, threadId: data.threadId };
}
