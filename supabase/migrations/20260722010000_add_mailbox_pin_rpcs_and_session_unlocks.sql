-- session_unlocks: session-scoped mailbox-lock unlock state (Module 13). A mailbox with a
-- lock_pin_hash set is "locked" unless the current login session has a row here for it --
-- this makes "unlocked" reset on every fresh sign-in (a new session_id claim), fixing the
-- previous design where Mailbox.locked was a persistent boolean that never re-locked.
create table public.session_unlocks (
  session_id uuid not null,
  mailbox_id uuid not null references public.mailboxes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (session_id, mailbox_id)
);

create index session_unlocks_user_id_idx on public.session_unlocks (user_id);

alter table public.session_unlocks enable row level security;

create policy "session_unlocks_select_own"
on public.session_unlocks for select
to authenticated
using ( (select auth.uid()) = user_id );

create policy "session_unlocks_insert_own"
on public.session_unlocks for insert
to authenticated
with check ( (select auth.uid()) = user_id );

create policy "session_unlocks_update_own"
on public.session_unlocks for update
to authenticated
using ( (select auth.uid()) = user_id )
with check ( (select auth.uid()) = user_id );

create policy "session_unlocks_delete_own"
on public.session_unlocks for delete
to authenticated
using ( (select auth.uid()) = user_id );

-- Sets or clears the Send-PIN hash (MailboxCard's Send PIN toggle). p_pin = null clears it.
create function public.set_send_pin(p_mailbox_id uuid, p_pin text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.mailboxes
  set send_pin_hash = case
    when p_pin is null then null
    else extensions.crypt(p_pin, extensions.gen_salt('bf'))
  end
  where id = p_mailbox_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.set_send_pin from public;
grant execute on function public.set_send_pin to authenticated;

-- Sets or clears the Lock-PIN hash (MailboxCard's Mailbox lock toggle). Also invalidates any
-- session_unlocks rows for this mailbox so a changed/cleared/newly-set PIN forces every session
-- (including the caller's own, if lock is being re-enabled) to re-enter the new PIN rather than
-- silently staying unlocked on the old one.
create function public.set_lock_pin(p_mailbox_id uuid, p_pin text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.mailboxes
  set lock_pin_hash = case
    when p_pin is null then null
    else extensions.crypt(p_pin, extensions.gen_salt('bf'))
  end
  where id = p_mailbox_id and user_id = (select auth.uid());

  delete from public.session_unlocks
  where mailbox_id = p_mailbox_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.set_lock_pin from public;
grant execute on function public.set_lock_pin to authenticated;

-- Lock-PIN verification (LockedMailboxScreen). Exact mirror of verify_send_pin, against
-- lock_pin_hash instead of send_pin_hash.
create function public.verify_lock_pin(p_mailbox_id uuid, p_pin text) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hash text;
begin
  select lock_pin_hash into v_hash
  from public.mailboxes
  where id = p_mailbox_id and user_id = (select auth.uid());

  if v_hash is null then
    return true;
  end if;

  return v_hash = extensions.crypt(p_pin, v_hash);
end;
$$;

revoke all on function public.verify_lock_pin from public;
grant execute on function public.verify_lock_pin to authenticated;
