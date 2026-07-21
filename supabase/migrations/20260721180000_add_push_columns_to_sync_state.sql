-- Module 5 (revised): forward-compatible columns for future push-sync modules (9/10).
-- Not written or read by any code yet -- Module 6 has no push subscription of its own.
alter table public.sync_state
  add column push_expires_at timestamptz,
  add column push_subscription_id text;
