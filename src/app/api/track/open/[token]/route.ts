import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { transparentGifBuffer } from "@/lib/tracking/pixel";

const paramsSchema = z.object({ token: z.string().uuid() });

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

// Public, unauthenticated -- this is a tracking pixel loaded by a recipient's mail client.
// Always returns the pixel, even on an invalid token or a DB error: rendering the image must
// never fail because of a tracking hiccup.
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/track/open/[token]">
) {
  const { token } = await params;
  const parsed = paramsSchema.safeParse({ token });

  if (parsed.success) {
    try {
      await createAdminClient().rpc("record_tracking_open", {
        p_token: parsed.data.token,
      });
    } catch {
      // Swallow -- never break pixel rendering because of a tracking failure.
    }
  }

  return new NextResponse(new Blob([transparentGifBuffer()]), { headers: PIXEL_HEADERS });
}
