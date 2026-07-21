import { randomBytes } from "node:crypto";

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}
