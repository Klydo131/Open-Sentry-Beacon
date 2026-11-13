-- The security record cannot be quietly rewritten, and the tripwire works.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261109120000_the_security_record_cannot_be_rewritten):
--
--   * every new line joins its church's chain: numbered in order, each
--     holding the hash of the one before, and the check says it is whole;
--   * a line cannot be edited, and cannot be deleted directly;
--   * a line changed behind the triggers' backs is found, at its own place;
--   * deleting an account still works and leaves the chain whole;
--   * removing a whole church still removes its record;
--   * only that church's leaders may check or seal it;
--   * the tripwire returns nothing, records a signed-in caller in their
--     church's record as urgent, and records a visitor where only the
--     database's operator can read it.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant all on results to public;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   a1  the chapel's Director     b1  an Explorer in it     d1  another Explorer, to be deleted
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009a1', 'record-director@example.test'),
  ('00000000-0000-0000-0000-0000000009b1', 'record-explorer@example.test'),
  ('00000000-0000-0000-0000-0000000009d1', 'record-leaver@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000009c01', 'Record Chapel'),
  ('00000000-0000-0000-0000-000000009c02', 'Other Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-000000009c01'::uuid,
  role = (case when right(p.id::text, 2) = 'a1' then 'admin' else 'ds' end)::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000009__';

create or replace function pg_temp.as_user(p_user text, p_role text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)
         else jsonb_build_object('sub', p_user, 'role', p_role) end::text, true);
  execute format('set local role %I', p_role);
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

create or replace function pg_temp.line(p_church uuid, p_summary text, p_subject uuid) returns void language sql as $$
  insert into public.security_audit_events
    (church_id, subject_id, subject_name, subject_role, actor_name, actor_role, event_type, severity, summary)
  values (p_church, p_subject, 'Person', 'ds', 'Person a1', 'admin', 'profile_change', 'info', p_summary);
$$;

-- THE CHAIN -------------------------------------------------------------------
-- Setting up the people above already wrote lines of its own (their roles and
-- churches changed), so everything is counted from where the chain stands.
create temp table base on commit drop as
  select coalesce(max(chain_seq), 0) as n from public.security_audit_events
   where church_id = '00000000-0000-0000-0000-000000009c01';
grant all on base to public;
select pg_temp.line('00000000-0000-0000-0000-000000009c01', 'First thing that happened', '00000000-0000-0000-0000-0000000009d1');
select pg_temp.line('00000000-0000-0000-0000-000000009c01', 'Second thing', null);
select pg_temp.line('00000000-0000-0000-0000-000000009c01', 'Third thing', null);
select pg_temp.line('00000000-0000-0000-0000-000000009c02', 'Another church''s first line', null);

select pg_temp.check(
  (select array_agg(chain_seq order by chain_seq) = (select array[n+1, n+2, n+3]::bigint[] from base)
     from public.security_audit_events
    where church_id = '00000000-0000-0000-0000-000000009c01' and chain_seq > (select n from base)),
  'each new line takes the next number in its church''s chain');
select pg_temp.check(
  (select chain_seq = 1 and prev_hash is null from public.security_audit_events
    where church_id = '00000000-0000-0000-0000-000000009c02'),
  'and another church starts its own chain at 1');
select pg_temp.check(
  (select bool_and(e.prev_hash = p.row_hash)
     from public.security_audit_events e
     join public.security_audit_events p on p.church_id = e.church_id and p.chain_seq = e.chain_seq - 1
    where e.church_id = '00000000-0000-0000-0000-000000009c01'),
  'every line holds the hash of the line before it');
select pg_temp.check(
  (select lines = (select n + 3 from base) and intact and first_break is null
     from public.security_record_check('00000000-0000-0000-0000-000000009c01')),
  'the check walks every line, the new three included, and finds the record whole');

-- NOT EDITED, NOT DELETED -----------------------------------------------------
do $$ begin
  begin
    update public.security_audit_events set summary = 'Nothing happened'
     where church_id = '00000000-0000-0000-0000-000000009c01' and summary = 'Second thing';
    insert into results values (false, 'a line''s words cannot be edited, even by the database''s owner (it was)');
  exception when insufficient_privilege then
    insert into results values (true, 'a line''s words cannot be edited, even by the database''s owner');
  end;
  begin
    delete from public.security_audit_events
     where church_id = '00000000-0000-0000-0000-000000009c01' and summary = 'Second thing';
    insert into results values (false, 'a line cannot be deleted directly (it was)');
  exception when insufficient_privilege then
    insert into results values (true, 'a line cannot be deleted directly, even by the database''s owner');
  end;
end $$;

-- A CHANGE BEHIND THE TRIGGERS' BACKS IS FOUND --------------------------------
-- Each change is made, checked and undone inside one block; the result is kept
-- in a variable, which an undone block does not take back with it.
do $$
declare
  base_n bigint := (select n from base);
  found_edit boolean;
  found_gap boolean;
begin
  begin
    alter table public.security_audit_events disable trigger security_line_is_not_edited;
    update public.security_audit_events set summary = 'Rewritten afterwards'
     where church_id = '00000000-0000-0000-0000-000000009c01' and summary = 'Second thing';
    select not intact and first_break = base_n + 2 into found_edit
      from public.security_record_check('00000000-0000-0000-0000-000000009c01');
    raise exception using errcode = 'P0001', message = 'undo the edit';
  exception when raise_exception then null;
  end;
  begin
    alter table public.security_audit_events disable trigger security_line_is_not_deleted;
    delete from public.security_audit_events
     where church_id = '00000000-0000-0000-0000-000000009c01' and summary = 'Second thing';
    select not intact and first_break = base_n + 3 into found_gap
      from public.security_record_check('00000000-0000-0000-0000-000000009c01');
    raise exception using errcode = 'P0001', message = 'undo the removal';
  exception when raise_exception then null;
  end;
  insert into results values (coalesce(found_edit, false),
    'a line rewritten with the guards switched off is found, at its own place');
  insert into results values (coalesce(found_gap, false),
    'a line removed with the guards switched off is found too, where the gap is');
end $$;
select pg_temp.check(
  (select intact from public.security_record_check('00000000-0000-0000-0000-000000009c01'))
  and exists (select 1 from public.security_audit_events where summary = 'Second thing'),
  'and both were undone: the record is whole again, its guards back on');
select pg_temp.check(
  (select bool_and(tgenabled = 'O') from pg_trigger
    where tgrelid = 'public.security_audit_events'::regclass and tgname like 'security_line_%'),
  'every guard on the record is switched on');

-- THE RECORD STILL OUTLIVES THE PERSON ----------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-0000000009d1';
select pg_temp.check(
  (select subject_id is null and subject_name = 'Person'
     from public.security_audit_events
    where church_id = '00000000-0000-0000-0000-000000009c01' and summary = 'First thing that happened'),
  'deleting an account still works, and its line keeps the name it recorded');
select pg_temp.check(
  (select intact from public.security_record_check('00000000-0000-0000-0000-000000009c01')),
  'and the chain is still whole after it');

-- WHO MAY CHECK AND SEAL ------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', 'authenticated',
  $q$ select * from public.security_record_check('00000000-0000-0000-0000-000000009c01') $q$,
  'ok', 'the church''s Director may check its record');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', 'authenticated',
  $q$ select * from public.security_record_seal('00000000-0000-0000-0000-000000009c01') $q$,
  'ok', 'and seal it');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009b1', 'authenticated',
  $q$ select * from public.security_record_check('00000000-0000-0000-0000-000000009c01') $q$,
  'leaders may check', 'an Explorer may not check the record');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', 'authenticated',
  $q$ select * from public.security_record_check('00000000-0000-0000-0000-000000009c02') $q$,
  'leaders may check', 'and a Director may not check another church''s');
select pg_temp.as_user(null, 'anon',
  $q$ select * from public.security_record_check('00000000-0000-0000-0000-000000009c01') $q$,
  '42501', 'and a visitor may not check it at all');
select pg_temp.check(
  (select seal ~ '^[0-9a-f]{64}$' and lines = (select max(chain_seq) from public.security_audit_events where church_id = '00000000-0000-0000-0000-000000009c01')
     from public.security_record_seal('00000000-0000-0000-0000-000000009c01')),
  'the seal is the latest line''s number and SHA-256 hash');

-- THE TRIPWIRE ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000009b1', 'authenticated',
  $q$ do $d$ begin
        if (select count(*) from public.export_all_members()) <> 0 then raise exception 'it gave rows'; end if;
      end $d$ $q$,
  'ok', 'the tripwire answers a signed-in caller with nothing');
select pg_temp.check(
  (select count(*) = 1 from public.security_audit_events
    where church_id = '00000000-0000-0000-0000-000000009c01'
      and event_type = 'tripwire_touched' and severity = 'urgent'
      and subject_id = '00000000-0000-0000-0000-0000000009b1'),
  'and records them in their church''s security record, as urgent');
select pg_temp.check(
  (select intact and lines = (select max(chain_seq) from public.security_audit_events where church_id = '00000000-0000-0000-0000-000000009c01')
     from public.security_record_check('00000000-0000-0000-0000-000000009c01')),
  'and that line joins the chain like any other');
select pg_temp.as_user(null, 'anon',
  $q$ do $d$ begin
        if (select count(*) from public.export_all_members()) <> 0 then raise exception 'it gave rows'; end if;
      end $d$ $q$,
  'ok', 'a visitor with the public key gets nothing from it either');
select pg_temp.check(
  (select count(*) filter (where signed_in) = 1 and count(*) filter (where not signed_in) = 1
     from private.tripwire_hits where touched = 'export_all_members'),
  'and both touches are kept in the operator''s own list, signed in and not');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009b1', 'authenticated',
  $q$ do $d$ begin perform * from public.export_all_members(); end $d$ $q$,
  'ok', 'the same account touching it again is still answered');
select pg_temp.check(
  (select count(*) = 1 from public.security_audit_events
    where event_type = 'tripwire_touched' and subject_id = '00000000-0000-0000-0000-0000000009b1'),
  'but its church''s record gets one line an hour, not one a call');
select pg_temp.as_user(null, 'anon',
  $q$ do $d$ begin for i in 1..100 loop perform * from public.export_all_members(); end loop; end $d$ $q$,
  'ok', 'a visitor calling it a hundred times in a row is answered each time');
select pg_temp.check(
  (select count(*) = 60 from private.tripwire_hits where touched = 'export_all_members'),
  'and the operator''s list stops at sixty an hour, so it cannot be used to fill the database');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', 'authenticated',
  $q$ select * from private.tripwire_hits $q$,
  '42501', 'which no signed-in person can read, a Director included');
select pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', 'authenticated',
  $q$ insert into public.security_audit_events (church_id, subject_name, subject_role, actor_name, event_type, severity, summary)
      values ('00000000-0000-0000-0000-000000009c01', 'X', 'ds', 'X', 'profile_change', 'info', 'forged') $q$,
  '42501', 'and nobody signed in can write a line of the record themselves');

-- A WHOLE CHURCH STILL GOES -----------------------------------------------------
delete from public.churches where id = '00000000-0000-0000-0000-000000009c02';
select pg_temp.check(
  (select count(*) = 0 from public.security_audit_events where church_id = '00000000-0000-0000-0000-000000009c02'),
  'removing a whole church still removes its record with it');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 20 then raise exception 'only % checks ran; expected at least 20', total; end if;
  if failed > 0 then raise exception '% of % security record checks failed', failed, total; end if;
  raise notice 'the security record cannot be rewritten: % checks hold', total;
end $$;

rollback;
