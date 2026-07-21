import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMicrosoftAuthorizeUrl } from "@/lib/microsoft/oauth-client";
import { generateOAuthState, MICROSOFT_OAUTH_STATE_COOKIE } from "@/lib/microsoft/oauth-state";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = generateOAuthState();
  const response = NextResponse.redirect(buildMicrosoftAuthorizeUrl(state));
  response.cookies.set(MICROSOFT_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth",
  });
  return response;
}
