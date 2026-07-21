import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ token: z.string().uuid() });

function fallbackUrl(request: NextRequest) {
  return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "/", request.url);
}

// Public, unauthenticated -- this is the redirect target of a CTA link rewritten at send time.
// Always 302s somewhere sane, even on an invalid token or a missing cta_href: a clicked link
// must never dead-end in a 4xx.
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/track/click/[token]">
) {
  const { token } = await params;
  const parsed = paramsSchema.safeParse({ token });

  if (!parsed.success) {
    return NextResponse.redirect(fallbackUrl(request), 302);
  }

  try {
    const { data: href } = await createAdminClient().rpc(
      "record_tracking_click",
      { p_token: parsed.data.token }
    );

    if (typeof href === "string" && href) {
      return NextResponse.redirect(href, 302);
    }
  } catch {
    // Fall through to the fallback redirect below.
  }

  return NextResponse.redirect(fallbackUrl(request), 302);
}
