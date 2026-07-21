-- oauth_tokens: encrypted OAuth credentials for a connected mailbox (Module 2: Gmail only)
create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null unique references public.mailboxes (id) on delete cascade,
  provider public.mailbox_provider not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index oauth_tokens_mailbox_id_idx on public.oauth_tokens (mailbox_id);

alter table public.oauth_tokens enable row level security;

create policy "oauth_tokens_select_own"
on public.oauth_tokens for select
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = oauth_tokens.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "oauth_tokens_insert_own"
on public.oauth_tokens for insert
to authenticated
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = oauth_tokens.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "oauth_tokens_update_own"
on public.oauth_tokens for update
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = oauth_tokens.mailbox_id and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = oauth_tokens.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "oauth_tokens_delete_own"
on public.oauth_tokens for delete
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = oauth_tokens.mailbox_id and m.user_id = (select auth.uid())
  )
);

-- Atomically creates a Gmail mailbox + its token row in one transaction. Stays security
-- invoker (the default) so it enforces exactly the same auth.uid() ownership as two manual
-- inserts would -- the only reason this is a function is to avoid an orphaned-mailbox failure
-- mode if the second insert failed after two separate REST calls.
create function public.create_gmail_mailbox(
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
    'gmail',
    not exists (select 1 from public.mailboxes where user_id = (select auth.uid()))
  )
  returning * into v_mailbox;

  insert into public.oauth_tokens (mailbox_id, provider, access_token_enc, refresh_token_enc, expires_at, scope)
  values (v_mailbox.id, 'gmail', p_access_token_enc, p_refresh_token_enc, p_expires_at, p_scope);

  return v_mailbox;
end;
$$;

revoke all on function public.create_gmail_mailbox from public;
grant execute on function public.create_gmail_mailbox to authenticated;
