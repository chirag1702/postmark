-- processMessagePage's upsert (onConflict: "mailbox_id,provider_message_id") always resolves to
-- a plain `ON CONFLICT (mailbox_id, provider_message_id)` -- PostgREST/supabase-js's upsert() has
-- no way to pass a WHERE predicate through, and Postgres requires the ON CONFLICT target's
-- predicate to match an index's exactly to use it as the arbiter. A *partial* unique index (the
-- original `where provider_message_id is not null`) can therefore never be matched this way,
-- surfacing as "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" on every synced message.
--
-- The partial predicate was unnecessary to begin with: Postgres unique indexes already treat
-- NULL as distinct from every other NULL, so multiple sent-mail rows (provider_message_id always
-- NULL) were never at risk of colliding even under a plain, non-partial unique index.
drop index if exists public.emails_mailbox_provider_message_id_key;

create unique index emails_mailbox_provider_message_id_key
  on public.emails (mailbox_id, provider_message_id);
