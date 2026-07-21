import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGmailAuthorizeUrl } from "@/lib/gmail/oauth-client";
import { generateOAuthState, GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = generateOAuthState();
  const response = NextResponse.redirect(buildGmailAuthorizeUrl(state));
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth",
  });
  return response;
}
