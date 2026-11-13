-- Trends are counts only: the trends role reads weekly numbers and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, with invented people
-- (20261027160000_trends_in_counts_only):
--
--   COUNTS      the view counts what happened each week per church, and lists
--               every week, so a quiet week reads 0.
--   UNDER 5     any count from 1 to 4 is null ("fewer than 5"); 0 and 5 and
--               up are shown.
--   ONE VIEW    `beacon_trends` reads trends.weekly and nothing else: no table,
--               no person, no private function.
--   NOBODY ELSE the app's roles, signed in or not, cannot read the view.
--   NO DOOR     the role cannot sign in until the owner gives it a login, and
--               the data API cannot switch to it.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;

create or replace function pg_temp.check(p_ok boolean, p_label text) returns void
language sql as $$ insert into results values (coalesce(p_ok, false), p_label) $$;

-- Run a query as a role; answer its first value, or 'ERR:' and the SQLSTATE.
create or replace function pg_temp.as_role(p_role text, p_sql text, p_claims jsonb default null)
returns text language plpgsql as $$
declare v_out text;
begin
  if p_claims is not null then
    perform set_config('request.jwt.claims', p_claims::text, true);
  end if;
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_out;
  exception when others then
    v_out := 'ERR:' || sqlstate;
  end;
  reset role;
  return v_out;
end $$;

-- The four weeks this test lives in, as the view counts them (Monday, UTC).
create or replace function pg_temp.week(p_ago integer) returns timestamptz language sql as $$
  select (date_trunc('week', now() at time zone 'UTC') - make_interval(weeks => p_ago) + interval '1 day 12 hours')
         at time zone 'UTC'
$$;
create or replace function pg_temp.week_starting(p_ago integer) returns date language sql as $$
  select (date_trunc('week', now() at time zone 'UTC') - make_interval(weeks => p_ago))::date
$$;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   dd01 Trends Chapel, made three weeks ago
--   g1   its Guide;  x1..x6 Explorers, each paired with g1
--   Three weeks ago: the church is made, nothing else.
--   Two weeks ago:   7 people join, 6 pairs start, 9 messages in 2 pairs.
--   Last week:       3 messages in 1 pair, 1 report, 5 prayer requests.
--   This week:       nothing.
insert into public.churches (id, name, created_at) values
  ('00000000-0000-0000-0000-0000000000dd', 'Trends Chapel',
   (date_trunc('week', now() at time zone 'UTC') - interval '3 weeks' + interval '1 hour') at time zone 'UTC');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || s)::uuid, 'trends-' || s || '@example.test'
  from unnest(array['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']) s;

-- From here the fixtures are written as they would be over two weeks, without
-- the triggers that would stamp them with today.
set local session_replication_role = replica;

update public.profiles p set
  full_name = 'Trends person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-0000000000dd',
  role = case when right(p.id::text, 2) = 'a0' then 'dm' else 'ds' end::user_role,
  is_approved = true,
  approved_at = pg_temp.week(2)
 where p.id::text like '00000000-0000-0000-0000-0000000000a_';

insert into public.pairings (id, dm_id, ds_id, track, journey_stage, created_at)
select ('00000000-0000-0000-0000-0000000000b' || n)::uuid,
       '00000000-0000-0000-0000-0000000000a0',
       ('00000000-0000-0000-0000-0000000000a' || n)::uuid,
       'digital', 'connect', pg_temp.week(2)
  from generate_series(1, 6) n;

insert into public.messages (pairing_id, sender_id, body, created_at)
select '00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid,
       'Invented message ' || n, pg_temp.week(2) + make_interval(mins => n)
  from generate_series(1, 6) n
union all
select '00000000-0000-0000-0000-0000000000b2'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid,
       'Invented message ' || n, pg_temp.week(2) + make_interval(mins => n)
  from generate_series(1, 3) n
union all
select '00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000a0'::uuid,
       'Invented reply ' || n, pg_temp.week(1) + make_interval(mins => n)
  from generate_series(1, 3) n;

insert into public.reports (church_id, reporter_id, subject_id, reason, detail, created_at)
values ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a0', 'other', 'Invented for the test.', pg_temp.week(1));

insert into public.prayer_requests (ds_id, author_id, church_id, body, created_at)
select ('00000000-0000-0000-0000-0000000000a' || n)::uuid, ('00000000-0000-0000-0000-0000000000a' || n)::uuid,
       '00000000-0000-0000-0000-0000000000dd',
       'Invented prayer ' || n, pg_temp.week(1)
  from generate_series(1, 5) n;

set local session_replication_role = origin;

-- A row of the view, as the trends role reads it.
create or replace function pg_temp.seen(p_ago integer, p_column text) returns text language sql as $$
  select pg_temp.as_role('beacon_trends',
    format('select coalesce(%I::text, ''hidden'') from trends.weekly where church = %L and week_starting = %L',
           p_column, 'Trends Chapel', pg_temp.week_starting(p_ago)))
$$;

-- COUNTS -------------------------------------------------------------------------
select pg_temp.check(pg_temp.as_role('beacon_trends',
         $q$select count(*)::text from trends.weekly where church = 'Trends Chapel'$q$) = '4',
  'the trends role reads one row for each of the church''s four weeks');
select pg_temp.check(pg_temp.seen(2, 'people_joined') = '7' and pg_temp.seen(2, 'pairs_started') = '6'
                     and pg_temp.seen(2, 'messages') = '9',
  'two weeks ago: 7 joined, 6 pairs started, 9 messages, each shown');
select pg_temp.check(pg_temp.seen(1, 'prayer_requests') = '5',
  'last week: 5 prayer requests, shown, because 5 is not fewer than 5');
select pg_temp.check(pg_temp.seen(0, 'messages') = '0' and pg_temp.seen(0, 'reports_raised') = '0'
                     and pg_temp.seen(3, 'people_joined') = '0',
  'a quiet week reads 0, not hidden and not missing');

-- UNDER 5 ------------------------------------------------------------------------
select pg_temp.check(pg_temp.seen(2, 'pairs_talking') = 'hidden',
  'two pairs talking is hidden');
select pg_temp.check(pg_temp.seen(1, 'messages') = 'hidden' and pg_temp.seen(1, 'pairs_talking') = 'hidden',
  'three messages in one pair is hidden, and so is the one pair');
select pg_temp.check(pg_temp.seen(1, 'reports_raised') = 'hidden',
  'one report is hidden');

-- ONE VIEW -----------------------------------------------------------------------
select pg_temp.check(pg_temp.as_role('beacon_trends', 'select count(*)::text from public.profiles') = 'ERR:42501'
                     and pg_temp.as_role('beacon_trends', 'select count(*)::text from public.messages') = 'ERR:42501'
                     and pg_temp.as_role('beacon_trends', 'select count(*)::text from public.reports') = 'ERR:42501'
                     and pg_temp.as_role('beacon_trends', 'select count(*)::text from public.churches') = 'ERR:42501',
  'the trends role reads no table: not profiles, messages, reports or churches');
select pg_temp.check(pg_temp.as_role('beacon_trends', 'select count(*)::text from auth.users') like 'ERR:%',
  'and no sign-in record');
select pg_temp.check(pg_temp.as_role('beacon_trends', 'select count(*)::text from private.churches_i_manage()') like 'ERR:%',
  'and no private function');
select pg_temp.check(
  (select count(*) from information_schema.role_table_grants where grantee = 'beacon_trends') = 1
  and exists (select 1 from information_schema.role_table_grants
               where grantee = 'beacon_trends' and table_schema = 'trends' and table_name = 'weekly'
                 and privilege_type = 'SELECT'),
  'the one thing granted to it is reading trends.weekly');
select pg_temp.check(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'trends' and table_name = 'weekly')
  = array['church_id', 'church', 'week_starting', 'people_joined', 'pairs_started', 'pairs_talking', 'messages',
          'lessons_finished', 'lessons_read', 'prayer_requests', 'meetings', 'reports_raised', 'reports_closed'],
  'the view has a church, a week and numbers, and no column that names a person');
select pg_temp.check(
  (select coalesce('security_barrier=true' = any(c.reloptions), false) from pg_class c
    where c.oid = 'trends.weekly'::regclass),
  'the view is a security barrier, so nothing a reader adds runs before the counting');

-- NOBODY ELSE --------------------------------------------------------------------
select pg_temp.check(pg_temp.as_role('authenticated', 'select count(*)::text from trends.weekly',
         jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000a0', 'role', 'authenticated')) = 'ERR:42501',
  'a signed-in member cannot read the trends');
select pg_temp.check(pg_temp.as_role('anon', 'select count(*)::text from trends.weekly') = 'ERR:42501',
  'nor can the signed-out visitor');

-- NO DOOR ------------------------------------------------------------------------
select pg_temp.check(
  (select not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb
     from pg_roles where rolname = 'beacon_trends'),
  'the role cannot sign in, and holds no power over other roles, databases or row rules');
-- Since Postgres 16 the role that creates another is made its administrator
-- (on Supabase, `postgres`), without the right to become it or inherit from it.
-- What matters is exactly that: nobody can become it, and it inherits nothing.
select pg_temp.check(
  not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = 'beacon_trends')
  and not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
                   where r.rolname = 'beacon_trends' and (m.set_option or m.inherit_option))
  and not pg_has_role('authenticator', 'beacon_trends', 'member'),
  'it inherits from no role, and no role can become it, the data API''s sign-in least of all');

-- THE VERDICT ------------------------------------------------------------------
\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 16 then raise exception 'only % checks ran; expected at least 16', total; end if;
  if failed > 0 then raise exception '% of % trends checks failed', failed, total; end if;
  raise notice 'trends are counts only: % checks hold', total;
end $$;

rollback;
