import { randomBytes } from "node:crypto";

export const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_oauth_state";

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}
