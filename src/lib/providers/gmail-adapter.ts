import { sendGmailMessage } from "@/lib/gmail/send";
import { listGmailMessages, fetchGmailMessageBody } from "@/lib/gmail/sync";
import { applyGmailFlags, moveGmailMessageToFolder } from "@/lib/gmail/actions";
import type { ProviderAdapter } from "./types";

export const gmailAdapter: ProviderAdapter = {
  sendMail: (supabase, params) => sendGmailMessage(supabase, params),
  listMessages: (supabase, params) => listGmailMessages(supabase, params),
  fetchMessageBody: (supabase, params) => fetchGmailMessageBody(supabase, params),
  applyFlags: (supabase, params) => applyGmailFlags(supabase, params),
  moveToFolder: (supabase, params) => moveGmailMessageToFolder(supabase, params),
};
