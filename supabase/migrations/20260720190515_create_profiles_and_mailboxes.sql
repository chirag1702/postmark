-- profiles: one row per authenticated user, created automatically on signup
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ( (select auth.uid()) = id );

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ( (select auth.uid()) = id )
with check ( (select auth.uid()) = id );

-- mailboxes: schema-only in Module 1 (empty per new user; OAuth connect lands in Module 2)
create type public.mailbox_provider as enum ('gmail', 'outlook');

create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  provider public.mailbox_provider not null,
  is_default boolean not null default false,
  send_pin_hash text,
  lock_pin_hash text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index mailboxes_user_id_idx on public.mailboxes (user_id);

alter table public.mailboxes enable row level security;

create policy "mailboxes_select_own"
on public.mailboxes for select
to authenticated
using ( (select auth.uid()) = user_id );

create policy "mailboxes_insert_own"
on public.mailboxes for insert
to authenticated
with check ( (select auth.uid()) = user_id );

create policy "mailboxes_update_own"
on public.mailboxes for update
to authenticated
using ( (select auth.uid()) = user_id )
with check ( (select auth.uid()) = user_id );

create policy "mailboxes_delete_own"
on public.mailboxes for delete
to authenticated
using ( (select auth.uid()) = user_id );

-- auto-create the profile row on signup, atomically with the auth.users insert
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
