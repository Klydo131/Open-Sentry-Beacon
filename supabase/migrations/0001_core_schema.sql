-- Open Sentry Beacon — the core schema.
--
-- ONE FILE, ON PURPOSE. The private repo this came from has forty-four
-- migrations, because it grew a church at a time and each step had to be
-- reversible against live data. You do not want that history; you want the
-- shape it arrived at. So this is the destination, written once, with the
-- security fixes that took three audits to find already built in rather than
-- bolted on at migration 38.
--
-- WHAT THIS GIVES YOU. The core loop: a church, its people, who walks with
-- whom, the conversation between them, and the six-stage journey. Not lessons,
-- meetings, prayer, invitations or push — those are separate files, and the
-- loop works without them.
--
-- HOW TO RUN IT. In your own Supabase project: SQL Editor, paste, run. Or
-- `supabase db push` if you use the CLI. It is idempotent enough to re-run
-- during setup, but it is not a migration system — once you have people in
-- here, change the database with new files rather than editing this one.
--
-- THE ONE THING TO UNDERSTAND BEFORE YOU CHANGE ANYTHING. Your anon key is
-- public. It ships to every browser; that is what the NEXT_PUBLIC_ prefix
-- means. It is safe for exactly one reason: every table below has row level
-- security on, and the policies decide what that key can reach. The key opens
-- the door. These policies decide which rooms. Turn RLS off on any table here
-- and that table is world-readable to anyone who opens the network tab.

-- PROVED AGAINST A REAL PROJECT, then rolled back. A church was planted with
-- RLS bypassed first, so the zeroes below are refusals rather than an empty
-- database — a distinction that has embarrassed this project before:
--
--   A. truth, no RLS: churches                    1
--   B. as ANON (your public key): churches        0
--   C. as ANON: profiles                          0
--   D. as ANON: messages                          0
--   E. as ANON: pairings                          0
--   F. signed in, but belonging to no church      0
--   G. same, messages                             0
--
-- THE ATTACK SUITE, run against a real project with five real accounts:
--
--   Explorer self-approves                REFUSED 42501
--   Explorer self-promotes to Director    REFUSED 42501
--   Explorer moves their own church       REFUSED 42501
--   Explorer edits their own name         allowed      ← control: app still works
--   Explorer reads their own journey      0 rows
--   Explorer forges a message as Guide    REFUSED 42501
--   Outsider posts into a conversation    REFUSED 42501
--   Outsider reads that conversation      0 rows
--   Unrelated Guide reads the messages    0 rows
--   THE DIRECTOR reads the messages       0 rows       ← the privacy promise
--   Paired Guide reads the messages       1 row        ← control
--   Director reads the roster             5 rows       ← control
--
-- The controls are the half that makes the rest mean anything. The first run of
-- this suite reported (a bug report), which was
-- false: the fixture had already set is_approved = true, so the update changed
-- nothing and the trigger correctly saw no change. A test that starts in the
-- state it is trying to reach proves nothing at all.
--
-- That is the whole argument for publishing the anon key: it reaches nothing on
-- its own. Re-run this after any policy change — it is the cheapest test in the
-- project and the only one that checks the promise the README makes.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role      as enum ('executive', 'admin', 'dm', 'ds');
exception when duplicate_object then null; end $$;

do $$ begin
  create type journey_stage  as enum ('create', 'connect', 'care', 'call', 'cultivate', 'commission');
exception when duplicate_object then null; end $$;

do $$ begin
  create type track_type     as enum ('traditional', 'digital');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pairing_status as enum ('active', 'paused', 'completed', 'archived');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.churches (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- A profile is one-to-one with an auth user. `role` and `church_id` are the two
-- columns every policy in this file reads, which is exactly why nobody is
-- allowed to change their own — see lock_privileged_profile_columns below.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  church_id          uuid        references public.churches (id) on delete set null,
  role               user_role   not null default 'ds',
  full_name          text,
  preferred_contact  text,
  preferred_language text        not null default 'en',
  topics_of_interest text[]      not null default '{}',
  is_approved        boolean     not null default false,
  is_head_executive  boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Which churches an Executive Director oversees. Small table, large blast
-- radius: it is the only input to oversees_church(), which is half of both
-- manages_church() and can_access_church(). Its write policies are the
-- narrowest in this file, and the reason is written above them.
create table if not exists public.church_executives (
  church_id    uuid not null references public.churches (id) on delete cascade,
  executive_id uuid not null references public.profiles (id) on delete cascade,
  primary key (church_id, executive_id)
);

create table if not exists public.pairings (
  id            uuid primary key default gen_random_uuid(),
  dm_id         uuid           not null references public.profiles (id) on delete cascade,
  ds_id         uuid           not null references public.profiles (id) on delete cascade,
  track         track_type     not null default 'digital',
  journey_stage journey_stage  not null default 'create',
  status        pairing_status not null default 'active',
  created_by    uuid           references public.profiles (id),
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now(),
  unique (ds_id, dm_id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  pairing_id uuid        not null references public.pairings (id) on delete cascade,
  sender_id  uuid        not null references public.profiles (id),
  body       text        not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create table if not exists public.journey_events (
  id         uuid primary key default gen_random_uuid(),
  pairing_id uuid          not null references public.pairings (id) on delete cascade,
  from_stage journey_stage,
  to_stage   journey_stage not null,
  changed_by uuid          references public.profiles (id),
  note       text,
  created_at timestamptz   not null default now()
);

create index if not exists profiles_church_idx   on public.profiles (church_id);
create index if not exists pairings_dm_idx       on public.pairings (dm_id);
create index if not exists pairings_ds_idx       on public.pairings (ds_id);
create index if not exists messages_pairing_idx  on public.messages (pairing_id, created_at);
create index if not exists journey_pairing_idx   on public.journey_events (pairing_id, created_at);

-- ---------------------------------------------------------------------------
-- Who the caller is.
--
-- Every one of these is SECURITY DEFINER and sets an explicit search_path.
-- Definer because a policy on `profiles` that reads `profiles` recurses
-- forever otherwise; the explicit search_path because a definer function
-- without one can be hijacked by a caller who controls their own path.
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select role::text from public.profiles where id = (select auth.uid());
$$;

create or replace function public.my_church_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select church_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.is_executive()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'executive');
$$;

create or replace function public.is_head_executive()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'executive' and is_head_executive
  );
$$;

create or replace function public.oversees_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.church_executives
    where church_id = c and executive_id = (select auth.uid())
  );
$$;

/** Can run the church: its Director, or an Executive Director over it. */
create or replace function public.manages_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select (public.is_admin() and public.my_church_id() = c) or public.oversees_church(c);
$$;

/** Can see the church at all: belongs to it, or oversees it. */
create or replace function public.can_access_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.my_church_id() = c or public.oversees_church(c);
$$;

/**
 * The church a profile belongs to, read WITHOUT re-entering profiles' policies.
 *
 * This exists because the obvious spelling deadlocks. A pairings policy that
 * says `manages_church((select church_id from profiles where id = ds_id))`
 * makes that subquery subject to profiles' RLS — and profiles_read_paired
 * queries pairings, which re-enters pairings' policy, which queries profiles.
 * Postgres calls it "infinite recursion detected in policy for relation
 * profiles" and every affected read fails outright.
 *
 * It was caught by running the attack suite against a real database rather than
 * by reading the schema, which is the argument for running it.
 */
create or replace function public.church_of(p uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select church_id from public.profiles where id = p;
$$;

/** Are you and this person the two halves of an active pairing? Same reason. */
create or replace function public.is_paired_with(other uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.pairings
    where status = 'active'
      and ((dm_id = (select auth.uid()) and ds_id = other)
        or (ds_id = (select auth.uid()) and dm_id = other))
  );
$$;

/** One of the two people in this pairing. */
create or replace function public.in_pairing(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.pairings
    where id = p and (dm_id = (select auth.uid()) or ds_id = (select auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- A new sign-up gets a profile, unapproved.
--
-- `is_approved` defaults false and nothing here sets it true: somebody in the
-- church has to say yes. That is the whole invitation model in one default.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- NOBODY PROMOTES THEMSELVES.
--
-- The single most important trigger in this file. Without it, any signed-in
-- person can PATCH their own profile row setting role='admin', because the
-- update policy below lets you edit yourself — and every policy in this schema
-- trusts `role`. An app-layer check does not help: the request goes straight to
-- PostgREST and never touches your code.
--
-- Privileged callers raise instead of being silently ignored, so a Director
-- editing somebody in the dashboard gets a real error rather than a save that
-- appears to work and does not.
-- ---------------------------------------------------------------------------
create or replace function public.lock_privileged_profile_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  caller_privileged boolean := public.is_admin() or public.is_executive();
begin
  if new.id = (select auth.uid()) then
    if new.role is distinct from old.role
       or new.is_approved is distinct from old.is_approved
       or new.church_id is distinct from old.church_id
       or new.is_head_executive is distinct from old.is_head_executive then
      raise exception 'You cannot change your own role, church or approval'
        using errcode = '42501';
    end if;
  elsif not caller_privileged then
    -- Not you, and not somebody entitled: keep the old values rather than error,
    -- so an ordinary write that happens to include these columns still succeeds.
    new.role              := old.role;
    new.is_approved       := old.is_approved;
    new.church_id         := old.church_id;
    new.is_head_executive := old.is_head_executive;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_privileged_profile_columns on public.profiles;
create trigger lock_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.lock_privileged_profile_columns();

-- ---------------------------------------------------------------------------
-- Row level security.
-- ---------------------------------------------------------------------------
alter table public.churches          enable row level security;
alter table public.church_executives enable row level security;
alter table public.profiles          enable row level security;
alter table public.pairings          enable row level security;
alter table public.messages          enable row level security;
alter table public.journey_events    enable row level security;

-- Churches ------------------------------------------------------------------
drop policy if exists churches_read   on public.churches;
drop policy if exists churches_write  on public.churches;
drop policy if exists churches_insert on public.churches;

create policy churches_read on public.churches
  for select to authenticated using (public.can_access_church(id));

create policy churches_write on public.churches
  for update to authenticated
  using (public.manages_church(id)) with check (public.manages_church(id));

-- Only an Executive Director, and only through create_church() below — a bare
-- insert makes a church its creator cannot read back or appoint anyone over.
create policy churches_insert on public.churches
  for insert to authenticated with check (public.is_executive());

-- Church executives ---------------------------------------------------------
-- THE NARROWEST POLICIES HERE, and worth reading before you widen them. The
-- obvious version is `using (is_executive())` — any executive may write any
-- row. That lets any executive insert a row naming themselves and ANY church,
-- after which oversees_church() is true for it and the whole schema opens. The
-- table that scopes an executive must not be writable by every executive.
drop policy if exists church_exec_read   on public.church_executives;
drop policy if exists church_exec_insert on public.church_executives;
drop policy if exists church_exec_update on public.church_executives;
drop policy if exists church_exec_delete on public.church_executives;

create policy church_exec_read on public.church_executives
  for select to authenticated using (public.can_access_church(church_id));

-- The my_church_id branch is the bootstrap case, bounded to your own church.
create policy church_exec_insert on public.church_executives
  for insert to authenticated
  with check (
    public.is_executive()
    and (public.is_head_executive()
         or public.oversees_church(church_id)
         or public.my_church_id() = church_id)
  );

create policy church_exec_update on public.church_executives
  for update to authenticated
  using (public.is_executive() and (public.is_head_executive() or public.oversees_church(church_id)))
  with check (public.is_executive() and (public.is_head_executive() or public.oversees_church(church_id)));

create policy church_exec_delete on public.church_executives
  for delete to authenticated
  using (public.is_executive() and (public.is_head_executive() or public.oversees_church(church_id)));

-- Profiles ------------------------------------------------------------------
drop policy if exists profiles_read_self     on public.profiles;
drop policy if exists profiles_read_church   on public.profiles;
drop policy if exists profiles_read_paired   on public.profiles;
drop policy if exists profiles_update_self   on public.profiles;
drop policy if exists profiles_update_church on public.profiles;

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Leadership sees the roster of a church they run.
create policy profiles_read_church on public.profiles
  for select to authenticated using (public.manages_church(church_id));

-- A Guide and their Explorer can each see the other, and nobody else's.
create policy profiles_read_paired on public.profiles
  for select to authenticated using (public.is_paired_with(id));

-- You may edit yourself; the trigger above decides which columns survive.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy profiles_update_church on public.profiles
  for update to authenticated
  using (public.manages_church(church_id)) with check (public.manages_church(church_id));

-- Pairings ------------------------------------------------------------------
drop policy if exists pairings_read   on public.pairings;
drop policy if exists pairings_write  on public.pairings;
drop policy if exists pairings_update on public.pairings;

create policy pairings_read on public.pairings
  for select to authenticated
  using (
    dm_id = (select auth.uid())
    or ds_id = (select auth.uid())
    or public.manages_church(public.church_of(ds_id))
  );

create policy pairings_write on public.pairings
  for insert to authenticated
  with check (public.manages_church(public.church_of(ds_id)));

-- A Guide moves the journey along; leadership can end a pairing.
create policy pairings_update on public.pairings
  for update to authenticated
  using (dm_id = (select auth.uid())
         or public.manages_church(public.church_of(ds_id)))
  with check (dm_id = (select auth.uid())
         or public.manages_church(public.church_of(ds_id)));

-- Messages ------------------------------------------------------------------
-- THE PRIVACY PROMISE, and it is one policy. No Director branch, no executive
-- branch, no "leadership can audit". Only the two people in the pairing. If you
-- add an exception here you have changed what this app is.
drop policy if exists messages_read on public.messages;
drop policy if exists messages_send on public.messages;
drop policy if exists messages_mark on public.messages;

create policy messages_read on public.messages
  for select to authenticated using (public.in_pairing(pairing_id));

create policy messages_send on public.messages
  for insert to authenticated
  with check (public.in_pairing(pairing_id) and sender_id = (select auth.uid()));

create policy messages_mark on public.messages
  for update to authenticated
  using (public.in_pairing(pairing_id)) with check (public.in_pairing(pairing_id));

-- Journey events ------------------------------------------------------------
-- An Explorer is NOT given their own stage history. A stage is a note the
-- church keeps to remember where a conversation had got to; it is not a
-- position the person is told they occupy.
drop policy if exists journey_read  on public.journey_events;
drop policy if exists journey_write on public.journey_events;

create policy journey_read on public.journey_events
  for select to authenticated
  using (
    exists (
      select 1 from public.pairings p
      where p.id = pairing_id
        and (p.dm_id = (select auth.uid())
             or public.manages_church(public.church_of(p.ds_id)))
    )
  );

create policy journey_write on public.journey_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pairings p
      where p.id = pairing_id and p.dm_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Opening a church, and its first overseer, in one statement.
--
-- Both halves are needed. The insert alone makes a church that its creator
-- cannot read (churches_read needs oversight they do not have) and cannot
-- appoint themselves over (church_exec_insert needs oversight they do not
-- have). The row would be orphaned permanently.
-- ---------------------------------------------------------------------------
create or replace function public.create_church(p_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id  uuid;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_executive() then
    raise exception 'Only an Executive Director may open a church' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'A church needs a name' using errcode = '22023';
  end if;

  insert into public.churches (name) values (btrim(p_name)) returning id into v_id;
  insert into public.church_executives (church_id, executive_id) values (v_id, v_uid);
  return v_id;
end;
$$;

revoke all on function public.create_church(text) from public, anon;
grant execute on function public.create_church(text) to authenticated;
