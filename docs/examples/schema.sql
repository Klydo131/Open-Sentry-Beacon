-- Open Sentry Beacon — an example schema and permission rules for Postgres.
--
-- THIS FILE HAS BEEN RUN. Every statement was applied to a real PostgreSQL 16
-- database and then attacked from a second account; prove-the-rules.sql is that
-- attack and it passes. An earlier draft of this schema lived only as code
-- blocks in a document, and running it found defects — including one that
-- silently broke the app's most important promise. That is why this is a file
-- you can execute rather than a listing you copy.
--
--   createdb beacon
--   psql -d beacon -f docs/examples/schema.sql
--   psql -d beacon -f docs/examples/prove-the-rules.sql
--
-- ADAPT IT. This is an example for YOUR deployment, not a configuration to
-- adopt unread. Read docs/BUILD-YOUR-OWN.md alongside it.

-- ===========================================================================
-- 0. WHO IS ASKING
--
-- Every rule turns on "who is making this request". Managed backends provide
-- this — Supabase has auth.uid(). Vanilla Postgres does not, so here is the
-- equivalent. Your app sets this once per connection from a VERIFIED session,
-- never from anything the browser sent you.
-- ===========================================================================
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- ===========================================================================
-- 1. TABLES
-- ===========================================================================
create table churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table profiles (
  id           uuid primary key,               -- same id as the account
  full_name    text not null check (length(full_name) between 1 and 120),
  email        text unique not null,
  role         text not null check (role in ('ds','dm','admin','executive')),
  is_approved  boolean not null default false,
  church_id    uuid not null references churches(id),
  created_at   timestamptz not null default now()
);

-- One missionary walking with one seeker. The unit the whole app is built on.
create table pairings (
  id          uuid primary key default gen_random_uuid(),
  dm_id       uuid not null references profiles(id),
  ds_id       uuid not null references profiles(id),
  stage       text not null default 'connect',
  track       text not null default 'digital',
  created_at  timestamptz not null default now(),
  unique (dm_id, ds_id)
);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references pairings(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- A missionary's private notes. Not readable by the admin. Not by the seeker.
create table notes (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references pairings(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- 1b. POLICY HELPER
--
-- Defined after the tables: a `language sql` body is validated when created,
-- so a function reading `profiles` cannot exist before `profiles` does.
--
-- SECURITY DEFINER runs as the owner, which is what stops a policy on a table
-- from recursing when it needs to look something up. `set search_path` is not
-- optional — without it a caller can point this at their own table.
-- ===========================================================================
create or replace function auth.my_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where id = auth.uid()
$$;

-- Membership of a pairing, answered WITHOUT going through the pairings policy.
--
-- This one is not optional and the reason is subtle. The messages policy needs
-- to ask "is this person in that pairing?". Asking it with a plain sub-select
-- runs that sub-select under the pairings policy — which excludes seekers, so a
-- seeker could not read their own conversation. The rule that hides the stage
-- silently took the seeker's messages with it.
create or replace function auth.in_pairing(p uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from pairings
    where id = p and (dm_id = auth.uid() or ds_id = auth.uid())
  )
$$;

-- Same reason: a policy on `profiles` cannot sub-select `profiles`.
create or replace function auth.my_church() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select church_id from profiles where id = auth.uid()
$$;

-- ===========================================================================
-- 2. THE RULES
--
-- Enabling RLS with no policy denies everything to non-owners — correct, and a
-- confusing failure: the owner at a psql prompt still sees every row while the
-- application sees none.
-- ===========================================================================
alter table pairings enable row level security;
alter table messages enable row level security;
alter table notes    enable row level security;

-- ---------------------------------------------------------------------------
-- THE PROMISE THIS SCHEMA EXISTS TO KEEP:
-- A SEEKER NEVER SEES THEIR OWN JOURNEY STAGE.
--
-- A stage is a note the church keeps in order to organise its work. It is not
-- a grade to show a person about themselves, and showing it is the single
-- change most likely to damage somebody.
--
-- The obvious policy — "you may read a pairing you are in" — hands the seeker
-- the whole row, and `stage` is a column on that row. It looks right, the
-- screens hide the value, and the promise is broken the moment anybody queries
-- the database directly. That is exactly the mistake this project warns about
-- everywhere else: screens decide what to SHOW, the database decides what
-- somebody is ALLOWED TO HAVE.
--
-- So the table excludes seekers, and seekers read a view that has no stage
-- column in it at all. Absent, not hidden.
-- ---------------------------------------------------------------------------
create policy "pairings for the missionary and admins" on pairings
for select using (
  dm_id = auth.uid() or auth.my_role() in ('admin','executive')
);

-- A FUNCTION, not a view, and the difference is worth one paragraph.
--
-- Either works. Both run with the owner's rights, and in both the WHERE clause
-- below is the access control — it must not be blocked by the policy above, or
-- a seeker sees nothing at all. What separates them is tooling: Supabase's
-- database linter grades a SECURITY DEFINER *view* as ERROR and a SECURITY
-- DEFINER *function* as WARN, and every other privileged helper in this schema
-- is already a function. A permanent red mark on a dashboard is how a team
-- learns to stop reading the dashboard.
--
-- If you are tempted by the linter's suggested fix — making it
-- `security_invoker` — do not. That makes it obey the CALLER's policies, and the
-- caller here is a seeker whom the policy above deliberately excludes. Their
-- home screen goes blank. Test it before you believe either of us.
--
-- `search_path` is pinned. An unpinned search_path on a SECURITY DEFINER
-- function is a genuine privilege-escalation route, and that is the real risk
-- the linter is pointing at.
create or replace function my_journey()
returns table (id uuid, dm_id uuid, ds_id uuid, track text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.dm_id, p.ds_id, p.track
  from pairings p
  where p.ds_id = auth.uid();
$$;

-- A conversation belongs to the two people in the pairing.
create policy "own conversation" on messages
for select using (auth.in_pairing(pairing_id));

-- You may only send as yourself, into a pairing you are in.
create policy "send as self" on messages
for insert with check (
  sender_id = auth.uid() and auth.in_pairing(pairing_id)
);

-- Private notes: the author alone. No admin exception — that is the promise
-- made to a missionary, and an exception would quietly void it.
create policy "own notes" on notes
for all using (author_id = auth.uid())
with check (author_id = auth.uid());

-- ===========================================================================
-- 2b. MEDIA — images, audio, video, documents
--
-- The bytes do NOT go in the database. They go in object storage (S3, R2,
-- Supabase Storage, a disk). This table holds the metadata and a path.
--
-- THE MISTAKE THAT LEAKS EVERYTHING: protecting this row and leaving the file
-- itself on a public URL. Row-level rules govern the ROW, not the object. If
-- the file is reachable by anybody who has the link, then the link is the
-- permission, and anybody who is ever sent one keeps it forever.
--
-- So: keep the bucket private, and have your server mint a SHORT-LIVED SIGNED
-- URL only after checking the same rule the row uses. Minutes, not days.
-- ===========================================================================
create table media (
  id           uuid primary key default gen_random_uuid(),
  pairing_id   uuid references pairings(id) on delete cascade,
  church_id    uuid not null references churches(id),
  owner_id     uuid not null references profiles(id),
  kind         text not null check (kind in ('image','audio','video','document')),
  storage_path text not null,          -- a key in your bucket, never a public URL
  bytes        bigint not null check (bytes > 0),
  created_at   timestamptz not null default now()
);

alter table media enable row level security;

-- Media attached to a pairing follows the pairing. Media with no pairing is
-- church-wide library material and is readable by the church.
create policy "media follows its pairing" on media
for select using (
  (pairing_id is not null and auth.in_pairing(pairing_id))
  or (pairing_id is null and church_id = auth.my_church())
);

create policy "upload as self" on media
for insert with check (
  owner_id = auth.uid()
  and (pairing_id is null or auth.in_pairing(pairing_id))
);

-- ===========================================================================
-- 2c. REAL-TIME SYNCHRONISATION
--
-- Two people on two devices should see a message appear without refreshing.
--
-- THE MISTAKE HERE IS THE SAME SHAPE AS THE MEDIA ONE: a change feed is a
-- second way out of your database, and it does not automatically obey the
-- rules you wrote for queries. A naive subscription broadcasts every row that
-- changes to everybody listening — including the private note you just wrote.
--
-- Whatever provider you use, confirm two things before you trust it:
--   1. The subscription is filtered by the SAME rules as a query. On Postgres
--      providers this usually means enabling RLS for the replication feed, not
--      only for queries — they are separate switches.
--   2. You subscribe per-pairing, not to the whole table. Least privilege
--      applies to feeds too.
--
-- Then TEST it the way you tested the queries: connect two clients as two
-- different people, write as one, and confirm the other does NOT receive what
-- they should not see. A feed leak is invisible from the sending side.
-- ===========================================================================
-- Provider-specific, so it is a comment rather than a statement — this file
-- has to apply cleanly on plain Postgres. Enable the feed the way YOUR provider
-- does, for example:
--
--   alter publication supabase_realtime add table messages;
--
-- On plain Postgres you would create a publication and have your own server
-- relay changes over a WebSocket, re-checking the rule for each subscriber
-- before forwarding anything.

-- ===========================================================================
-- 3. NOBODY CHANGES THEIR OWN ROLE
-- ===========================================================================
alter table profiles enable row level security;

create policy "read profiles in my church" on profiles
for select using (church_id = auth.my_church());

create policy "update own profile" on profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- Admins run the church. This is how approval and promotion happen at all.
create policy "admins manage profiles in their church" on profiles
for update using (
  auth.my_role() in ('admin','executive') and church_id = auth.my_church()
) with check (
  auth.my_role() in ('admin','executive') and church_id = auth.my_church()
);

-- Whatever the client sent for role or approval on THEIR OWN row, keep what is
-- stored. The update succeeds and changes nothing: an error would tell an
-- attacker they had found the right lever.
--
-- THE `if` IS LOAD-BEARING. Pinning unconditionally looks safer and is worse:
-- it also blocks an admin approving a new member and an admin promoting a
-- missionary, which are the two things administration consists of. A first
-- draft of this file did exactly that, and the symptom was not an error — the
-- update simply succeeded and nothing changed, so the church would have
-- concluded the app was broken with nothing in any log to explain it.
create or replace function pin_role()
returns trigger language plpgsql as $$
begin
  if new.id = auth.uid() then
    new.role        := old.role;
    new.is_approved := old.is_approved;
  end if;
  return new;
end $$;

create trigger profiles_pin_role
  before update on profiles
  for each row execute function pin_role();

-- ===========================================================================
-- 4. THE APPLICATION'S DATABASE ROLE
--
-- Your app must NOT connect as the owner or a superuser. Both bypass RLS, so
-- every rule above would be inert and every test of them would pass for the
-- wrong reason.
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'change-me';
  end if;
end $$;

grant usage on schema public, auth to app_user;
grant select, insert, update on all tables in schema public to app_user;
grant execute on function auth.in_pairing(uuid) to app_user;
grant execute on function my_journey() to app_user;
grant execute on function auth.uid(), auth.my_role(), auth.in_pairing(uuid), auth.my_church() to app_user;
