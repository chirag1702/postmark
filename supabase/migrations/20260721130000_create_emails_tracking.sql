-- pgcrypto lives in the `extensions` schema on Supabase; must schema-qualify calls to
-- extensions.crypt()/extensions.gen_salt() below since all functions use set search_path = ''.
create extension if not exists pgcrypto with schema extensions;

-- "starred" is a UI-only pseudo-folder (a view over the `starred` boolean + any real folder
-- except trash) -- it is never a stored folder value, hence 5 values here, not 6.
create type public.email_folder as enum ('inbox', 'sent', 'drafts', 'archive', 'trash');
create type public.email_recipient_kind as enum ('to', 'cc', 'bcc');

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.mailboxes (id) on delete cascade,
  folder public.email_folder not null default 'sent',
  subject text not null default '',
  from_name text not null,
  from_email text not null,
  body_html text not null,
  body_text text not null,
  preview_text text not null default '',
  cta_label text,
  cta_href text,
  sent_at timestamptz,
  unread boolean not null default false,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);

create index emails_mailbox_folder_idx on public.emails (mailbox_id, folder);

create table public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails (id) on delete cascade,
  kind public.email_recipient_kind not null,
  name text not null default '',
  email text not null
);

create index email_recipients_email_id_idx on public.email_recipients (email_id);

create table public.tracking_tokens (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails (id) on delete cascade,
  recipient_email text not null,
  opened_at timestamptz,
  open_count int not null default 0,
  clicked_at timestamptz,
  click_count int not null default 0,
  created_at timestamptz not null default now()
);

create index tracking_tokens_email_id_idx on public.tracking_tokens (email_id);

alter table public.emails enable row level security;
alter table public.email_recipients enable row level security;
alter table public.tracking_tokens enable row level security;

-- emails: standard owner-via-mailbox pattern (select/insert/update only -- no user-facing
-- delete flow exists; trashing is a folder update, not a physical delete. Physical delete only
-- happens via the internal delete_email() compensating-rollback RPC below.)
create policy "emails_select_own"
on public.emails for select
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = emails.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "emails_insert_own"
on public.emails for insert
to authenticated
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = emails.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "emails_update_own"
on public.emails for update
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = emails.mailbox_id and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = emails.mailbox_id and m.user_id = (select auth.uid())
  )
);

-- email_recipients: written once at send time, read for the "To:"/"Cc:" line -- select+insert only.
create policy "email_recipients_select_own"
on public.email_recipients for select
to authenticated
using (
  exists (
    select 1 from public.emails e join public.mailboxes m on m.id = e.mailbox_id
    where e.id = email_recipients.email_id and m.user_id = (select auth.uid())
  )
);

create policy "email_recipients_insert_own"
on public.email_recipients for insert
to authenticated
with check (
  exists (
    select 1 from public.emails e join public.mailboxes m on m.id = e.mailbox_id
    where e.id = email_recipients.email_id and m.user_id = (select auth.uid())
  )
);

-- tracking_tokens: authenticated owners may SELECT (to render aggregate counts) and INSERT
-- (via the atomic send RPC below). Deliberately NO update/delete policy for `authenticated` --
-- opens/clicks are only ever written by the public tracking routes using the service-role
-- admin client, which bypasses RLS entirely. This keeps "recording an open" unforgeable by a
-- logged-in user hitting PostgREST directly.
create policy "tracking_tokens_select_own"
on public.tracking_tokens for select
to authenticated
using (
  exists (
    select 1 from public.emails e join public.mailboxes m on m.id = e.mailbox_id
    where e.id = tracking_tokens.email_id and m.user_id = (select auth.uid())
  )
);

create policy "tracking_tokens_insert_own"
on public.tracking_tokens for insert
to authenticated
with check (
  exists (
    select 1 from public.emails e join public.mailboxes m on m.id = e.mailbox_id
    where e.id = tracking_tokens.email_id and m.user_id = (select auth.uid())
  )
);

-- Atomically persists a composed+sent email: the emails row, its recipients, and (when
-- tracking is enabled) one tracking_tokens row per 'to' recipient. Returns the new email id
-- plus the {recipientEmail, tokenId} pairs the route handler needs to build personalized
-- pixel/CTA URLs before calling the Gmail API. Security invoker (default) -- enforces the same
-- auth.uid() ownership as manual inserts would.
create function public.create_sent_email(
  p_mailbox_id uuid,
  p_subject text,
  p_from_name text,
  p_from_email text,
  p_body_html text,
  p_body_text text,
  p_preview_text text,
  p_to jsonb,           -- [{ "name": text, "email": text }, ...]
  p_cc jsonb,           -- same shape, may be '[]'
  p_bcc jsonb,          -- same shape, may be '[]'
  p_tracking_enabled boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email_id uuid;
  v_tokens jsonb := '[]'::jsonb;
  v_rec jsonb;
  v_token_id uuid;
begin
  insert into public.emails (
    mailbox_id, folder, subject, from_name, from_email,
    body_html, body_text, preview_text, sent_at, unread, starred
  ) values (
    p_mailbox_id, 'sent', p_subject, p_from_name, p_from_email,
    p_body_html, p_body_text, p_preview_text, now(), false, false
  ) returning id into v_email_id;

  for v_rec in select * from jsonb_array_elements(p_to) loop
    insert into public.email_recipients (email_id, kind, name, email)
    values (v_email_id, 'to', v_rec ->> 'name', v_rec ->> 'email');

    if p_tracking_enabled then
      insert into public.tracking_tokens (email_id, recipient_email)
      values (v_email_id, v_rec ->> 'email')
      returning id into v_token_id;

      v_tokens := v_tokens || jsonb_build_object(
        'recipientEmail', v_rec ->> 'email', 'tokenId', v_token_id
      );
    end if;
  end loop;

  for v_rec in select * from jsonb_array_elements(p_cc) loop
    insert into public.email_recipients (email_id, kind, name, email)
    values (v_email_id, 'cc', v_rec ->> 'name', v_rec ->> 'email');
  end loop;

  for v_rec in select * from jsonb_array_elements(p_bcc) loop
    insert into public.email_recipients (email_id, kind, name, email)
    values (v_email_id, 'bcc', v_rec ->> 'name', v_rec ->> 'email');
  end loop;

  return jsonb_build_object('emailId', v_email_id, 'tokens', v_tokens);
end;
$$;

revoke all on function public.create_sent_email from public;
grant execute on function public.create_sent_email to authenticated;

-- Compensating delete used only when every fan-out Gmail send fails (all-or-nothing send).
-- Cascades to email_recipients/tracking_tokens automatically via FK ON DELETE CASCADE.
create function public.delete_email(p_email_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.emails
  where id = p_email_id
    and exists (
      select 1 from public.mailboxes m where m.id = emails.mailbox_id and m.user_id = (select auth.uid())
    );
end;
$$;

revoke all on function public.delete_email from public;
grant execute on function public.delete_email to authenticated;

-- Send-PIN verification (SendPinModal). Reachable but practically untested until Module 10
-- adds PIN-setting UI (send_pin_hash is always NULL today) -- if unset, verification is a
-- no-op pass, matching today's client-side `if (account.sendPin)` gate.
create function public.verify_send_pin(p_mailbox_id uuid, p_pin text) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hash text;
begin
  select send_pin_hash into v_hash
  from public.mailboxes
  where id = p_mailbox_id and user_id = (select auth.uid());

  if v_hash is null then
    return true;
  end if;

  return v_hash = extensions.crypt(p_pin, v_hash);
end;
$$;

revoke all on function public.verify_send_pin from public;
grant execute on function public.verify_send_pin to authenticated;

-- Tracking-write RPCs: called ONLY from the two public, unauthenticated /api/track/* routes
-- via a service-role (RLS-bypassing) admin client -- never exposed to `authenticated`/`anon`
-- via PostgREST. Note: revoking from `public` removes the implicit grant every role (including
-- service_role) inherits by default, so service_role needs its own explicit grant below, or
-- the admin-client RPC call fails with "permission denied for function" despite RLS bypass.
create function public.record_tracking_open(p_token uuid) returns void
language sql
set search_path = ''
as $$
  update public.tracking_tokens
  set open_count = open_count + 1,
      opened_at = coalesce(opened_at, now())
  where id = p_token;
$$;

revoke all on function public.record_tracking_open from public, anon, authenticated;
grant execute on function public.record_tracking_open to service_role;

create function public.record_tracking_click(p_token uuid) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_href text;
begin
  update public.tracking_tokens
  set click_count = click_count + 1,
      clicked_at = coalesce(clicked_at, now())
  where id = p_token;

  select e.cta_href into v_href
  from public.tracking_tokens t
  join public.emails e on e.id = t.email_id
  where t.id = p_token;

  return v_href;
end;
$$;

revoke all on function public.record_tracking_click from public, anon, authenticated;
grant execute on function public.record_tracking_click to service_role;
