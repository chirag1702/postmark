import type { SupabaseClient } from "@supabase/supabase-js";
import { createGoogleOAuthClient } from "./oauth-client";
import { encryptToken, decryptToken } from "@/lib/crypto/token-cipher";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if expiring within 5 minutes

interface OAuthTokenRow {
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
}

/**
 * Returns a valid plaintext Gmail access token for the given mailbox, refreshing and
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
  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token || !credentials.expiry_date) {
    throw new Error("Failed to refresh Gmail access token");
  }

  await supabase
    .from("oauth_tokens")
    .update({
      access_token_enc: encryptToken(credentials.access_token),
      refresh_token_enc: credentials.refresh_token
        ? encryptToken(credentials.refresh_token)
        : row.refresh_token_enc,
      expires_at: new Date(credentials.expiry_date).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("mailbox_id", mailboxId);

  return credentials.access_token;
}
