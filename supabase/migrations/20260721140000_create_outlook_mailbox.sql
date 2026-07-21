-- Atomically creates an Outlook (Microsoft Graph) mailbox + its token row in one transaction.
-- Mirrors create_gmail_mailbox (Module 2) for the second provider in scope (Module 4). Stays
-- security invoker (the default) so it enforces exactly the same auth.uid() ownership as two
-- manual inserts would.
create function public.create_outlook_mailbox(
  p_email text,
  p_access_token_enc text,
  p_refresh_token_enc text,
  p_expires_at timestamptz,
  p_scope text
) returns public.mailboxes
language plpgsql
set search_path = ''
as $$
declare
  v_mailbox public.mailboxes;
begin
  insert into public.mailboxes (user_id, email, provider, is_default)
  values (
    (select auth.uid()),
    p_email,
    'outlook',
    not exists (select 1 from public.mailboxes where user_id = (select auth.uid()))
  )
  returning * into v_mailbox;

  insert into public.oauth_tokens (mailbox_id, provider, access_token_enc, refresh_token_enc, expires_at, scope)
  values (v_mailbox.id, 'outlook', p_access_token_enc, p_refresh_token_enc, p_expires_at, p_scope);

  return v_mailbox;
end;
$$;

revoke all on function public.create_outlook_mailbox from public;
grant execute on function public.create_outlook_mailbox to authenticated;
