-- Leaders choose the apps on Discover; everybody in the church sees them.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 17 NOVEMBER 2026: Admins and Executive Directors add the web
-- apps and other technology the church recommends to Discover on Home, from
-- inside the app, rather than a developer editing a deployment setting.
--
-- WHO: whoever manages the church (manages_church: its Admin, and the
-- Executive Directors who oversee it) adds, changes and removes; everybody in
-- the church, and those who oversee it, read. Nobody else sees them at all.
--
-- THE POCKET'S RULES HOLD HERE TOO, because a card can be kept in the Pocket
-- with one tap: https only (stricter than the Pocket, since a whole church is
-- sent there), and the same database trigger that keeps social feeds out of
-- the Pocket (private.the_pocket_is_for_tools) keeps them out of Discover.
--
-- Proved by supabase/tests/leaders-choose-the-apps.sql, written first.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.discover_apps (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 60),
  url        text not null check (url ~* '^https://' and length(url) between 12 and 2048),
  about      text not null default '' check (length(about) <= 120),
  added_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- The same app twice on one church's Discover is a mistake.
  unique (church_id, url)
);

create index if not exists discover_apps_church_idx on public.discover_apps (church_id, created_at);

alter table public.discover_apps enable row level security;

-- One policy per verb, as everywhere else.
drop policy if exists discover_apps_read   on public.discover_apps;
drop policy if exists discover_apps_add    on public.discover_apps;
drop policy if exists discover_apps_change on public.discover_apps;
drop policy if exists discover_apps_remove on public.discover_apps;

create policy discover_apps_read on public.discover_apps
  for select to authenticated
  using (
    (church_id = (select public.my_church_id()) and (select public.is_approved_user()))
    or public.manages_church(church_id)
  );

create policy discover_apps_add on public.discover_apps
  for insert to authenticated
  with check (public.manages_church(church_id));

create policy discover_apps_change on public.discover_apps
  for update to authenticated
  using (public.manages_church(church_id))
  with check (public.manages_church(church_id));

create policy discover_apps_remove on public.discover_apps
  for delete to authenticated
  using (public.manages_church(church_id));

grant select, insert, update, delete on public.discover_apps to authenticated;
revoke all on public.discover_apps from anon;

drop trigger if exists discover_apps_are_tools on public.discover_apps;
create trigger discover_apps_are_tools
  before insert or update on public.discover_apps
  for each row execute function private.the_pocket_is_for_tools();

comment on table public.discover_apps is
  'Apps and study sites a church''s leaders recommend, shown as Discover cards on Home.';

commit;
