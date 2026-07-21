-- sync_state: per-mailbox provider sync cursor (Gmail historyId / Graph deltaLink), unified
-- into one row shape. Schema only in Module 5 -- populated/updated by Module 6's backfill/poll
-- jobs, written via the service-role admin client since sync runs outside any user session.
create table public.sync_state (
  mailbox_id uuid primary key references public.mailboxes (id) on delete cascade,
  provider public.mailbox_provider not null,
  last_history_id text,
  last_delta_link text,
  last_synced_at timestamptz,
  backfill_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sync_state enable row level security;

create policy "sync_state_select_own"
on public.sync_state for select
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = sync_state.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "sync_state_insert_own"
on public.sync_state for insert
to authenticated
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = sync_state.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "sync_state_update_own"
on public.sync_state for update
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = sync_state.mailbox_id and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.mailboxes m
    where m.id = sync_state.mailbox_id and m.user_id = (select auth.uid())
  )
);

create policy "sync_state_delete_own"
on public.sync_state for delete
to authenticated
using (
  exists (
    select 1 from public.mailboxes m
    where m.id = sync_state.mailbox_id and m.user_id = (select auth.uid())
  )
);
