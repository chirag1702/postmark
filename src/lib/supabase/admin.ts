import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS entirely. Import this only from the public,
 * unauthenticated /api/track/* routes (no user session exists when an email client loads a
 * tracking pixel) and from the standalone `scripts/worker.ts` pg-boss process (Module 6+ sync/
 * write-back jobs, which also have no user session -- they run outside any request at all).
 * Never use this in a user-facing/authenticated Route Handler that has a real request-scoped
 * session available via `@/lib/supabase/server`.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
