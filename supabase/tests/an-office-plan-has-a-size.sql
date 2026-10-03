-- An office plan has a size, and only an approved member keeps one.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as four invented people
-- (20261003120000_an_office_plan_has_a_size):
--
--   * an approved member keeps plans; somebody still waiting cannot, and a
--     member who stops being approved cannot change one either;
--   * nobody reads another person's plans;
--   * one plan holds at most 200 KB, whether added that size or grown to it;
--   * a deletion mark carries no body;
--   * one account keeps 200 live plans and 1,000 rows in all;
--   * one account's plans together stop at 10 MB, however they are sent.
--
-- EVERYTHING IS ROLLED BACK, so the fingerprint printed afterwards is the
-- database as a church gets it. Any FAIL raises at the end, which stops the
-- install script and CI.
--
-- Written on 3 October 2026 against Postgres 16 with a stand-in for the
-- Supabase platform; CI runs it on the supabase/postgres image.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon;

-- FIXTURES ------------------------------------------------------------------- All fictional.
-- a, b and c are approved; w is still waiting.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'planner-one@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'planner-two@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'planner-three@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'waiting@example.test');
insert into public.churches (id, name) values ('00000000-0000-0000-0000-0000000000f9', 'Test Chapel');
update public.profiles set is_approved = (right(id::text, 2) <> 'e1'), full_name = 'Planner ' || right(id::text, 2),
       church_id = '00000000-0000-0000-0000-0000000000f9'
 where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
              '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1');

-- Runs one statement as somebody and reports the result.
create or replace function pg_temp.as_person(p_who text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

-- A body of about `kb` kilobytes of text that does not compress.
create or replace function pg_temp.body_of(kb integer) returns jsonb language sql as $$
  select jsonb_build_object('notes', (select string_agg(md5(i::text || random()::text), '') from generate_series(1, kb * 32) i))
$$;
grant execute on function pg_temp.body_of(integer) to authenticated;

-- WHO MAY KEEP PLANS -------------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('p1', 'sabbath_program', '{"title": "Sabbath"}', 1)$q$,
  'ok', 'an approved member keeps a program in the account');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000e1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('w1', 'sabbath_program', '{}', 1)$q$,
  'approved member', 'somebody still waiting for approval cannot keep plans');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000b1',
  $q$do $d$ begin if (select count(*) from public.office_plans) <> 0 then raise exception 'saw somebody else''s plans'; end if; end $d$$q$,
  'ok', 'nobody reads another person''s plans');

-- ONE PLAN'S SIZE ----------------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('big', 'evangelistic_meeting', pg_temp.body_of(190), 1)$q$,
  'ok', 'a plan of 190 KB is kept');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('huge', 'evangelistic_meeting', pg_temp.body_of(210), 1)$q$,
  'office_plans_body_fits', 'a plan over 200 KB is refused');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$update public.office_plans set body = pg_temp.body_of(210), updated = 2 where id = 'p1'$q$,
  'office_plans_body_fits', 'and a small plan cannot grow past 200 KB');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated, deleted) values ('gone', 'sabbath_program', '{"kept": "words"}', 1, true)$q$,
  'office_plans_deleted_is_empty', 'a deletion mark carries no body');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated, deleted) values ('gone', 'sabbath_program', '{}', 1, true)$q$,
  'ok', 'an empty deletion mark is kept');

-- HOW MANY -----------------------------------------------------------------------
-- a has 2 live plans (p1, big) and one mark. 198 more makes 200.
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated) select 'n' || i, 'sabbath_program', '{}', 1 from generate_series(1, 198) i$q$,
  'ok', 'an account keeps 200 live plans');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('n199', 'sabbath_program', '{}', 1)$q$,
  '200 programs', 'and not a 201st');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$update public.office_plans set body = '{"title": "Changed"}', updated = 3 where id = 'p1'$q$,
  'ok', 'at 200, a plan already kept can still be changed');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated, deleted) select 'm' || i, 'sabbath_program', '{}', 1, true from generate_series(1, 799) i$q$,
  'ok', 'deletion marks do not count as live plans, up to 1,000 rows in all');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.office_plans (id, kind, body, updated, deleted) values ('m800', 'sabbath_program', '{}', 1, true)$q$,
  '1000', 'and the 1,001st row is refused');
select pg_temp.check((select count(*) = 1000 from public.office_plans where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'the account holds exactly 1,000 rows');

-- THE ACCOUNT'S BUDGET -------------------------------------------------------------
-- c adds 180 KB plans one at a time until something says no. It must be the
-- 10 MB budget, long before the 200-plan limit.
select pg_temp.as_person('00000000-0000-0000-0000-0000000000c1', $q$
  do $d$
  declare n int := 0;
  begin
    loop
      begin
        insert into public.office_plans (id, kind, body, updated) values ('c' || n, 'evangelistic_meeting', pg_temp.body_of(180), 1);
        n := n + 1;
      exception when others then
        insert into results values (n between 40 and 199 and sqlerrm ilike '%10 MB%',
          format('one account is stopped at 10 MB, after %s plans of 180 KB (%s)', n, sqlerrm));
        exit;
      end;
      if n >= 199 then
        insert into results values (false, 'nothing stopped 199 plans of 180 KB');
        exit;
      end if;
    end loop;
  end $d$$q$, 'ok', 'filling an account one plan at a time runs into its budget');
select pg_temp.check((select sum(pg_column_size(body)) <= 10000000 from public.office_plans where owner_id = '00000000-0000-0000-0000-0000000000c1'),
  'and what it keeps stays within 10 MB');
-- Adding small and then growing is the same budget: a tiny plan still fits,
-- and growing it to 180 KB does not.
select pg_temp.as_person('00000000-0000-0000-0000-0000000000c1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('tiny', 'sabbath_program', '{}', 1)$q$,
  'ok', 'at the budget, a tiny plan still fits');
select pg_temp.as_person('00000000-0000-0000-0000-0000000000c1',
  $q$update public.office_plans set body = pg_temp.body_of(180), updated = 2 where id = 'tiny'$q$,
  '10 MB', 'but growing it to 180 KB is refused');

-- STOPPING BEING APPROVED -----------------------------------------------------------
-- A leader's change, made here as the superuser with nobody signed in.
create or replace function pg_temp.as_nobody() returns void language sql as $$
  select set_config('request.jwt.claims', '', true) $$;
select pg_temp.as_nobody();
update public.profiles set is_approved = false where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.as_person('00000000-0000-0000-0000-0000000000b1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('b1', 'sabbath_program', '{}', 1)$q$,
  'approved member', 'a member no longer approved cannot add a plan');
select pg_temp.as_nobody();
update public.profiles set is_approved = true where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.as_person('00000000-0000-0000-0000-0000000000b1',
  $q$insert into public.office_plans (id, kind, body, updated) values ('b1', 'sabbath_program', '{}', 1)$q$,
  'ok', 'approved again, they can');
select pg_temp.as_nobody();
update public.profiles set is_approved = false where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.as_person('00000000-0000-0000-0000-0000000000b1',
  $q$update public.office_plans set body = '{"title": "x"}', updated = 2 where id = 'b1'$q$,
  'approved member', 'and once not approved, cannot change the plan they kept');

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
  if total < 22 then raise exception 'only % checks ran; expected at least 22', total; end if;
  if failed > 0 then raise exception '% of % office plan checks failed', failed, total; end if;
  raise notice 'an office plan has a size: % checks hold', total;
end $$;

rollback;
