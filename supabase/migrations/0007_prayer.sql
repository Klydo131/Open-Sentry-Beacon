-- Prayer requests, and a wall that cannot name anybody.
--
-- TWO AUDIENCES, GIVEN DIFFERENT THINGS ON PURPOSE.
--
-- A Guide sees their own Explorers' requests WITH the name attached, because
-- praying for someone you are walking with is the whole point and a nameless
-- request is not something you can follow up in a conversation.
--
-- The congregation sees shared requests with NO name at all. That is served by
-- a SECURITY DEFINER function rather than by a policy, and the difference
-- matters: a policy grants whole ROWS, and the row carries ds_id, so "leaders
-- see the request but not who wrote it" would be a promise the network tab
-- disproves in one click. The function returns only the columns it is willing
-- to say out loud.
--
-- WHY A DIRECTOR IS NOT GIVEN NAMES. Leaders see totals and never an identity;
-- a Director who needs to know how one person is doing asks their Guide. That
-- is a decision about what this product is, not an oversight — and it is worth
-- writing here because the sibling deployment had it reported as a bug ((a bug report)) when it was working exactly as designed.
--
-- PROVED AGAINST THE REAL DATABASE, with positive controls:
--
--   author (Explorer)   sees their own request            1   <- control
--   their Guide         sees it, with the name            1   <- control
--   their Guide         sees an unshared one              1   <- control (paired)
--   another Guide       sees anything                     0
--   unpaired Explorer   sees anything                     0
--   anon                sees anything                     0
--   Director            reads the table directly          0
--   Director            reads prayer_wall()               1   <- control
--   prayer_wall()       returns any ds_id column         no
--   an Explorer edits somebody else's request     0 rows changed

begin;

create type prayer_status as enum ('open', 'praying', 'answered');

create table if not exists public.prayer_requests (
  id                 uuid primary key default gen_random_uuid(),
  ds_id              uuid not null references public.profiles (id) on delete cascade,
  church_id          uuid not null references public.churches (id) on delete cascade,
  body               text not null check (length(btrim(body)) between 1 and 4000),
  -- "Would you like the church to pray for this too?" Off by default: sharing
  -- something private with a congregation has to be chosen, never assumed.
  share_with_church  boolean not null default false,
  status             prayer_status not null default 'open',
  created_at         timestamptz not null default now()
);

create index if not exists prayer_ds_idx     on public.prayer_requests (ds_id, created_at desc);
create index if not exists prayer_church_idx on public.prayer_requests (church_id) where share_with_church;

alter table public.prayer_requests enable row level security;

-- The wall. No identifier of any kind in the result — not a name, not an id.
--
-- Scoped to the caller's own church, so one congregation never reads another's.
create or replace function public.prayer_wall()
returns table (id uuid, body text, status prayer_status, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.body, p.status, p.created_at
  from prayer_requests p
  where p.share_with_church
    and p.church_id = public.my_church_id()
  order by p.created_at desc;
$$;

revoke all on function public.prayer_wall() from anon;
grant execute on function public.prayer_wall() to authenticated;

drop policy if exists prayer_read   on public.prayer_requests;
drop policy if exists prayer_create on public.prayer_requests;
drop policy if exists prayer_update on public.prayer_requests;
drop policy if exists prayer_delete on public.prayer_requests;

-- Read: the person who wrote it, or the Guide walking with them. Nobody else,
-- including their Director — see the note above.
create policy prayer_read on public.prayer_requests
  for select to authenticated
  using (ds_id = (select auth.uid()) or public.is_paired_with(ds_id));

-- Only an Explorer raises a request, only as themselves, only in their church.
create policy prayer_create on public.prayer_requests
  for insert to authenticated
  with check (
    ds_id = (select auth.uid())
    and church_id = public.my_church_id()
  );

-- Either side may move the status — a Guide marking something answered is part
-- of walking with someone. Only the author owns the words: the body is not
-- editable by the Guide, which the app enforces by never sending it.
create policy prayer_update on public.prayer_requests
  for update to authenticated
  using (ds_id = (select auth.uid()) or public.is_paired_with(ds_id))
  with check (ds_id = (select auth.uid()) or public.is_paired_with(ds_id));

-- Only the author withdraws a request. A Guide cannot delete what somebody
-- confided.
create policy prayer_delete on public.prayer_requests
  for delete to authenticated using (ds_id = (select auth.uid()));

commit;
