import type { SupabaseClient } from "@supabase/supabase-js";
import { getGmailClient } from "./sync";
import { ProviderMethodNotImplementedError } from "@/lib/providers/types";
import type { ApplyFlagsParams, MoveToFolderParams } from "@/lib/providers/types";

export async function applyGmailFlags(
  supabase: SupabaseClient,
  params: ApplyFlagsParams
): Promise<void> {
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];

  if (params.flags.starred === true) addLabelIds.push("STARRED");
  if (params.flags.starred === false) removeLabelIds.push("STARRED");
  if (params.flags.unread === true) addLabelIds.push("UNREAD");
  if (params.flags.unread === false) removeLabelIds.push("UNREAD");

  if (addLabelIds.length === 0 && removeLabelIds.length === 0) return;

  const gmail = await getGmailClient(supabase, params.mailboxId);
  await gmail.users.messages.modify({
    userId: "me",
    id: params.providerMessageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
}

/** Only "archive" and "trash" are reachable from the UI (EmailToolbar has no restore-to-inbox
 * action), and Gmail trash/untrash isn't just a plain label add/remove -- it's a dedicated
 * endpoint -- so anything else deliberately stays unimplemented rather than guessed at. */
export async function moveGmailMessageToFolder(
  supabase: SupabaseClient,
  params: MoveToFolderParams
): Promise<void> {
  const gmail = await getGmailClient(supabase, params.mailboxId);

  if (params.folder === "trash") {
    await gmail.users.messages.trash({ userId: "me", id: params.providerMessageId });
    return;
  }

  if (params.folder === "archive") {
    await gmail.users.messages.modify({
      userId: "me",
      id: params.providerMessageId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    return;
  }

  throw new ProviderMethodNotImplementedError("gmail", `moveToFolder(${params.folder})`);
}
