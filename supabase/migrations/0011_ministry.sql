-- Recommendations, a Guide's private tools, and lesson series.
--
-- The live app had the relationship loop and none of the ministry around it.
-- These are the tables the sample-data version has had all along.
--
-- WHAT IS PRIVATE, AND FROM WHOM. seeker_notes and follow_ups belong to the
-- Guide who wrote them and to NOBODY else — not the Explorer they are about,
-- not the Director above them. A private note a leader can read is not a
-- private note, so the policy is `author_id = auth.uid()` with no leadership
-- branch, rather than a screen that politely declines to render one.
--
-- A GUIDE CANNOT INVITE. They recommend; a Director decides. That is enforced
-- here as well as in the interface: rec_create requires auth_role() = 'dm', and
-- only manages_church() may move a recommendation to 'invited'.

create type recommendation_status as enum ('pending', 'invited', 'declined');

create table if not exists public.recommendations (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  dm_id       uuid not null references public.profiles (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) between 1 and 200),
  email       text not null check (position('@' in email) > 1),
  note        text check (note is null or length(note) <= 2000),
  status      recommendation_status not null default 'pending',
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.seeker_notes (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references public.pairings (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create table if not exists public.follow_ups (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references public.pairings (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 300),
  due_on      date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.lesson_series (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  description  text check (description is null or length(description) <= 2000),
  topic        text not null default 'General',
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.lesson_assignments (
  id           uuid primary key default gen_random_uuid(),
  pairing_id   uuid not null references public.pairings (id) on delete cascade,
  series_id    uuid not null references public.lesson_series (id) on delete cascade,
  assigned_by  uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (pairing_id, series_id)
);

create index if not exists rec_church_idx    on public.recommendations (church_id, created_at desc);
create index if not exists notes_pairing_idx on public.seeker_notes (pairing_id, created_at desc);
create index if not exists fu_owner_idx      on public.follow_ups (owner_id, due_on);
create index if not exists la_pairing_idx    on public.lesson_assignments (pairing_id);

alter table public.recommendations    enable row level security;
alter table public.seeker_notes       enable row level security;
alter table public.follow_ups         enable row level security;
alter table public.lesson_series      enable row level security;
alter table public.lesson_assignments enable row level security;

drop policy if exists rec_read on public.recommendations;
drop policy if exists rec_create on public.recommendations;
drop policy if exists rec_decide on public.recommendations;
create policy rec_read on public.recommendations for select to authenticated
  using (dm_id = (select auth.uid()) or public.manages_church(church_id));
create policy rec_create on public.recommendations for insert to authenticated
  with check (dm_id = (select auth.uid()) and public.auth_role() = 'dm' and church_id = public.my_church_id());
create policy rec_decide on public.recommendations for update to authenticated
  using (public.manages_church(church_id)) with check (public.manages_church(church_id));

drop policy if exists notes_own on public.seeker_notes;
create policy notes_own on public.seeker_notes for all to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

drop policy if exists fu_own on public.follow_ups;
create policy fu_own on public.follow_ups for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists ls_read on public.lesson_series;
drop policy if exists ls_write on public.lesson_series;
create policy ls_read on public.lesson_series for select to authenticated
  using (is_published and church_id = public.my_church_id());
create policy ls_write on public.lesson_series for all to authenticated
  using (public.manages_church(church_id)) with check (public.manages_church(church_id));

drop policy if exists la_read on public.lesson_assignments;
drop policy if exists la_write on public.lesson_assignments;
drop policy if exists la_update on public.lesson_assignments;
create policy la_read on public.lesson_assignments for select to authenticated
  using (public.in_pairing(pairing_id));
create policy la_write on public.lesson_assignments for insert to authenticated
  with check (assigned_by = (select auth.uid()) and public.in_pairing(pairing_id));
create policy la_update on public.lesson_assignments for update to authenticated
  using (public.in_pairing(pairing_id)) with check (public.in_pairing(pairing_id));

-- Close the new definer surface the same way 0010 did, because a migration that
-- adds functions and forgets this re-opens what 0010 shut.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prorettype='trigger'::regtype
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;
