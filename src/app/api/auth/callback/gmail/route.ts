import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  GMAIL_OAUTH_SCOPES,
} from "@/lib/gmail/oauth-client";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state";
import { encryptToken } from "@/lib/crypto/token-cipher";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function redirectWithReason(request: NextRequest, reason: string) {
  const res = NextResponse.redirect(
    new URL(`/mail?mailbox=error&reason=${reason}&provider=gmail`, request.url)
  );
  res.cookies.delete(GMAIL_OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const parsed = callbackQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return redirectWithReason(request, "unknown");
  }
  const { code, state, error } = parsed.data;

  if (error) {
    return redirectWithReason(request, "denied");
  }

  const cookieState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithReason(request, "state_mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      return redirectWithReason(request, "no_refresh_token");
    }

    const email = await fetchGoogleUserEmail(tokens.access_token);

    const { data: mailbox, error: rpcError } = await supabase.rpc("create_gmail_mailbox", {
      p_email: email,
      p_access_token_enc: encryptToken(tokens.access_token),
      p_refresh_token_enc: encryptToken(tokens.refresh_token),
      p_expires_at: new Date(tokens.expiry_date).toISOString(),
      p_scope: tokens.scope ?? GMAIL_OAUTH_SCOPES.join(" "),
    });

    if (rpcError || !mailbox) {
      const reason = rpcError?.code === "23505" ? "already_linked" : "unknown";
      return redirectWithReason(request, reason);
    }

    const admin = createAdminClient();
    const { error: syncStateError } = await admin
      .from("sync_state")
      .upsert(
        { mailbox_id: mailbox.id, provider: "gmail", backfill_complete: false },
        { onConflict: "mailbox_id" }
      );
    if (syncStateError) {
      // Don't block the OAuth flow on this -- the mailbox is connected either way; worst case
      // is the mailbox never shows the "setting up" state and stays empty until a manual resync.
      console.error("Failed to initialize sync_state", syncStateError);
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    after(async () => {
      try {
        await fetch(`${origin}/api/internal/sync/${mailbox.id}/backfill`, {
          method: "POST",
          headers: { "x-internal-sync-secret": process.env.INTERNAL_SYNC_SECRET ?? "" },
        });
      } catch (err) {
        console.error("Deferred initial backfill request failed", err);
      }
    });

    const res = NextResponse.redirect(
      new URL("/mail?mailbox=connected&provider=gmail", request.url)
    );
    res.cookies.delete(GMAIL_OAUTH_STATE_COOKIE);
    return res;
  } catch {
    return redirectWithReason(request, "unknown");
  }
}
