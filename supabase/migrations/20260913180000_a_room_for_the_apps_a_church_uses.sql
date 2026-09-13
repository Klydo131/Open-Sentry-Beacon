-- The other apps a church already uses, one tap away.
--
-- WHAT THIS IS FOR. Asked for directly: a room holding "the official Bible that
-- SDA uses, SDA hymnals, etc", so that "when they tap or click it, it
-- automatically goes to the app destination" -- the installed app where there
-- is one, the website otherwise, on any phone or desktop.
--
-- WHY A TABLE AND NOT A LIST IN THE SOURCE. Two reasons, and the second is the
-- one that decided it.
--
--   1. Every church uses different things. A conference in the Philippines and
--      one in Kenya do not open the same hymnal app, and a list in the code
--      means a fork has to edit TypeScript to change a bookmark.
--   2. THE ADDRESSES COULD NOT BE VERIFIED FROM THE BUILD ENVIRONMENT. The
--      network here refuses those domains, so anything hard-coded would have
--      been an address written from memory and shipped to a congregation
--      untested. A wrong link is not a small thing in an app people trust: it
--      is a dead end at the moment somebody reached for scripture. The church
--      pastes what it actually uses, and what it pastes is what it gets.
--
-- NO SEED DATA, FOR THE SAME REASON.
--
-- HOW THE "OPENS THE APP" PART WORKS, since it looks like it needs something
-- clever and does not. A plain https link to an app's own domain is opened by
-- the installed app on both iOS and Android -- Universal Links and App Links
-- respectively -- and by the browser when the app is absent. Custom schemes
-- like `myapp://` do the opposite: they fail with an error page for everybody
-- who has not installed it. So the column is an ordinary https URL and the
-- platform does the routing. Nothing here has to know what a phone is.

begin;

create table if not exists public.church_apps (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  -- One line under the name. What it is for, in the church's own words.
  blurb       text check (blurb is null or length(blurb) <= 200),
  -- HTTPS ONLY. `http://` would be downgraded or blocked on a phone, and a
  -- scheme like `javascript:` has no business in a column a browser follows.
  -- Same check the library's external_url carries, for the same reason.
  url         text not null check (url ~* '^https://'),
  -- A single emoji, drawn on the tile. Emoji rather than an uploaded icon: no
  -- storage, no quota, no broken image, and components/Glyph.tsx already
  -- records what happens when a symbol that is not an emoji is used instead.
  icon        text check (icon is null or length(icon) <= 8),
  -- Where it sits in the room. Hand-set, because the order a church wants is
  -- pastoral rather than alphabetical: the Bible comes before the hymnal.
  sort_order  integer not null default 0,
  added_by    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists church_apps_church_idx
  on public.church_apps (church_id, sort_order, created_at);

alter table public.church_apps enable row level security;

-- Supabase grants the browser roles everything on a new public table, so the
-- grants are taken back before any policy is written. The policies below are
-- the whole of what anybody may do.
revoke all on table public.church_apps from public, anon, authenticated;
grant select on table public.church_apps to authenticated;
grant insert, update, delete on table public.church_apps to authenticated;

drop policy if exists church_apps_read  on public.church_apps;
drop policy if exists church_apps_write on public.church_apps;
drop policy if exists church_apps_edit  on public.church_apps;
drop policy if exists church_apps_drop  on public.church_apps;

-- EVERYONE IN THE CHURCH READS IT, INCLUDING EXPLORERS. This is the one room
-- where that is the point: a hymnal and a Bible are for the congregation, not
-- for leadership. An approved member of this church, and nobody else.
create policy church_apps_read on public.church_apps
  for select to authenticated
  using (church_id = public.my_church_id() and public.is_approved_user());

-- ONLY LEADERSHIP ADDS. The room is what the church offers, the same rule the
-- library applies to its shelf -- and `manages_church` is role AND church
-- together, so a Director of one congregation cannot write into another's.
create policy church_apps_write on public.church_apps
  for insert to authenticated
  with check (added_by = (select auth.uid()) and public.manages_church(church_id));

create policy church_apps_edit on public.church_apps
  for update to authenticated
  using (public.manages_church(church_id))
  with check (public.manages_church(church_id));

create policy church_apps_drop on public.church_apps
  for delete to authenticated
  using (public.manages_church(church_id));

commit;

-- AND THE ROOM KEEPS UP.
--
-- A subscription to a table that is not in the publication is SILENT: it looks
-- wired, it errors nowhere, and it delivers nothing. `REPLICA IDENTITY FULL` is
-- the other half -- without it an update arrives carrying only the key, and a
-- screen re-reading on that event sees nothing to re-read.
--
-- This table is small and changes rarely, which is exactly why a stale copy is
-- easy to miss: somebody adds the hymnal on Sabbath morning and nobody sees it
-- until they next open the app cold.
--
-- It is safe to publish because it HAS a read policy. Realtime evaluates the
-- same policy per subscriber, so a member of one church can never be delivered
-- another church's row -- and a table with row level security on and no policy
-- would be the silent case above, which lib/live/keep-up.ts documents at
-- length.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'church_apps'
  ) then
    alter publication supabase_realtime add table public.church_apps;
  end if;
end
$$;

alter table public.church_apps replica identity full;
