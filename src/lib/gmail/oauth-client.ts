import { google } from "googleapis";

export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function buildGmailAuthorizeUrl(state: string): string {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_OAUTH_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const client = createGoogleOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Google did not return an email address");
  return data.email;
}
