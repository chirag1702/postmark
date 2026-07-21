-- Module 6/8: streams sync_state changes (specifically backfill_complete flipping to true) to the
-- client so the "Setting up your mailbox" screen can clear live instead of requiring a reload.
alter publication supabase_realtime add table public.sync_state;
