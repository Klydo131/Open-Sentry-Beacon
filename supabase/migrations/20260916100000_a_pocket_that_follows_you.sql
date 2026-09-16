-- A pocket that follows you to any device.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "pocket apps should be live too so that the save apps are
-- integrated in the cloud that I can see my apps on aNY devices."
--
-- The pocket kept its tiles in the browser, which was the right first answer --
-- no table, no policy, every role had the feature immediately -- and the wrong
-- final one, because a bookmark saved on a phone did not exist on the laptop,
-- and clearing site data threw the lot away with no warning.
--
-- WHAT CHANGES FOR THE PERSON, SAID PLAINLY. These stop being private to one
-- browser and become rows in the church's database. That is the trade for
-- having them everywhere, and it is the reason the policy below is the
-- narrowest in this schema: the OWNER and nobody else. Not their Guide, not a
-- Director, not an Executive Director, not the Head ED. Leadership can read a
-- great deal in this app for good reasons; which websites somebody keeps a
-- shortcut to is not one of them, and the policy says so rather than a comment
-- promising it.
--
-- WHY THERE IS NO CHURCH_ID. Every other table here is scoped to a church
-- because the church is who may see it. Nobody may see this but its owner, so a
-- church column would be a join that grants nothing and one more thing to get
-- wrong. `owner_id` is the whole of the authorisation.
-- ---------------------------------------------------------------------------

create table if not exists public.pocket_apps (
  id         uuid primary key default gen_random_uuid(),
  -- DEFAULTED, SO THE BROWSER NEVER HAS TO KNOW WHO IT IS. The first version
  -- of the client read the owner with auth.getUser(), which is a second round
  -- trip to Auth on every save and is forbidden here for exactly that reason --
  -- the app already holds a verified first-party session and asking again is
  -- both slower and a second source of truth about who somebody is. Postgres
  -- knows, so Postgres fills it in, and the insert policy still checks it.
  -- `auth.uid()` bare, not wrapped in a select. The (select auth.uid()) form
  -- used in the policies below is an RLS optimisation, and Postgres refuses a
  -- subquery in a DEFAULT outright -- which it said plainly the moment this was
  -- applied, before any of it reached a person.
  owner_id   uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  -- THE PROTOCOL IS CHECKED HERE AS WELL AS IN THE BROWSER. A row becomes an
  -- href, and a `javascript:` one would run in the app's own origin with the
  -- person's session behind it. lib/url.ts refuses it on the way in; this
  -- refuses it whatever sent it, which is the half a browser cannot be trusted
  -- with.
  url        text not null check (url ~* '^https?://' and length(url) between 8 and 2048),
  label      text not null check (length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  -- The same address twice is a mis-tap, and the browser already refuses it.
  unique (owner_id, url)
);

create index if not exists pocket_apps_owner_idx
  on public.pocket_apps (owner_id, created_at);

alter table public.pocket_apps enable row level security;

-- ONE POLICY PER VERB, ALL SAYING THE SAME THING. Spelled out rather than
-- written `for all`, because a single permissive policy is the kind of thing
-- that gets widened later by somebody who only meant to widen reading.
drop policy if exists pocket_apps_read   on public.pocket_apps;
drop policy if exists pocket_apps_add    on public.pocket_apps;
drop policy if exists pocket_apps_change on public.pocket_apps;
drop policy if exists pocket_apps_remove on public.pocket_apps;

create policy pocket_apps_read on public.pocket_apps
  for select to authenticated using (owner_id = (select auth.uid()));

create policy pocket_apps_add on public.pocket_apps
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy pocket_apps_change on public.pocket_apps
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy pocket_apps_remove on public.pocket_apps
  for delete to authenticated using (owner_id = (select auth.uid()));

-- A CAP IN THE DATABASE, NOT ONLY ON THE SCREEN. The pocket holds twelve
-- because thirteen tiles is a scroll in a rail; a browser that skipped the
-- screen could otherwise put ten thousand rows in somebody's name.
create or replace function private.pocket_is_not_overflowing()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if (select count(*) from public.pocket_apps where owner_id = new.owner_id) >= 12 then
    raise exception 'The pocket holds 12. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists pocket_apps_cap on public.pocket_apps;
create trigger pocket_apps_cap
  before insert on public.pocket_apps
  for each row execute function private.pocket_is_not_overflowing();

-- KEEPING UP IS THE WHOLE REQUEST. "so that I can see my apps on aNY devices"
-- is not satisfied by a table somebody has to reload to see. The read policy is
-- `owner_id = auth.uid()` and realtime evaluates it per subscriber, so a tile
-- saved on a phone appears on that person's laptop and on nobody else's screen.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'pocket_apps'
  ) then
    alter publication supabase_realtime add table public.pocket_apps;
  end if;
end $$;
