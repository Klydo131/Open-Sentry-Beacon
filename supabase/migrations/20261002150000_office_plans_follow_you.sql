-- Sabbath programs and evangelistic meetings follow their owner to every
-- device they sign in on.
--
-- ASKED FOR on 2 October 2026: "make sure it's on device first, but ALSO it's
-- transparent to go to other devices that is login so our app is flexible to
-- use." Until now both lived only in the browser where they were made.
--
-- DEVICE FIRST STILL. The browser keeps the working copy, saves as it is typed,
-- works with no signal, and works on a database without this table at all
-- (lib/live/office-plans.ts reads a missing table as "not here yet"). This is
-- the account's copy behind it: pushed when there is a signal, pulled when
-- another device changed something, the newest edit of each item winning.
--
-- PRIVATE TO ITS OWNER, the pocket's rule (20260916100000): nobody else reads
-- a row, leadership included. A program shared with the church still goes
-- the way it always did, as a post somebody chose to make.
--
-- ONE ROW PER ITEM, KEYED BY OWNER AND ITEM. The item's id is made in the
-- browser and appears in calendar files people pass round, so a key on the
-- id alone would let somebody who saw one claim it first and stop its owner
-- saving it. Owner and id together cannot be claimed by anybody else.
--
-- A DELETION IS KEPT AS A MARK, body emptied. Without it, a phone that was
-- offline when a program was deleted elsewhere would bring it back the next
-- time it synced.

create table if not exists public.office_plans (
  -- Defaulted, so the browser never says who it is; the policies check it.
  owner_id   uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  id         text not null check (length(id) between 1 and 64),
  kind       text not null check (kind in ('sabbath_program', 'evangelistic_meeting')),
  -- The program or series, exactly as the browser keeps it, and tidied again
  -- by the browser on the way back in (lib/sabbath-program.ts tidyProgram,
  -- lib/evangelistic-meeting.ts tidyMeeting). Capped, so one row cannot be
  -- made enormous: a whole series of 31 nights is a few tens of kilobytes.
  body       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 400000),
  -- The item's own "last changed", in milliseconds, from the device that
  -- changed it. What decides which copy is newer.
  updated    bigint not null check (updated >= 0),
  deleted    boolean not null default false,
  primary key (owner_id, id)
);

create index if not exists office_plans_owner_kind_idx on public.office_plans (owner_id, kind);

alter table public.office_plans enable row level security;

drop policy if exists office_plans_read   on public.office_plans;
drop policy if exists office_plans_add    on public.office_plans;
drop policy if exists office_plans_change on public.office_plans;
drop policy if exists office_plans_remove on public.office_plans;

create policy office_plans_read on public.office_plans
  for select to authenticated using (owner_id = (select auth.uid()));
create policy office_plans_add on public.office_plans
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy office_plans_change on public.office_plans
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy office_plans_remove on public.office_plans
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Nobody signed out reaches it at all.
revoke all on public.office_plans from anon;

-- A ceiling per person, deletion marks included: the browser holds 120
-- programs and 60 series, and this leaves room for the marks of what was
-- deleted. Enough for years of Sabbaths; not enough to use the church's
-- database as anybody's free storage.
create or replace function private.office_plans_are_not_overflowing()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if (select count(*) from public.office_plans where owner_id = new.owner_id) >= 1000 then
    raise exception 'This account keeps 1000 programs and meetings. Delete old ones to add more.';
  end if;
  return new;
end;
$$;

revoke all on function private.office_plans_are_not_overflowing() from public, anon, authenticated;

drop trigger if exists office_plans_cap on public.office_plans;
create trigger office_plans_cap
  before insert on public.office_plans
  for each row execute function private.office_plans_are_not_overflowing();

-- THE NEWER COPY ALWAYS WINS, HERE AS WELL AS IN THE BROWSER. A device that
-- was slow to send can arrive after a newer edit from another one; an update
-- older than the row it would replace is skipped, so the account's copy only
-- ever moves forward.
create or replace function private.office_plans_only_move_forward()
returns trigger
language plpgsql set search_path to 'public'
as $$
begin
  if new.updated < old.updated then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.office_plans_only_move_forward() from public, anon, authenticated;

drop trigger if exists office_plans_forward on public.office_plans;
create trigger office_plans_forward
  before update on public.office_plans
  for each row execute function private.office_plans_only_move_forward();

-- A suspended account sees nothing, here or on the live feed, as on every
-- published table (20260923173000_a_suspension_reaches_the_socket_too).
drop policy if exists a_suspended_account_sees_nothing on public.office_plans;
create policy a_suspended_account_sees_nothing on public.office_plans
  as restrictive for select to authenticated
  using ((select private.i_am_not_suspended()));

-- Published, so a change made on the phone reaches the laptop while it is
-- open. Realtime applies the read policy per subscriber: only the owner hears.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'office_plans'
  ) then
    alter publication supabase_realtime add table public.office_plans;
  end if;
end $$;
