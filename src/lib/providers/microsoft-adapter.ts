import { sendOutlookMessage } from "@/lib/microsoft/send";
import { listGraphMessages, fetchGraphMessageBody } from "@/lib/microsoft/sync";
import { applyGraphFlags, moveGraphMessageToFolder } from "@/lib/microsoft/actions";
import type { ProviderAdapter } from "./types";

export const microsoftAdapter: ProviderAdapter = {
  sendMail: (supabase, params) => sendOutlookMessage(supabase, params),
  listMessages: (supabase, params) => listGraphMessages(supabase, params),
  fetchMessageBody: (supabase, params) => fetchGraphMessageBody(supabase, params),
  applyFlags: (supabase, params) => applyGraphFlags(supabase, params),
  moveToFolder: (supabase, params) => moveGraphMessageToFolder(supabase, params),
};
