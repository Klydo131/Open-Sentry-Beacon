-- A conversation's history opens only for a report, and every opening is on
-- the record.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261013130000_a_message_history_opens_only_for_a_report):
--
--   * a Director cannot open the earlier versions of a conversation's messages
--     until somebody has reported that conversation;
--   * the Guide and the Explorer in it, and a Director of another church,
--     cannot open it at all, report or not;
--   * once it is reported, the church's Director and Executive Director can,
--     and each opening writes one entry to the church's security record;
--   * nobody in leadership reads the conversation's current messages, and no
--     browser reads the kept versions directly.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   x  Executive Director     d  Director        g  Guide, walking with e
--   e  Explorer               o  a Director in another church
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'history-exec@example.test'),
  ('00000000-0000-0000-0000-0000000001b1', 'history-director@example.test'),
  ('00000000-0000-0000-0000-0000000001c1', 'history-guide@example.test'),
  ('00000000-0000-0000-0000-0000000001e1', 'history-explorer@example.test'),
  ('00000000-0000-0000-0000-0000000001d1', 'history-other-director@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000001c01', 'History Chapel'),
  ('00000000-0000-0000-0000-000000001c02', 'Other History Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) = 'd1' then '00000000-0000-0000-0000-000000001c02'::uuid
                   else '00000000-0000-0000-0000-000000001c01'::uuid end,
  role = case left(right(p.id::text, 2), 1)
           when 'a' then 'executive'::user_role when 'b' then 'admin'::user_role
           when 'c' then 'dm'::user_role when 'e' then 'ds'::user_role
           else 'admin'::user_role end,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000001__';
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-000000001901', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001e1', 'digital', 'connect');
insert into public.messages (id, pairing_id, sender_id, body) values
  ('00000000-0000-0000-0000-000000001911', '00000000-0000-0000-0000-000000001901', '00000000-0000-0000-0000-0000000001c1', 'A message that was later changed.');
insert into public.message_revisions (message_id, pairing_id, author_id, body, reason) values
  ('00000000-0000-0000-0000-000000001911', '00000000-0000-0000-0000-000000001901', '00000000-0000-0000-0000-0000000001c1', 'What it said first.', 'edited');

-- Run something as a person; record whether it was refused as expected.
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
  perform set_config('request.jwt.claims', '', true);
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

-- How many kept versions somebody receives, or -1 if they are refused.
create or replace function pg_temp.history_seen_by(p_who text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.message_history_for_leader('00000000-0000-0000-0000-000000001901');
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

-- How many rows of a table somebody can read straight from it, or -1 if refused.
create or replace function pg_temp.rows_seen_by(p_who text, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into n;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

create or replace function pg_temp.openings() returns int language sql as $$
  select count(*)::int from public.security_audit_events
   where church_id = '00000000-0000-0000-0000-000000001c01' and event_type = 'message_history_read';
$$;

\set X '00000000-0000-0000-0000-0000000001a1'
\set D '00000000-0000-0000-0000-0000000001b1'
\set G '00000000-0000-0000-0000-0000000001c1'
\set E '00000000-0000-0000-0000-0000000001e1'
\set O '00000000-0000-0000-0000-0000000001d1'

-- BEFORE ANYBODY REPORTS --------------------------------------------------------
select pg_temp.as_person(:'D', $q$select * from public.message_history_for_leader('00000000-0000-0000-0000-000000001901')$q$,
  'only for a conversation somebody has reported', 'a Director cannot open a history nobody has reported');
select pg_temp.as_person(:'X', $q$select * from public.message_history_for_leader('00000000-0000-0000-0000-000000001901')$q$,
  'only for a conversation somebody has reported', 'nor can an Executive Director');
select pg_temp.as_person(:'D', $q$select * from private.message_history_for_leader('00000000-0000-0000-0000-000000001901')$q$,
  'only for a conversation somebody has reported', 'and the inner function, reached directly, refuses the same way');
select pg_temp.check(pg_temp.openings() = 0, 'a refused opening writes nothing to the record');

-- THE REPORT --------------------------------------------------------------------
select pg_temp.as_person(:'E', $q$select public.report_person('00000000-0000-0000-0000-0000000001c1', 'inappropriate', 'Invented detail.', '00000000-0000-0000-0000-000000001901')$q$,
  'ok', 'the Explorer reports their Guide, naming the conversation');

-- AFTER THE REPORT --------------------------------------------------------------
select pg_temp.check(pg_temp.history_seen_by(:'G') = -1, 'the Guide still cannot open the history');
select pg_temp.check(pg_temp.history_seen_by(:'E') = -1, 'nor the Explorer who reported');
select pg_temp.check(pg_temp.history_seen_by(:'O') = -1, 'nor a Director of another church');
select pg_temp.check(pg_temp.openings() = 0, 'and none of those refusals is recorded as an opening');
select pg_temp.check(pg_temp.history_seen_by(:'D') = 1, 'the church''s Director now sees the kept version');
select pg_temp.check(pg_temp.openings() = 1, 'and that opening is written to the security record');
select pg_temp.check((select actor_id = :'D'::uuid and subject_id = :'G'::uuid and severity = 'review'
                        from public.security_audit_events
                       where church_id = '00000000-0000-0000-0000-000000001c01' and event_type = 'message_history_read'),
  'naming who opened it and whom the report is about');
select pg_temp.check(pg_temp.history_seen_by(:'X') = 1, 'the Executive Director can open it too');
select pg_temp.check(pg_temp.openings() = 2, 'and each opening is recorded separately');

-- WHAT STAYS CLOSED ----------------------------------------------------------------
select pg_temp.check(pg_temp.rows_seen_by(:'D', $q$select count(*) from public.messages where pairing_id = '00000000-0000-0000-0000-000000001901'$q$) = 0,
  'a report does not let the Director read the conversation itself');
select pg_temp.check(pg_temp.rows_seen_by(:'D', $q$select count(*) from public.message_revisions$q$) in (0, -1),
  'no browser reads the kept versions straight from their table');
select pg_temp.check(pg_temp.rows_seen_by(:'D', $q$select count(*) from public.security_audit_events$q$) in (0, -1),
  'nor writes or reads the security record directly');

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
  if failed > 0 then raise exception '% of % message-history checks failed', failed, total; end if;
  raise notice 'a message history opens only for a report: % checks hold', total;
end $$;

rollback;
