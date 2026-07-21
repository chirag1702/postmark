-- Module 8: server-side cross-account search. Additive only -- no existing column changes.
-- search_vector is GENERATED ... STORED, so Postgres backfills/maintains it automatically for
-- existing and future rows; no manual backfill script needed.

create extension if not exists pg_trgm with schema extensions;

alter table public.emails
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(from_name, '') || ' ' || coalesce(preview_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
  ) stored;

create index emails_search_vector_idx on public.emails using gin (search_vector);

-- Fuzzy/substring sender matching (typos, partial names tsvector's word-boundary matching won't
-- catch, e.g. "jon" -> "jonathan@..."). One trigram index over a concatenation of both sender
-- fields covers "match either field" queries without two separate indexes.
create index emails_from_trgm_idx on public.emails
  using gin ((from_name || ' ' || from_email) extensions.gin_trgm_ops);

-- Combines full-text rank + trigram similarity + trash-exclusion + per-user scoping + LIMIT in
-- one indexed query (see GET /api/mail/search for why this is an RPC, not a supabase-js
-- .textSearch()/.or() chain). SECURITY INVOKER (default) -- runs as the calling user, so RLS on
-- emails/mailboxes still applies; the explicit mailboxes join/user_id filter is redundant with
-- RLS but kept for planner clarity.
create function public.search_emails(
  p_query text,
  p_mailbox_id uuid default null
)
returns table (id uuid, rank_order int)
language sql
stable
set search_path = ''
as $$
  with ranked as (
    select
      e.id,
      greatest(
        ts_rank_cd(e.search_vector, websearch_to_tsquery('english', p_query)),
        extensions.similarity(e.from_name || ' ' || e.from_email, p_query)
      ) as score,
      coalesce(e.sent_at, e.created_at) as sort_date
    from public.emails e
    join public.mailboxes m on m.id = e.mailbox_id
    where m.user_id = (select auth.uid())
      and e.folder <> 'trash'
      and (p_mailbox_id is null or e.mailbox_id = p_mailbox_id)
      and (
        e.search_vector @@ websearch_to_tsquery('english', p_query)
        or (e.from_name || ' ' || e.from_email) OPERATOR(extensions.%) p_query
      )
    order by score desc, sort_date desc
    limit 50
  )
  select id, row_number() over (order by score desc, sort_date desc)::int as rank_order
  from ranked;
$$;

revoke all on function public.search_emails(text, uuid) from public;
grant execute on function public.search_emails(text, uuid) to authenticated;
