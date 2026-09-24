-- What a brand-new Supabase project already has before its first migration,
-- beyond what the supabase/postgres image sets up by itself.
--
-- WHY THIS FILE EXISTS. scripts/fresh-install.sh builds a database the way a
-- new church does -- every migration in supabase/migrations, in order, on an
-- empty project -- to prove the repository installs in one pass and produces
-- the same database as the live one. The supabase/postgres image is the same
-- Postgres Supabase runs, with the same roles and extensions, but the sign-in
-- and storage SERVICES add their own tables when a real project starts, and the
-- image alone does not have them. These are those tables' shapes, copied from a
-- live project's catalogue on 23 September 2026. Columns only; no rows.
--
-- Run as supabase_admin, before the first migration.

alter table auth.users add column if not exists phone text default null;
alter table auth.users add column if not exists phone_confirmed_at timestamptz;
alter table auth.users add column if not exists phone_change text default '';
alter table auth.users add column if not exists phone_change_token varchar(255) default '';
alter table auth.users add column if not exists phone_change_sent_at timestamptz;
alter table auth.users add column if not exists confirmed_at timestamptz;
alter table auth.users add column if not exists email_change_token_current varchar(255) default '';
alter table auth.users add column if not exists email_change_confirm_status smallint default 0;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists reauthentication_token varchar(255) default '';
alter table auth.users add column if not exists reauthentication_sent_at timestamptz;
alter table auth.users add column if not exists is_sso_user boolean default false;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists is_anonymous boolean default false;
create table if not exists auth.sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz, updated_at timestamptz, factor_id uuid, aal text, not_after timestamptz,
  refreshed_at timestamp, user_agent text, ip inet, tag text, oauth_client_id uuid,
  refresh_token_hmac_key text, refresh_token_counter bigint, scopes text);
alter table auth.refresh_tokens add column if not exists session_id uuid;
alter table storage.buckets add column if not exists public boolean default false;
alter table storage.buckets add column if not exists avif_autodetection boolean default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
alter table storage.buckets add column if not exists owner_id text;
alter table storage.objects add column if not exists version text;
alter table storage.objects add column if not exists owner_id text;
alter table storage.objects add column if not exists user_metadata jsonb;
-- The realtime publication a new project is created with.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
