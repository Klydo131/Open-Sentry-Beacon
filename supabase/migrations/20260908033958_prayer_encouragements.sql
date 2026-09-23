-- BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.
--
-- Applied to the live database as `prayer_encouragements` and never committed,
-- so a fresh install from this repository had no prayer_encouragements table and
-- the prayer room's private thread failed for every fork.
--
-- Everything below the rule is the applied text, byte for byte: its md5 was
-- checked against supabase_migrations.schema_migrations before it was
-- committed. The live text ends in one stray carriage return, which
-- .gitattributes (eol=lf) strips on commit; that trailing byte is the only
-- difference. It is already in the live database, which records migrations by
-- the time they ran, so this file changes nothing there. It exists so that a
-- fresh database built from this repository is the same database.
-- ---------------------------------------------------------------------------
-- A private encouragement thread attached to each prayer request.
-- Applied after the 2026-09-01 Claude production migrations.
--
-- This does not turn prayer into a church-wide chat. The request author and
-- the Guide(s) actively paired with that Explorer are the only readers and
-- writers. Directors and Executive Directors remain outside the confidence,
-- exactly as they are for prayer_requests itself.

begin;

create table if not exists public.prayer_encouragements (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.prayer_requests (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists prayer_encouragement_request_idx
  on public.prayer_encouragements (request_id, created_at);

alter table public.prayer_encouragements enable row level security;

revoke all on table public.prayer_encouragements from public, anon, authenticated;
grant select, insert, delete on table public.prayer_encouragements to authenticated;

drop policy if exists prayer_encouragement_read on public.prayer_encouragements;
create policy prayer_encouragement_read on public.prayer_encouragements
  for select to authenticated
  using (
    exists (
      select 1
      from public.prayer_requests request
      where request.id = request_id
        and (
          request.ds_id = (select auth.uid())
          or public.is_paired_with(request.ds_id)
        )
    )
  );

drop policy if exists prayer_encouragement_create on public.prayer_encouragements;
create policy prayer_encouragement_create on public.prayer_encouragements
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.prayer_requests request
      where request.id = request_id
        and (
          request.ds_id = (select auth.uid())
          or public.is_paired_with(request.ds_id)
        )
    )
  );

-- A person may remove only their own words, and only while they still belong
-- to this private prayer conversation. There is deliberately no update policy:
-- a sent encouragement is part of the history and cannot be silently rewritten.
drop policy if exists prayer_encouragement_delete on public.prayer_encouragements;
create policy prayer_encouragement_delete on public.prayer_encouragements
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.prayer_requests request
      where request.id = request_id
        and (
          request.ds_id = (select auth.uid())
          or public.is_paired_with(request.ds_id)
        )
    )
  );

-- Alert the other side without putting prayer or encouragement text on a lock
-- screen. The trigger is the reliable boundary: every client that inserts a
-- row gets the same notification behavior.
create or replace function public.prayer_encouragement_notifies_participant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  request_author uuid;
  guide record;
begin
  select request.ds_id
    into request_author
  from public.prayer_requests request
  where request.id = new.request_id;

  if request_author is null then
    return new;
  end if;

  if new.author_id = request_author then
    for guide in
      select distinct pairing.dm_id
      from public.pairings pairing
      where pairing.ds_id = request_author
        and pairing.status = 'active'
    loop
      perform public.notify_user(
        guide.dm_id,
        'prayer',
        'A prayer conversation has a new message',
        'Open the private prayer request to read it.'
      );
    end loop;
  else
    perform public.notify_user(
      request_author,
      'prayer',
      'Your Guide sent encouragement',
      'Open your private prayer request to read it.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists prayer_encouragement_notifies_participant
  on public.prayer_encouragements;
create trigger prayer_encouragement_notifies_participant
  after insert on public.prayer_encouragements
  for each row execute function public.prayer_encouragement_notifies_participant();

revoke all on function public.prayer_encouragement_notifies_participant()
  from public, anon, authenticated;

-- Realtime is an enhancement, not an authorization layer. Postgres Changes
-- still applies RLS before a row can reach a subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'prayer_encouragements'
     ) then
    alter publication supabase_realtime add table public.prayer_encouragements;
  end if;
end;
$$;

commit;

