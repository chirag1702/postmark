import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshMicrosoftAccessToken } from "./oauth-client";
import { encryptToken, decryptToken } from "@/lib/crypto/token-cipher";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if expiring within 5 minutes

interface OAuthTokenRow {
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
}

/**
 * Returns a valid plaintext Microsoft Graph access token for the given mailbox, refreshing and
 * persisting a new one first if the stored token is expired or near-expiry.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  mailboxId: string
): Promise<string> {
  const { data: row, error } = await supabase
    .from("oauth_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("mailbox_id", mailboxId)
    .single<OAuthTokenRow>();

  if (error || !row) {
    throw new Error("No OAuth tokens found for mailbox");
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
    return decryptToken(row.access_token_enc);
  }

  const refreshToken = decryptToken(row.refresh_token_enc);
  const tokens = await refreshMicrosoftAccessToken(refreshToken);

  if (!tokens.access_token) {
    throw new Error("Failed to refresh Microsoft access token");
  }

  await supabase
    .from("oauth_tokens")
    .update({
      access_token_enc: encryptToken(tokens.access_token),
      // Microsoft usually rotates the refresh token on refresh grants; keep the old one only
      // if Microsoft didn't send a new one.
      refresh_token_enc: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : row.refresh_token_enc,
      expires_at: new Date(tokens.expiry_date).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("mailbox_id", mailboxId);

  return tokens.access_token;
}
