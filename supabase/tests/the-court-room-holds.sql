-- The court room holds: its door, its room, its record and its exhibits.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261020160000_the_court_room):
--
--   THE DOOR    a leader needs a code typed in the last 30 minutes on a
--               two-step token; anybody else a password or code in the last
--               30 minutes; a stale pass is refused everywhere, the files too.
--   THE ROOM    leadership sees a case exists, and reads it only from a
--               recorded gallery seat; a gallery seat has no voice; another
--               church sees nothing; a closed gallery takes nobody new.
--   THE RECORD  a statement's time and fingerprint are the server's; every act
--               is chained; a changed entry or statement is found; the verdict
--               seals it.
--   EXHIBITS    lettered in order; a file goes up only to the place its own
--               exhibit waits for; bench-only stays with the bench, files too;
--               nothing is changed or removed afterwards.
--   OPENING     a case is placed in the church of the person it is about; the
--               other side and a linked report must be that church's.
--   OUTLIVING   statements and the case survive the accounts that made them.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon, service_role;
create temp table kept (k text primary key, v text) on commit drop;
grant all on kept to authenticated, anon, service_role;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   c01  Court Chapel          c02  Other Chapel
--   d1   Director of c01, authenticator app      (judge)
--   d2   Director of c01, no authenticator app
--   d3   Director of c01, authenticator app      (watches)
--   d4   Director of c01, authenticator app      (too late to watch)
--   e1   Executive Director, own church c02, oversees c01, authenticator app
--   a1   Explorer of c01                         (the case is about them)
--   b1   Guide of c01                            (raised it)
--   b2   Guide of c01                            (witness)
--   b3   Guide of c01                            (another case)
--   f1   Guide of c02
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000cc01', 'Court Chapel'),
  ('00000000-0000-0000-0000-00000000cc02', 'Other Chapel');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0d1', 'court-d1@example.test'),
  ('00000000-0000-0000-0000-00000000c0d2', 'court-d2@example.test'),
  ('00000000-0000-0000-0000-00000000c0d3', 'court-d3@example.test'),
  ('00000000-0000-0000-0000-00000000c0d4', 'court-d4@example.test'),
  ('00000000-0000-0000-0000-00000000c0e1', 'court-e1@example.test'),
  ('00000000-0000-0000-0000-00000000c0a1', 'court-a1@example.test'),
  ('00000000-0000-0000-0000-00000000c0b1', 'court-b1@example.test'),
  ('00000000-0000-0000-0000-00000000c0b2', 'court-b2@example.test'),
  ('00000000-0000-0000-0000-00000000c0b3', 'court-b3@example.test'),
  ('00000000-0000-0000-0000-00000000c0f1', 'court-f1@example.test');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) in ('e1', 'f1')
                   then '00000000-0000-0000-0000-00000000cc02'::uuid
                   else '00000000-0000-0000-0000-00000000cc01'::uuid end,
  role = case left(right(p.id::text, 2), 1)
           when 'd' then 'admin' when 'e' then 'executive' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-00000000c0__';
insert into public.church_executives (church_id, executive_id) values
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000c0e1');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
select gen_random_uuid(), u, 'totp', 'verified', now(), now()
  from unnest(array['00000000-0000-0000-0000-00000000c0d1', '00000000-0000-0000-0000-00000000c0d3',
                    '00000000-0000-0000-0000-00000000c0d4', '00000000-0000-0000-0000-00000000c0e1']::uuid[]) u;
insert into public.reports (id, church_id, reporter_id, subject_id, reason, detail) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000cc01',
   '00000000-0000-0000-0000-00000000c0b1', '00000000-0000-0000-0000-00000000c0a1', 'inappropriate', 'Invented.'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000cc01',
   '00000000-0000-0000-0000-00000000c0b1', '00000000-0000-0000-0000-00000000c0b3', 'other', 'Invented, about somebody else.');

-- Who, and how freshly they proved it.
create or replace function pg_temp.who(p_short text, p_minutes_ago integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000c0' || p_short,
    'role', 'authenticated',
    'aal', case when left(p_short, 1) in ('d', 'e') and p_short <> 'd2' then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', case when left(p_short, 1) in ('d', 'e') and p_short <> 'd2' then 'totp' else 'password' end,
      'timestamp', floor(extract(epoch from now()) - p_minutes_ago * 60)::bigint)));
$$;

-- Run something as a person; record whether it was refused as expected (by
-- SQLSTATE or by words in the message), and keep its answer.
create or replace function pg_temp.as_claims(p_claims jsonb, p_sql text, p_expect text, p_label text, p_keep text default null)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := ''; v_out text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  set local role authenticated;
  begin
    execute p_sql into v_out;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if p_keep is not null and v_state = 'ok' then
    insert into kept values (p_keep, v_out) on conflict (k) do update set v = excluded.v;
  end if;
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

-- The text a query gives, as a person.
create or replace function pg_temp.answer(p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

create or replace function pg_temp.k(p_key text) returns text language sql as $$
  select v from kept where k = p_key
$$;

-- THE DOOR ---------------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'), $q$select public.court_door() ->> 'open'$q$) = 'true',
  'a Director who typed their code a minute ago is let in');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1', 45), $q$select public.court_door() ->> 'needs'$q$) = 'code',
  'forty-five minutes after the code, the door asks for it again');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'), $q$select public.court_door() ->> 'needs'$q$) = 'two_step',
  'a Director without an authenticator app is asked to set one up, however fresh their password');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() ->> 'open'$q$) = 'true',
  'an Explorer who signed in a minute ago is let in');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1', 120), $q$select public.court_door() ->> 'needs'$q$) = 'password',
  'two hours later the Explorer is asked for their password');
select pg_temp.check(pg_temp.answer(
    jsonb_set(pg_temp.who('d1'), '{aal}', '"aal1"'), $q$select public.court_door() ->> 'open'$q$) = 'false',
  'a leader''s token that has not finished two-step sign-in does not open the door');
select pg_temp.check(pg_temp.answer(
    jsonb_set(pg_temp.who('d1'), '{amr,0,method}', '"password"'), $q$select public.court_door() ->> 'open'$q$) = 'false',
  'nor does a leader''s fresh password without a fresh code');
select pg_temp.as_claims(pg_temp.who('d1', 45), $q$select count(*) from public.court_cases()$q$,
  'court room is locked', 'the list of cases is locked behind a stale pass');

-- OPENING A CASE ---------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('d1'),
  $q$select public.open_trial('00000000-0000-0000-0000-00000000c0a1', 'Invented case', null, '00000000-0000-0000-0000-00000000c0f1')$q$,
  'same church', 'the other side must be of the same church');
select pg_temp.as_claims(pg_temp.who('d1'),
  $q$select public.open_trial('00000000-0000-0000-0000-00000000c0a1', 'Invented case', '00000000-0000-0000-0000-00000000c102')$q$,
  'not an open report about this person', 'a report about somebody else cannot be linked');
select pg_temp.as_claims(pg_temp.who('d1', 45),
  $q$select public.open_trial('00000000-0000-0000-0000-00000000c0a1', 'Invented case')$q$,
  'court room is locked', 'a stale pass cannot open a case');
select pg_temp.as_claims(pg_temp.who('d1'),
  $q$select public.open_trial('00000000-0000-0000-0000-00000000c0a1', 'Invented case about a1', '00000000-0000-0000-0000-00000000c101')$q$,
  'ok', 'a Director opens a case from the report about that person', 'T');
-- The judge is drawn at random (20261020200000; proven in
-- a-judge-is-drawn-and-the-board-rules.sql). Here the room's own rules are
-- under test, so the Director who opened it is seated, as before the draw.
update public.trials set head_judge_id = '00000000-0000-0000-0000-00000000c0d1', judge_name = 'Person d1'
 where id = pg_temp.k('T')::uuid;
select pg_temp.check((select church_id from public.trials where id = pg_temp.k('T')::uuid) = '00000000-0000-0000-0000-00000000cc01',
  'the case is in the church of the person it is about');
select pg_temp.check((select count(*) from public.trial_parties where trial_id = pg_temp.k('T')::uuid) = 2,
  'the person it is about and the person who raised it are called');
select pg_temp.as_claims(pg_temp.who('e1'),
  $q$select public.open_trial('00000000-0000-0000-0000-00000000c0b3', 'Invented case about b3')$q$,
  'ok', 'an Executive Director opens a case in a church they oversee but do not belong to', 'T2');
select pg_temp.check((select church_id from public.trials where id = pg_temp.k('T2')::uuid) = '00000000-0000-0000-0000-00000000cc01',
  'and it lands in that church, not in the Executive Director''s own');

-- WHO SEES WHAT ------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.court_say(%L, 'Invented answer from a1')$q$, pg_temp.k('T')),
  'ok', 'the person the case is about answers it');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select may_watch::text from public.court_cases() where id = %L$q$, pg_temp.k('T'))) = 'true',
  'another Director sees the hearing and may watch it');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select count(*)::text from public.trial_statements where trial_id = %L$q$, pg_temp.k('T'))) = '0',
  'but reads nothing said in it before taking a seat');
select pg_temp.as_claims(pg_temp.who('d3'), format($q$select public.court_case(%L)::text$q$, pg_temp.k('T')),
  'not one you are in', 'nor opens the case');
select pg_temp.as_claims(pg_temp.who('d3'), format($q$select public.join_trial(%L)::text$q$, pg_temp.k('T')),
  'ok', 'taking a gallery seat');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select count(*)::text from public.trial_statements where trial_id = %L$q$, pg_temp.k('T'))) = '1',
  'from the gallery, what was said can be read');
select pg_temp.check((select count(*) from public.court_record
                       where trial_id = pg_temp.k('T')::uuid and act = 'gallery_seat') = 1,
  'and the seat is on the record');
select pg_temp.as_claims(pg_temp.who('d3'), format($q$select public.court_say(%L, 'Invented')$q$, pg_temp.k('T')),
  'Only the judge and the people called', 'a gallery seat has no voice');
select pg_temp.as_claims(pg_temp.who('d3'),
  format($q$insert into public.trial_statements (trial_id, author_id, body) values (%L, '00000000-0000-0000-0000-00000000c0d3', 'Invented') returning id::text$q$, pg_temp.k('T')),
  'row-level security', 'not even by writing to the table directly');
select pg_temp.as_claims(pg_temp.who('f1'), format($q$select public.court_case(%L)::text$q$, pg_temp.k('T')),
  'not one you are in', 'another church''s member cannot open the case');
select pg_temp.check(pg_temp.answer(pg_temp.who('f1'),
    format($q$select count(*)::text from public.trials where id = %L$q$, pg_temp.k('T'))) = '0',
  'nor see that it exists');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1', 120),
    format($q$select count(*)::text from public.trial_statements where trial_id = %L$q$, pg_temp.k('T'))) = '0',
  'the person the case is about, with a stale pass, reads nothing');
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$select (public.court_case(%L) -> 'people')::text$q$, pg_temp.k('T'))) not like '%observer%',
  'the person who raised it does not see who is watching');
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$select coalesce(public.court_case(%L) ->> 'record', 'none')$q$, pg_temp.k('T'))) = 'none',
  'and is not shown the bench''s record');
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$select count(*)::text from public.court_record where trial_id = %L$q$, pg_temp.k('T'))) = '0',
  'nor can read it from the table');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select (count(*) > 0)::text from public.court_record where trial_id = %L$q$, pg_temp.k('T'))) = 'true',
  'which the gallery can');
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$select (public.court_check_record(%L) ->> 'holds')$q$, pg_temp.k('T'))) = 'true',
  'but can ask whether the record holds, and it does');

-- A STATEMENT'S TIME IS THE SERVER'S --------------------------------------------
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into public.trial_statements (trial_id, author_id, body, created_at) values (%L, '00000000-0000-0000-0000-00000000c0a1', 'Backdated', '2020-01-01') returning id::text$q$, pg_temp.k('T')),
  'permission denied', 'a statement cannot be given an earlier time');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into public.trial_statements (trial_id, author_id, body, for_person) values (%L, '00000000-0000-0000-0000-00000000c0a1', 'Invented', '00000000-0000-0000-0000-00000000c0b1') returning id::text$q$, pg_temp.k('T')),
  'permission denied', 'nor be put in somebody else''s mouth');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into public.trial_statements (trial_id, author_id, body) values (%L, '00000000-0000-0000-0000-00000000c0a1', 'Directly') returning id::text$q$, pg_temp.k('T')),
  'ok', 'writing directly still works for somebody called to the case', 'S2');
select pg_temp.check((select created_at > now() - interval '1 minute' and body_sha256 = encode(extensions.digest('Directly', 'sha256'), 'hex')
                        from public.trial_statements where id = pg_temp.k('S2')::uuid),
  'and the server stamps its time and fingerprint');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$update public.trial_statements set body = 'Changed' where id = %L returning id::text$q$, pg_temp.k('S2')),
  'permission denied', 'nobody changes what they said');

-- EXHIBITS -----------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.court_exhibit_write(%L, 'Invented message', 'Invented words, copied out')$q$, pg_temp.k('T')),
  'ok', 'the person the case is about enters a written exhibit', 'EA');
select pg_temp.check(pg_temp.k('EA') = 'A', 'and it is Exhibit A');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.court_exhibit_begin(%L, 'Invented screenshot', 'shot.png', 'image/png', 1000, repeat('ab', 32), null, 'bench')::text$q$, pg_temp.k('T')),
  'ok', 'the person who raised it begins a file exhibit for the bench only', 'BEGUN');
insert into kept select 'PB', pg_temp.k('BEGUN')::jsonb ->> 'path';
insert into kept select 'IB', pg_temp.k('BEGUN')::jsonb ->> 'id';
select pg_temp.check(pg_temp.k('PB') = pg_temp.k('T') || '/' || pg_temp.k('IB'),
  'its file waits in a folder of the case, named by the exhibit');
select pg_temp.as_claims(pg_temp.who('f1'),
  format($q$insert into storage.objects (bucket_id, name, owner, metadata) values ('court-exhibits', %L, '00000000-0000-0000-0000-00000000c0f1', '{"size": 1000}') returning name$q$,
         pg_temp.k('T') || '/' || gen_random_uuid()::text),
  'row-level security', 'nobody uploads into the court''s files without an exhibit waiting');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into storage.objects (bucket_id, name, owner, metadata) values ('court-exhibits', %L, '00000000-0000-0000-0000-00000000c0a1', '{"size": 1000}') returning name$q$, pg_temp.k('PB')),
  'row-level security', 'nor into the place somebody else''s exhibit waits for');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$insert into storage.objects (bucket_id, name, owner, metadata) values ('court-exhibits', %L, '00000000-0000-0000-0000-00000000c0b1', '{"size": 999}') returning name$q$, pg_temp.k('PB')),
  'ok', 'the person who began it uploads it');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.court_exhibit_seal(%L)$q$, pg_temp.k('IB')),
  'not the size', 'a file of the wrong size is not entered');
update storage.objects set metadata = '{"size": 1000}' where bucket_id = 'court-exhibits' and name = pg_temp.k('PB');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.court_exhibit_seal(%L)$q$, pg_temp.k('IB')),
  'ok', 'the right size is entered', 'EB');
select pg_temp.check(pg_temp.k('EB') = 'B', 'and it is Exhibit B');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'),
    format($q$select jsonb_array_length(public.court_case(%L) -> 'exhibits')::text$q$, pg_temp.k('T'))) = '1',
  'the person the case is about sees Exhibit A and not the bench-only B');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'),
    format($q$select count(*)::text from storage.objects where bucket_id = 'court-exhibits' and name = %L$q$, pg_temp.k('PB'))) = '0',
  'nor its file');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select jsonb_array_length(public.court_case(%L) -> 'exhibits')::text$q$, pg_temp.k('T'))) = '2',
  'the gallery sees both');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select count(*)::text from storage.objects where bucket_id = 'court-exhibits' and name = %L$q$, pg_temp.k('PB'))) = '1',
  'and the file');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3', 45),
    format($q$select count(*)::text from storage.objects where bucket_id = 'court-exhibits' and name = %L$q$, pg_temp.k('PB'))) = '0',
  'but not with a stale pass: the file store asks the door too');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$update public.court_exhibits set sha256 = repeat('cd', 32) where path = %L returning id::text$q$, pg_temp.k('PB')),
  'permission denied', 'an exhibit''s fingerprint cannot be changed');
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$with d as (delete from storage.objects where bucket_id = 'court-exhibits' and name = %L returning 1) select count(*)::text from d$q$, pg_temp.k('PB'))) ~ '^(0|ERROR: .*)$'
    and exists (select 1 from storage.objects where bucket_id = 'court-exhibits' and name = pg_temp.k('PB')),
  'nor its file removed');
select pg_temp.as_claims(pg_temp.who('d3'),
  format($q$select public.court_exhibit_handled(%L, 'differed')::text$q$, pg_temp.k('IB')),
  'ok', 'a device whose copy did not match says so');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = '00000000-0000-0000-0000-00000000c0d1'
                                and title = 'An exhibit did not match its fingerprint'),
  'and the judge is told at once');

select pg_temp.as_claims(pg_temp.who('d3'),
  format($q$select public.court_exhibit_handled(%L, 'matched')::text$q$, pg_temp.k('IB')), 'ok', 'a matching check is written down');
select pg_temp.as_claims(pg_temp.who('d3'),
  format($q$select public.court_exhibit_handled(%L, 'matched')::text$q$, pg_temp.k('IB')), 'ok', 'and the same check again is accepted');
select pg_temp.check((select count(*) from public.court_record
                       where trial_id = pg_temp.k('T')::uuid and act = 'exhibit_matched') = 1,
  'but written once per pass, so reopening a photo does not fill the record');

-- THE JUDGE'S TOOLS ---------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_summon(%L, '00000000-0000-0000-0000-00000000c0f1')$q$, pg_temp.k('T'))) like '%not a member of this church%',
  'a witness from another church cannot be called');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_summon(%L, '00000000-0000-0000-0000-00000000c0b2')$q$, pg_temp.k('T'))) = 'ok',
  'a witness from the church is called');
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select public.court_say(%L, 'Invented witness statement')::text$q$, pg_temp.k('T')),
  'ok', 'and speaks');
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$select public.court_record_for(%L, '00000000-0000-0000-0000-00000000c0a1', 'Invented, said on the phone')::text$q$, pg_temp.k('T')),
  'ok', 'the judge writes down what somebody said by phone', 'S3');
select pg_temp.check((select author_id = '00000000-0000-0000-0000-00000000c0d1' and for_name = 'Person a1'
                        from public.trial_statements where id = pg_temp.k('S3')::uuid),
  'recorded as theirs, written by the judge');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.court_record_for(%L, '00000000-0000-0000-0000-00000000c0a1', 'Invented')::text$q$, pg_temp.k('T')),
  'Only the judge', 'nobody else writes in somebody''s name');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_gallery(%L, false)$q$, pg_temp.k('T'))) = 'ok',
  'the judge closes the gallery');
select pg_temp.as_claims(pg_temp.who('d4'), format($q$select public.join_trial(%L)::text$q$, pg_temp.k('T')),
  'heard in private', 'after which nobody new may watch');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select count(*)::text from public.trial_statements where trial_id = %L$q$, pg_temp.k('T'))) = '4',
  'and the gallery already seated stays, on the record');

-- THE END OF THE HEARING AND THE SEAL ---------------------------------------------
-- Since 20261020200000 the judge ends the hearing with a recommendation, and
-- the Church Board's ruling is written down after it.
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select public.court_close_hearing(%L, 'dismiss', 'Invented')$q$, pg_temp.k('T'))) like 'Only the judge%',
  'the gallery cannot end the hearing');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1', 45),
    format($q$select public.court_close_hearing(%L, 'dismiss', 'Invented')$q$, pg_temp.k('T'))) like '%court room is locked%',
  'nor the judge with a stale pass');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_close_hearing(%L, 'dismiss', 'Both heard. Invented.')$q$, pg_temp.k('T'))) = 'ok',
  'the judge ends the hearing');
select pg_temp.check((select seal_hash is not null and status = 'with_board' from public.trials where id = pg_temp.k('T')::uuid),
  'and the case is sealed, waiting for the Church Board');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_record_ruling(%L, 'dismissed', 'Invented ruling of the Board')$q$, pg_temp.k('T'))) = 'ok',
  'the judge writes the Board''s ruling down');
select pg_temp.check((select status = 'dismissed' from public.reports where id = '00000000-0000-0000-0000-00000000c101'),
  'the report it came from is answered');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'),
    format($q$select (public.court_check_record(%L) ->> 'holds') || '/' || (public.court_check_record(%L) ->> 'seal_holds')$q$, pg_temp.k('T'), pg_temp.k('T'))) = 'true/true',
  'the record and its seal hold');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.court_say(%L, 'Too late')::text$q$, pg_temp.k('T')),
  'ended', 'nothing is said after the hearing');

-- THE RECORD FINDS WHAT CHANGED ---------------------------------------------------
update public.trial_statements set body = 'Quietly changed' where id = pg_temp.k('S2')::uuid;
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_check_record(%L) ->> 'statements_differing'$q$, pg_temp.k('T'))) = '1',
  'a statement changed behind the record is found');
update public.court_record set detail = detail || ' ' where trial_id = pg_temp.k('T')::uuid and seq = 3;
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_check_record(%L) ->> 'broken_at'$q$, pg_temp.k('T'))) = '3',
  'an entry changed in the record is found, at the place it was changed');

-- THE RECORD OUTLIVES THE PEOPLE IN IT -------------------------------------------
delete from auth.users where id in ('00000000-0000-0000-0000-00000000c0b2', '00000000-0000-0000-0000-00000000c0d1');
select pg_temp.check((select count(*) from public.trial_statements where trial_id = pg_temp.k('T')::uuid) = 4,
  'every statement stays when the witness''s and the judge''s accounts go');
select pg_temp.check((select judge_name = 'Person d1' from public.trials where id = pg_temp.k('T')::uuid),
  'and the case still says who judged it');

-- WHAT IS NOT OPEN ------------------------------------------------------------------
select pg_temp.check(not has_function_privilege('authenticated', 'private.court_append(uuid, text, text, text, uuid, timestamptz)', 'execute'),
  'nobody signed in can write to the record directly');
select pg_temp.check(not has_table_privilege('authenticated', 'public.court_record', 'insert'),
  'nor insert into it');
select pg_temp.check(not has_function_privilege('anon', 'public.court_door()', 'execute'),
  'the signed-out visitor has no court room door at all');

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
  if total < 60 then raise exception 'only % checks ran; expected at least 60', total; end if;
  if failed > 0 then raise exception '% of % court room checks failed', failed, total; end if;
  raise notice 'the court room holds: % checks', total;
end $$;

rollback;
