-- Supabase's default privileges grant EXECUTE on new public-schema functions
-- directly to anon/authenticated (independent of the PUBLIC pseudo-role), so
-- the prior `revoke ... from public` didn't remove these. Trigger firing
-- doesn't depend on the invoking role's EXECUTE grant, so this is safe.
revoke execute on function public.handle_new_user() from anon, authenticated;
