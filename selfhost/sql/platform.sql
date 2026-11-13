-- What a database needs before Hope Beacon's first migration, on plain Postgres.
--
-- WHY THIS FILE EXISTS. Every file in supabase/migrations was written for a
-- Supabase project, which starts life with roles, a sign-in schema, a file
-- store and three extensions already in place. A plain Postgres server (your
-- own machine, a small VPS, a managed Postgres from any provider) has none of
-- them. This file creates exactly what the migrations expect, so the same
-- migrations install unchanged, and the database that results is the same app
-- as the Supabase one. selfhost/server/src/migrate.mjs runs it before the
-- migrations, and CI compares the two databases line by line
-- (.github/workflows/postgres-edition.yml).
--
-- Copied from what an empty supabase/postgres:17.6.1.011 database holds
-- (read on 20 October 2026), plus the sign-in tables the Supabase sign-in
-- service adds when it starts (supabase/tests/platform-stand-in.sql).
--
-- THREE THINGS ARE STAND-INS, not the real extensions, because most Postgres
-- servers outside Supabase do not ship them:
--   cron   the schedule (pg_cron). The migrations schedule four jobs (nightly,
--          hourly and every minute); the Beacon server runs them (src/jobs.mjs).
--   net    outgoing web requests (pg_net). The migrations queue a request when
--          a notification should reach a phone; the Beacon server sends it.
--   vault  named settings (supabase_vault). NOT ENCRYPTED here. Nothing secret
--          is put in it by this edition (see src/migrate.mjs, "the vault").
--
-- Safe to run more than once. Run it as the database's owner; creating the
-- service_role role (which bypasses row rules) and the event trigger at the
-- end need a superuser, which is what the Docker setup gives you.

-- ---------------------------------------------------------------- roles ----
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- The one role the data API (PostgREST) signs in as. It can become anon,
  -- authenticated or service_role, and nothing else, and has no rights itself.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
-- So the owner can act as somebody in a test, as the Supabase owner can.
grant anon, authenticated, service_role, authenticator to current_user;

-- The owner finds the extensions without naming their schema, as the owner of
-- a Supabase project does. The migrations were written that way, and a default
-- such as gen_random_bytes(32) is then stored and shown the same way.
do $$ begin
  execute format('alter role %I in database %I set search_path = "$user", public, extensions',
                 current_user, current_database());
end $$;
set search_path = "$user", public, extensions;

-- A runaway request is stopped, as on a Supabase project.
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';

-- ------------------------------------------------------------ extensions ----
create schema if not exists extensions;
grant usage on schema extensions to current_user, anon, authenticated, service_role;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------- what anybody is given ----
-- New tables, functions and sequences in public are usable by the API roles
-- by default, and the migrations take away what each one must not have. This
-- is Supabase's default, and the migrations were written against it, so a
-- database without it would refuse things the app relies on.
grant usage on schema public to current_user, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to current_user, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to current_user, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to current_user, anon, authenticated, service_role;

-- --------------------------------------------------------------- sign-in ----
-- The tables the sign-in part of the Beacon server keeps (src/auth.mjs), in
-- the shapes the Supabase sign-in service uses, so a database moved from
-- Supabase keeps every account, password and two-step setup as it was.
create schema if not exists auth;
grant usage on schema auth to current_user, anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text unique default null,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0 check (email_change_confirm_status between 0 and 2),
  banned_until timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);
create unique index if not exists users_email_partial_key on auth.users (email) where (is_sso_user = false);
create index if not exists users_instance_id_idx on auth.users (instance_id);

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  aal text,
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text,
  oauth_client_id uuid,
  refresh_token_hmac_key text,
  refresh_token_counter bigint,
  scopes text
);
create index if not exists sessions_user_id_idx on auth.sessions (user_id);

create table if not exists auth.refresh_tokens (
  instance_id uuid,
  id bigserial primary key,
  token varchar(255),
  user_id varchar(255),
  revoked boolean,
  created_at timestamptz,
  updated_at timestamptz,
  parent varchar(255),
  session_id uuid references auth.sessions (id) on delete cascade
);
create unique index if not exists refresh_tokens_token_unique on auth.refresh_tokens (token);
create index if not exists refresh_tokens_session_id_revoked_idx on auth.refresh_tokens (session_id, revoked);
create index if not exists refresh_tokens_parent_idx on auth.refresh_tokens (parent);

do $$ begin
  if to_regtype('auth.factor_type') is null then
    create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
  end if;
  if to_regtype('auth.factor_status') is null then
    create type auth.factor_status as enum ('unverified', 'verified');
  end if;
end $$;

create table if not exists auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type auth.factor_type not null,
  status auth.factor_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  secret text,
  phone text,
  last_challenged_at timestamptz,
  web_authn_credential jsonb,
  web_authn_aaguid uuid,
  last_webauthn_challenge_data jsonb
);
create index if not exists mfa_factors_user_id_idx on auth.mfa_factors (user_id);

-- One row per "type the code now". otp_code holds the 30-second step a code
-- was accepted for, so the same code cannot be used twice.
create table if not exists auth.mfa_challenges (
  id uuid primary key,
  factor_id uuid not null references auth.mfa_factors (id) on delete cascade,
  created_at timestamptz not null,
  verified_at timestamptz,
  ip_address inet not null default '0.0.0.0',
  otp_code text,
  web_authn_session_data jsonb
);
create index if not exists mfa_challenges_factor_idx on auth.mfa_challenges (factor_id, verified_at);

create table if not exists auth.mfa_amr_claims (
  id uuid primary key,
  session_id uuid not null references auth.sessions (id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  authentication_method text not null,
  unique (session_id, authentication_method)
);

-- Links e-mailed for an invitation or a password reset. Only a hash is kept.
create table if not exists auth.one_time_tokens (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_type text not null,
  token_hash text not null,
  relates_to text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempts integer not null default 0,
  unique (user_id, token_type)
);
create index if not exists one_time_tokens_token_hash_idx on auth.one_time_tokens (token_hash);

create table if not exists auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid primary key default gen_random_uuid(),
  unique (provider_id, provider)
);

-- What the sign-in server did, for whoever looks after the database.
create table if not exists auth.audit_log_entries (
  instance_id uuid,
  id uuid primary key,
  payload json,
  created_at timestamptz,
  ip_address varchar(64) not null default ''
);

-- Nobody but the owner reads or writes any of it. The Beacon server signs in
-- as the owner; the app's own definer functions run as the owner too.
revoke all on all tables in schema auth from public, anon, authenticated, service_role;
revoke all on all sequences in schema auth from public, anon, authenticated, service_role;

-- auth.uid(), auth.role(), auth.email() and auth.jwt() as a Supabase project
-- has them: the request's claims, in either of the two forms PostgREST has
-- used to set them.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role()
returns text
language sql
stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
create or replace function auth.email()
returns text
language sql
stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

-- ------------------------------------------------------------ file store ----
-- The rows the file part of the Beacon server keeps (src/storage.mjs). The
-- files themselves are on disk, named by each row's id, never by its path.
-- Every upload, read and removal is done AS THE PERSON asking, so the
-- migrations' row rules on storage.objects decide, exactly as on Supabase.
create schema if not exists storage;
grant usage on schema storage to current_user, anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
create unique index if not exists bname on storage.buckets (name);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
create unique index if not exists bucketid_objname on storage.objects (bucket_id, name);
create index if not exists name_prefix_search on storage.objects (name text_pattern_ops);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
alter default privileges in schema storage grant all on tables to current_user, anon, authenticated, service_role;
alter default privileges in schema storage grant all on functions to current_user, anon, authenticated, service_role;
alter default privileges in schema storage grant all on sequences to current_user, anon, authenticated, service_role;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
_parts text[];
begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts,1)-1];
end
$$;
create or replace function storage.filename(name text)
returns text
language plpgsql
as $$
declare
_parts text[];
begin
    select string_to_array(name, '/') into _parts;
    return _parts[array_length(_parts,1)];
end
$$;
create or replace function storage.extension(name text)
returns text
language plpgsql
as $$
declare
_parts text[];
_filename text;
begin
    select string_to_array(name, '/') into _parts;
    select _parts[array_length(_parts,1)] into _filename;
    return split_part(_filename, '.', 2);
end
$$;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------- live data ----
-- The migrations add tables to this publication to say "the screen keeps up
-- with this one". The Beacon server follows the same list (see "Live data"
-- below).
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ------------------------------------------------------- the stand-ins ----
-- cron: the same calls pg_cron answers, kept as rows. The Beacon server reads
-- cron.job every minute and runs what is due, one server at a time.
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text unique
);
create table if not exists cron.job_run_details (
  jobid bigint,
  runid bigserial primary key,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint
language plpgsql
as $$
declare
  id bigint;
begin
  if array_length(regexp_split_to_array(btrim(schedule), '\s+'), 1) <> 5 then
    raise exception 'invalid schedule: %', schedule using hint = 'Five fields: minute hour day month weekday.';
  end if;
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid into id;
  return id;
end
$$;
create or replace function cron.schedule(schedule text, command text)
returns bigint
language sql
as $$ select cron.schedule(null::text, schedule, command) $$;
create or replace function cron.unschedule(job_name text)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobname = job_name;
  if not found then
    raise exception 'could not find valid entry for job ''%''', job_name;
  end if;
  return true;
end
$$;
create or replace function cron.unschedule(job_id bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = job_id;
  if not found then
    raise exception 'could not find valid entry for job %', job_id;
  end if;
  return true;
end
$$;
revoke all on schema cron from public;
revoke all on all tables in schema cron from public;
revoke all on all functions in schema cron from public;

-- net: http_post queues a request and returns at once, as pg_net does, so a
-- slow push service never holds up the change that asked for it. The Beacon
-- server is woken by the notice and sends it (src/jobs.mjs).
create schema if not exists net;
create table if not exists net.http_request_queue (
  id bigserial primary key,
  method text not null,
  url text not null,
  headers jsonb not null default '{}',
  body bytea,
  timeout_milliseconds integer not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_try_at timestamptz not null default now(),
  last_error text
);
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
as $$
declare
  request_id bigint;
  query text;
begin
  select string_agg(format('%s=%s', key, value), '&') into query from jsonb_each_text(coalesce(params, '{}'));
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST',
          url || coalesce('?' || query, ''),
          coalesce(headers, '{}') || jsonb_build_object('Content-Type', 'application/json'),
          convert_to(coalesce(body, '{}')::text, 'utf8'),
          coalesce(timeout_milliseconds, 5000))
  returning id into request_id;
  perform pg_notify('beacon_net', request_id::text);
  return request_id;
end
$$;
revoke all on schema net from public;
revoke all on all tables in schema net from public;
revoke all on all functions in schema net from public;

-- vault: named settings. Plain text, readable by the owner only.
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at
    from vault.secrets;
create or replace function vault.create_secret(
  new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null
)
returns uuid
language sql
as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, coalesce(new_description, ''))
  returning id
$$;
create or replace function vault.update_secret(
  secret_id uuid, new_secret text default null, new_name text default null,
  new_description text default null, new_key_id uuid default null
)
returns void
language sql
as $$
  update vault.secrets
     set secret = coalesce(new_secret, secret),
         name = coalesce(new_name, name),
         description = coalesce(new_description, description),
         updated_at = now()
   where id = secret_id
$$;
revoke all on schema vault from public;
revoke all on all tables in schema vault from public;
revoke all on all functions in schema vault from public;

-- ---------------------------------------------------------- the edition ----
-- What this edition keeps for itself: the migrations it has applied, and the
-- one function behind live data.
create schema if not exists beacon_platform;
revoke all on schema beacon_platform from public;

create table if not exists beacon_platform.applied_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);

-- LIVE DATA. Supabase reads every change from the write-ahead log. That needs
-- settings many Postgres hosts do not allow, and a log slot that fills the disk
-- if its reader stops, so this edition asks each published table to say when
-- a row changed: which table, which kind of change, and the row's key. Never
-- the row itself. The Beacon server then asks the database, AS EACH PERSON
-- WATCHING, whether they may see that row before it tells their screen
-- (src/realtime.mjs).
create or replace function beacon_platform.announce()
returns trigger
language plpgsql
as $$
declare
  rec record;
  key jsonb := '{}';
  col text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  foreach col in array tg_argv loop
    key := key || jsonb_build_object(col, to_jsonb(rec) -> col);
  end loop;
  perform pg_notify('beacon_realtime', jsonb_build_object(
    's', tg_table_schema, 't', tg_table_name, 'op', tg_op, 'k', key,
    -- A deleted row cannot be re-read, so its small values travel with the
    -- notice for the watchers' filters. Long text never does.
    'o', case when tg_op = 'DELETE' then (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}')
        from jsonb_each(to_jsonb(old)) e
       where jsonb_typeof(e.value) in ('string', 'number', 'boolean')
         and length(e.value::text) <= 80
    ) end
  )::text);
  return null;
end
$$;
revoke all on function beacon_platform.announce() from public;

-- Every published table gets the announcement, and a table that leaves the
-- publication loses it. Run by the installer after the migrations, and by the
-- event trigger below whenever a migration changes the publication by hand.
create or replace function beacon_platform.follow_the_publication()
returns void
language plpgsql
as $$
declare
  t record;
  keys text;
begin
  for t in
    select c.oid, n.nspname, c.relname
      from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where tg.tgname = 'beacon_platform_announce'
       and not exists (select 1 from pg_publication_tables p
                        where p.pubname = 'supabase_realtime' and p.schemaname = n.nspname and p.tablename = c.relname)
  loop
    execute format('drop trigger beacon_platform_announce on %I.%I', t.nspname, t.relname);
  end loop;

  for t in
    select p.schemaname, p.tablename, c.oid
      from pg_publication_tables p
      join pg_namespace n on n.nspname = p.schemaname
      join pg_class c on c.relnamespace = n.oid and c.relname = p.tablename
     where p.pubname = 'supabase_realtime'
       and not exists (select 1 from pg_trigger tg where tg.tgrelid = c.oid and tg.tgname = 'beacon_platform_announce')
  loop
    select string_agg(quote_literal(a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
      into keys
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = t.oid and i.indisprimary;
    if keys is null then
      continue;  -- no primary key: nothing to re-read a row by, so nothing to announce
    end if;
    execute format(
      'create trigger beacon_platform_announce after insert or update or delete on %I.%I '
      'for each row execute function beacon_platform.announce(%s)',
      t.schemaname, t.tablename, keys);
  end loop;
end
$$;
revoke all on function beacon_platform.follow_the_publication() from public;

create or replace function beacon_platform.publication_changed()
returns event_trigger
language plpgsql
as $$
begin
  perform beacon_platform.follow_the_publication();
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = current_user and rolsuper)
     and not exists (select 1 from pg_event_trigger where evtname = 'beacon_platform_follows_the_publication') then
    create event trigger beacon_platform_follows_the_publication on ddl_command_end
      when tag in ('ALTER PUBLICATION', 'CREATE PUBLICATION')
      execute function beacon_platform.publication_changed();
  end if;
end $$;
