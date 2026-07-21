import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAdapter } from "@/lib/providers";
import { processMessagePage } from "@/lib/sync/normalize";
import { checkpointSyncState, type SyncMailboxProvider } from "@/lib/sync/sync-state";

// Bounded per Module 6 (revised): this is an initial 10-day pull, not exhaustive history --
// a very high-volume mailbox's window could still page several times per provider, but should
// stay comfortably under this budget for the overwhelming majority of accounts.
export const maxDuration = 60;

const paramsSchema = z.object({ mailboxId: z.string().uuid() });

type AuthResult =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; status: number };

/**
 * Two ways in: (1) the OAuth callback's own server-to-server `after()` call, which has no
 * session at all and instead presents `x-internal-sync-secret`; (2) a real user session, scoped
 * to mailboxes they own (a future manual "resync" trigger). A present-but-wrong secret fails
 * closed immediately rather than falling through to the session path -- that fallthrough would
 * turn a wrong-secret guess into a session-cookie bypass probe.
 */
async function authorize(request: NextRequest, mailboxId: string): Promise<AuthResult> {
  const providedSecret = request.headers.get("x-internal-sync-secret");
  const expectedSecret = process.env.INTERNAL_SYNC_SECRET;

  if (providedSecret) {
    if (!expectedSecret) return { ok: false, status: 401 };
    const provided = Buffer.from(providedSecret);
    const expected = Buffer.from(expectedSecret);
    const isValid =
      provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (!isValid) return { ok: false, status: 401 };
    return { ok: true, supabase: createAdminClient() };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, status: 401 };

  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("id", mailboxId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mailbox) return { ok: false, status: 404 };

  // Writes always go through the admin client regardless of auth path -- sync runs long enough
  // (and, via the internal-secret path, entirely outside any session) that it shouldn't depend
  // on a cookie-bound client staying valid for the duration.
  return { ok: true, supabase: createAdminClient() };
}

/**
 * Does a mailbox's bounded (last 10 days) initial fetch-and-store synchronously, in this one
 * request: no queue, no worker. Invoked two ways -- server-to-server via the OAuth callback's
 * `after()` (fire-and-forget from the callback's perspective) right after connect, and later as
 * a manual "resync" trigger from an authenticated session. Always starts from a fresh cursor;
 * `processMessagePage`'s upsert is idempotent, so re-running this is always safe.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/internal/sync/[mailboxId]/backfill">
) {
  const { mailboxId } = await params;
  const parsedParams = paramsSchema.safeParse({ mailboxId });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid mailbox id" }, { status: 400 });
  }

  const auth = await authorize(request, parsedParams.data.mailboxId);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

  // `authorize` always hands back the admin client regardless of which path authorized the
  // request (see its own comment) -- reuse it rather than creating a second instance.
  const { data: mailbox } = await auth.supabase
    .from("mailboxes")
    .select("provider")
    .eq("id", parsedParams.data.mailboxId)
    .maybeSingle<{ provider: SyncMailboxProvider }>();

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  const adapter = getProviderAdapter(mailbox.provider);

  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const result = await adapter.fetchMessages(auth.supabase, {
      mailboxId: parsedParams.data.mailboxId,
      mode: "backfill",
      cursor,
    });
    await processMessagePage(auth.supabase, parsedParams.data.mailboxId, result.messages, adapter);
    cursor = result.nextCursor;
    hasMore = result.hasMore;
    await checkpointSyncState(auth.supabase, parsedParams.data.mailboxId, mailbox.provider, cursor, !hasMore);
  }

  return NextResponse.json({ backfillComplete: true });
}
