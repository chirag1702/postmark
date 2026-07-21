import type { SupabaseClient } from "@supabase/supabase-js";

/** Mailbox ids the *current session* has unlocked (Module 13). Reads the session_id claim off
 * the caller's own JWT via getClaims() and looks up matching session_unlocks rows -- shared by
 * both `GET /api/mailboxes` and the `/mail` layout's server-side hydration so this logic can't
 * drift between the two call sites, same rationale as shapeMailbox itself. */
export async function getUnlockedMailboxIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims?.session_id as string | undefined;
  if (!sessionId) return new Set();

  const { data, error } = await supabase
    .from("session_unlocks")
    .select("mailbox_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  if (error || !data) return new Set();
  return new Set(data.map((row) => row.mailbox_id as string));
}
