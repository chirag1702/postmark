import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./token-refresh";
import { GRAPH_BASE, graphPatch, graphPost } from "./sync";
import { ProviderMethodNotImplementedError } from "@/lib/providers/types";
import type { ApplyFlagsParams, MoveToFolderParams } from "@/lib/providers/types";

export async function applyGraphFlags(
  supabase: SupabaseClient,
  params: ApplyFlagsParams
): Promise<void> {
  const body: Record<string, unknown> = {};

  if (params.flags.unread !== undefined) body.isRead = !params.flags.unread;
  if (params.flags.starred !== undefined) {
    body.flag = { flagStatus: params.flags.starred ? "flagged" : "notFlagged" };
  }

  if (Object.keys(body).length === 0) return;

  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  await graphPatch(accessToken, `${GRAPH_BASE}/me/messages/${params.providerMessageId}`, body);
}

/** Only "archive" and "trash" are reachable from the UI (EmailToolbar has no restore-to-inbox
 * action), matching the well-known folder names Module 6's sync already uses. */
export async function moveGraphMessageToFolder(
  supabase: SupabaseClient,
  params: MoveToFolderParams
): Promise<void> {
  const destinationId =
    params.folder === "archive" ? "archive" : params.folder === "trash" ? "deleteditems" : null;

  if (!destinationId) {
    throw new ProviderMethodNotImplementedError("outlook", `moveToFolder(${params.folder})`);
  }

  const accessToken = await getValidAccessToken(supabase, params.mailboxId);
  await graphPost(
    accessToken,
    `${GRAPH_BASE}/me/messages/${params.providerMessageId}/move`,
    { destinationId }
  );
}
