-- Module 6: inbound sync needs an idempotency key to upsert synced messages without duplicating
-- them on every backfill/poll pass, plus a forward-compatible thread column (no threading UI
-- exists yet -- see MODULES.md).
alter table public.emails
  add column provider_message_id text,
  add column thread_id text;

-- NULL allowed (existing composed/sent rows never set this and never will -- they're written by
-- create_sent_email, not the sync worker), but non-null values must be unique per mailbox so a
-- re-synced message resolves to exactly one existing row via ON CONFLICT.
create unique index emails_mailbox_provider_message_id_key
  on public.emails (mailbox_id, provider_message_id)
  where provider_message_id is not null;

create index emails_thread_id_idx
  on public.emails (thread_id)
  where thread_id is not null;
