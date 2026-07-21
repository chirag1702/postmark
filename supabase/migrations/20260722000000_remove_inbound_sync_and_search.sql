-- Inbound mail is no longer persisted -- inbox/drafts/archive/trash are always fetched live from
-- Gmail/Graph on every request instead of synced into Postgres (Module 6's backfill pipeline is
-- removed). Only sent mail + read-receipt tracking remain in `emails`/`email_recipients`/
-- `tracking_tokens`, since that data is app-generated and has nowhere else to live.
drop table if exists public.sync_state;

-- provider_message_id/thread_id only ever addressed synced inbound rows for write-back/idempotent
-- upsert; sent rows never had them. search_vector backed Module 11's cross-account search, which
-- is removed along with its DB dependency (kept: the existing free client-side substring filter).
drop function if exists public.search_emails(text, uuid);

alter table public.emails
  drop column if exists provider_message_id,
  drop column if exists thread_id,
  drop column if exists search_vector;
