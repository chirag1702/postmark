-- handle_new_user is a trigger function only; Postgres grants EXECUTE to
-- PUBLIC by default on new functions, which the db advisor flags as an
-- exposed /rest/v1/rpc/handle_new_user endpoint. Trigger firing does not
-- depend on the invoking role's EXECUTE grant, so this is safe to revoke.
revoke execute on function public.handle_new_user() from public;
