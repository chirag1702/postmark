const MICROSOFT_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export const MICROSOFT_OAUTH_SCOPES = [
  "Mail.Send",
  "Mail.Read",
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
];

export interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date: number; // ms epoch -- mirrors googleapis' Credentials.expiry_date shape
  scope?: string;
}

export function buildMicrosoftAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.MICROSOFT_OAUTH_REDIRECT_URI!,
    response_mode: "query",
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
    state,
    prompt: "consent",
  });
  return `${MICROSOFT_AUTHORIZE_URL}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function requestToken(body: URLSearchParams): Promise<MicrosoftTokens> {
  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft token endpoint error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as RawTokenResponse;
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expiry_date: Date.now() + json.expires_in * 1000,
    scope: json.scope,
  };
}

export function exchangeCodeForTokens(code: string): Promise<MicrosoftTokens> {
  return requestToken(
    new URLSearchParams({
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MICROSOFT_OAUTH_REDIRECT_URI!,
    })
  );
}

export function refreshMicrosoftAccessToken(refreshToken: string): Promise<MicrosoftTokens> {
  return requestToken(
    new URLSearchParams({
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MICROSOFT_OAUTH_SCOPES.join(" "),
    })
  );
}

interface GraphUser {
  mail: string | null;
  userPrincipalName: string;
}

export async function fetchMicrosoftUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Microsoft Graph /me failed: ${res.status}`);
  const data = (await res.json()) as GraphUser;
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Microsoft did not return an email address");
  return email;
}
