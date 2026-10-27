-- A report is one conversation, and it keeps every rule a report had.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261027130000_a_report_is_one_conversation, on top of 20260915120000 and
-- 20261020180000):
--
--   TOLD        filing a report tells the church's leaders and never the
--               person it is about; a report about a Director or an Executive
--               Director is for Executive Directors; nobody decides a report
--               about themselves or another Director.
--   ONE CHAT    every Admin who may handle a report reads its conversation;
--               the one holding it writes for the church; the person who
--               raised it writes too; the person it is about reads and writes
--               nothing until the Admin holding it brings them in, and then
--               reads all of it, from the first message, and answers; both
--               sides are told when that happens, with no name on a lock
--               screen; a report filed under the old promise can never be
--               opened to the person it is about.
--   EVIDENCE    a report's files open to whoever may handle the report and
--               nobody else: not the Director it is about, not the Directors
--               of a report meant for Executive Directors, not the person
--               brought into the conversation.
--   KEPT        a report, its conversation and its evidence stay when an
--               account is deleted, shown as "(account deleted)"; a suspended
--               Director is not leadership; another church sees none of it.
--
-- These checks on reports lived in leave-to-answer-holds.sql until the court
-- room closed (20261027120000); they moved here unchanged where the rule did
-- not change.
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
create temp table kept (k text primary key, v text) on commit drop;
grant all on kept to authenticated, anon;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   cc11 Report Chapel         cc12 Far Chapel
--   d1   Director of cc11      (holds the reports)
--   d2   Director of cc11      (reads, does not hold)
--   d3   Director of cc11      (a report is about them)
--   e1   Executive Director of cc11
--   e2   Executive Director of cc11   (a report is about them)
--   a1   Explorer of cc11      (raises a report about their Guide b2)
--   b1   Guide of cc11         (raises reports; later deletes their account)
--   b2   Guide of cc11         (the shared conversation's report is about them)
--   f1   Guide of cc12
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000cc11', 'Report Chapel'),
  ('00000000-0000-0000-0000-00000000cc12', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000c0' || s)::uuid, 'report-' || s || '@example.test'
  from unnest(array['d1', 'd2', 'd3', 'e1', 'e2', 'a1', 'b1', 'b2', 'f1']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) = 'f1'
                   then '00000000-0000-0000-0000-00000000cc12'::uuid
                   else '00000000-0000-0000-0000-00000000cc11'::uuid end,
  role = case left(right(p.id::text, 2), 1)
           when 'd' then 'admin' when 'e' then 'executive' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-00000000c0__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
select gen_random_uuid(), ('00000000-0000-0000-0000-00000000c0' || s)::uuid, 'totp', 'verified', now(), now()
  from unnest(array['d1', 'd2', 'd3', 'e1', 'e2']) s;
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-00000000c901', '00000000-0000-0000-0000-00000000c0b2',
   '00000000-0000-0000-0000-00000000c0a1', 'digital', 'connect');

-- Who, and how freshly they proved it. Leaders have an authenticator app, so
-- their sign-in carries the second step (20261013140000).
create or replace function pg_temp.who(p_short text, p_minutes_ago integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000c0' || p_short,
    'role', 'authenticated',
    'aal', case when left(p_short, 1) in ('d', 'e') then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', case when left(p_short, 1) in ('d', 'e') then 'totp' else 'password' end,
      'timestamp', floor(extract(epoch from now()) - p_minutes_ago * 60)::bigint)));
$$;

create or replace function pg_temp.id(p_short text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000c0' || p_short)::uuid
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

-- The same, signed out.
create or replace function pg_temp.answer_anon(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  set local role anon;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR: ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;

-- A private rule's answer for a person, asked as the owner.
create or replace function pg_temp.rule(p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql into v;
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

-- Report notifications somebody has, so far.
create or replace function pg_temp.told(p_short text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = pg_temp.id(p_short) and type = 'report'
$$;

-- How many of a report's messages somebody can read through report_thread.
create or replace function pg_temp.thread(p_short text, p_key text) returns text language sql as $$
  select pg_temp.answer(pg_temp.who(p_short),
    format($q$select count(*)::text from public.report_thread(%L)$q$, pg_temp.k(p_key)))
$$;

-- REPORTS: WHO IS TOLD, WHO DECIDES ------------------------------------------------
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'inappropriate', 'Invented report about a1')::text$q$, pg_temp.id('a1')),
  'ok', 'a Guide reports an Explorer', 'R1');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'other', 'Invented report about a Director')::text$q$, pg_temp.id('d3')),
  'ok', 'and reports a Director', 'R2');
select pg_temp.check((select reporter_name = 'Person b1' and subject_name = 'Person d3' and subject_role = 'admin'
                        from public.reports where id = pg_temp.k('R2')::uuid),
  'a report keeps the names and the role it was filed with');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('d3') and type = 'report' and body like '%Person d3%'),
  'the Director a report is about is never told of it');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('d2') and type = 'report' and body like '%Person d3%'),
  'nor are other Directors, since a report about a Director is for Executive Directors');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = pg_temp.id('e1') and type = 'report' and body like '%Person d3%'),
  'the Executive Director is told');
select pg_temp.check((select count(*) from public.notifications
                       where type = 'report' and body like '%Person a1%'
                         and user_id in (pg_temp.id('d1'), pg_temp.id('d2'), pg_temp.id('d3'), pg_temp.id('e1'), pg_temp.id('e2'))) = 5,
  'a report about an Explorer reaches every leader of the church');
select pg_temp.check(pg_temp.told('a1') = 0, 'and not the Explorer it is about');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'other', 'Invented report about an Executive Director')::text$q$, pg_temp.id('e2')),
  'ok', 'a Guide reports an Executive Director');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('e2') and type = 'report' and body like '%Person e2%')
    and exists (select 1 from public.notifications
                 where user_id = pg_temp.id('e1') and type = 'report' and body like '%Person e2%'),
  'the Executive Director it is about is not told; the other one is');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Nothing to answer')::text$q$, pg_temp.k('R2'))) = 'false',
  'a Director cannot dismiss a report about themselves');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Nothing to answer')::text$q$, pg_temp.k('R2'))) = 'false',
  'nor one about another Director');
select pg_temp.check((select status from public.reports where id = pg_temp.k('R2')::uuid) = 'open',
  'and the report stays open');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Invented')::text$q$, pg_temp.k('R1'))) = 'true',
  'a Director still decides a report about an Explorer');
select pg_temp.check((select status from public.reports where id = pg_temp.k('R1')::uuid) = 'dismissed',
  'and it is decided');
update public.reports set status = 'open', decided_by = null, decided_at = null, outcome = null
 where id = pg_temp.k('R1')::uuid;
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.claim_report(%L)::text$q$, pg_temp.k('R1')),
  'ok', 'a Director picks the report up');
select pg_temp.as_claims(pg_temp.who('b1'), format($q$select public.say_in_report(%L, 'Invented message from b1')::text$q$, pg_temp.k('R1')),
  'ok', 'and the person who raised it writes to them');

-- ONE CONVERSATION -------------------------------------------------------------------
select pg_temp.check((select column_default from information_schema.columns
                       where table_schema = 'public' and table_name = 'reports' and column_name = 'subject_may_join') = 'true',
  'a report filed from now on may be opened to the person it is about');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.report_person(%L, 'harassment', 'Invented report about my Guide', %L)::text$q$,
         pg_temp.id('b2'), '00000000-0000-0000-0000-00000000c901'),
  'ok', 'an Explorer reports their Guide', 'R3');
select pg_temp.check(pg_temp.told('b2') = 0, 'the Guide is told nothing when it is filed');
select pg_temp.check(pg_temp.answer(pg_temp.who('b2'),
    format($q$select count(*)::text from public.my_reports() where id = %L$q$, pg_temp.k('R3'))) = '0',
  'and does not see it in their list');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.say_in_report(%L, 'Hello?')::text$q$, pg_temp.k('R3')),
  'Nobody has picked this up yet', 'nobody writes before a Director has picked it up');

select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.claim_report(%L)::text$q$, pg_temp.k('R3')),
  'ok', 'a Director picks it up');
select pg_temp.check((select body not ilike '%privately%' from public.notifications
                       where user_id = pg_temp.id('a1') and title = 'Someone is looking at your report'),
  'and the Explorer is told, without being promised a private chat');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.say_in_report(%L, 'Invented message from a1')::text$q$, pg_temp.k('R3')),
  'ok', 'the Explorer writes');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.say_in_report(%L, 'Invented message from d1')::text$q$, pg_temp.k('R3')),
  'ok', 'the Director holding it writes back');
select pg_temp.as_claims(pg_temp.who('d2'), format($q$select public.say_in_report(%L, 'Invented message from d2')::text$q$, pg_temp.k('R3')),
  'Pick this report up', 'another Director does not write in it while somebody holds it');
select pg_temp.check(pg_temp.thread('d2', 'R3') = '2', 'but reads every word of it');
select pg_temp.check(pg_temp.thread('e1', 'R3') = '2', 'and so does an Executive Director');
select pg_temp.check(pg_temp.thread('b2', 'R3') = '0', 'the Guide it is about reads nothing yet');
select pg_temp.check(pg_temp.answer(pg_temp.who('b2'),
    format($q$select count(*)::text from public.report_messages where report_id = %L$q$, pg_temp.k('R3'))) = '0',
  'not even straight from the table, which is what the live socket follows');
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.say_in_report(%L, 'Invented')::text$q$, pg_temp.k('R3')),
  'not yours to write in', 'and cannot write in it');

-- BRINGING THEM IN ---------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R3')),
  'Only the Director holding', 'the Guide cannot bring themselves in');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R3')),
  'Only the Director holding', 'nor can the Explorer who raised it');
select pg_temp.as_claims(pg_temp.who('d2'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R3')),
  'Only the Director holding', 'nor a Director who is not holding it');
select pg_temp.check(pg_temp.told('b2') = 0, 'and none of that tells the Guide anything');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R3')),
  'ok', 'the Director holding it brings the Guide in');
select pg_temp.check((select subject_joined_at is not null and subject_joined_by = pg_temp.id('d1')
                        from public.reports where id = pg_temp.k('R3')::uuid),
  'which is written down, with who did it');
select pg_temp.check(pg_temp.told('b2') = 1, 'the Guide is told');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = pg_temp.id('a1') and title = 'Your report''s conversation has changed'),
  'and so is the Explorer who raised it');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id in (pg_temp.id('a1'), pg_temp.id('b2'))
                                    and type = 'report' and (title || body) like '%Person%'),
  'neither message names anybody, since it can show on a lock screen');
select pg_temp.check(pg_temp.thread('b2', 'R3') = '2', 'the Guide now reads the whole conversation, from its first message');
select pg_temp.check(pg_temp.answer(pg_temp.who('b2'),
    format($q$select count(*)::text from public.report_messages where report_id = %L$q$, pg_temp.k('R3'))) = '2',
  'and the live socket''s table agrees');
select pg_temp.check(pg_temp.answer(pg_temp.who('b2'),
    format($q$select about_me::text || '/' || reporter_name || '/' || detail || '/' || can_handle::text from public.my_reports() where id = %L$q$, pg_temp.k('R3')))
    = 'true/Person a1/Invented report about my Guide/false',
  'sees the report in their list: about them, who raised it, what it says, and that it is not theirs to handle');
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.say_in_report(%L, 'Invented answer from b2')::text$q$, pg_temp.k('R3')),
  'ok', 'and answers in it');
select pg_temp.check(pg_temp.thread('a1', 'R3') = '3' and pg_temp.thread('d1', 'R3') = '3' and pg_temp.thread('d2', 'R3') = '3',
  'everybody in it sees the answer');
select pg_temp.check((select count(*) from public.notifications
                       where type = 'report' and title = 'A new message about a report'
                         and user_id in (pg_temp.id('a1'), pg_temp.id('d1'))
                         and created_at = now()) >= 2
    and not exists (select 1 from public.notifications
                     where user_id = pg_temp.id('b2') and title = 'A new message about a report'),
  'the others writing in it are told; the writer is not');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R3')),
  'already in', 'bringing them in twice is refused');
select pg_temp.check(pg_temp.thread('f1', 'R3') = '0', 'nobody of another church reads it');
select pg_temp.check(pg_temp.answer_anon(format($q$select count(*)::text from public.report_messages where report_id = %L$q$, pg_temp.k('R3'))) in ('0')
    or pg_temp.answer_anon(format($q$select count(*)::text from public.report_messages where report_id = %L$q$, pg_temp.k('R3'))) like 'ERROR:%',
  'nor anybody signed out');

-- A PROMISE KEPT ------------------------------------------------------------------------
-- R1 stands for every report filed before 20261027130000: the column was added
-- false for them.
update public.reports set subject_may_join = false where id = pg_temp.k('R1')::uuid;
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R1')),
  'promised to stay private', 'a report filed under the old promise cannot be opened to the person it is about');
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$update public.reports set subject_joined_at = now() where id = %L returning id::text$q$, pg_temp.k('R1')),
  '42501', 'a Director cannot mark it joined by writing to the table');
select pg_temp.check((select subject_joined_at is null from public.reports where id = pg_temp.k('R1')::uuid),
  'and it is still closed to them');
do $$
begin
  update public.reports set subject_joined_at = now() where id = (select v from kept where k = 'R1')::uuid;
  insert into results values (false, 'even the owner cannot mark it joined');
exception when check_violation then
  insert into results values (true, 'even the owner cannot mark it joined');
end $$;
select pg_temp.check(pg_temp.thread('a1', 'R1') = '0', 'and the Explorer it is about reads none of it');

-- A REPORT IS NOT REWRITTEN ---------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$update public.reports set detail = 'Invented rewrite' where id = %L returning id::text$q$, pg_temp.k('R3')),
  '42501', 'the Director holding a report cannot rewrite what the person reporting wrote');
select pg_temp.as_claims(pg_temp.who('e1'),
  format($q$update public.reports set claimed_by = %L where id = %L returning id::text$q$, pg_temp.id('e1'), pg_temp.k('R3')),
  '42501', 'nor can an Executive Director take a report by writing to the table');
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$delete from public.reports where id = %L returning id::text$q$, pg_temp.k('R3')),
  '42501', 'nor delete one');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into public.reports (church_id, reporter_id, subject_id, reason) values ('00000000-0000-0000-0000-00000000cc11', %L, %L, 'other') returning id::text$q$,
         pg_temp.id('a1'), pg_temp.id('d1')),
  '42501', 'and a report is filed only through the form''s own function');
select pg_temp.check((select detail = 'Invented report about my Guide' and claimed_by = pg_temp.id('d1')
                        from public.reports where id = pg_temp.k('R3')::uuid),
  'so the report reads as it was written, held by who picked it up');

-- A CLOSED REPORT ---------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'other', 'Invented report about b2')::text$q$, pg_temp.id('b2')),
  'ok', 'a Guide reports another Guide', 'R4');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.claim_report(%L)::text$q$, pg_temp.k('R4')),
  'ok', 'a Director picks it up');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Invented')::text$q$, pg_temp.k('R4'))) = 'true',
  'and closes it');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R4')),
  'already closed', 'nobody is brought into a closed report');

-- EVIDENCE --------------------------------------------------------------------------------
insert into public.report_files (report_id, church_id, added_by, name, path, mime, size_bytes) values
  (pg_temp.k('R1')::uuid, '00000000-0000-0000-0000-00000000cc11', pg_temp.id('b1'),
   'invented.png', 'reports/' || pg_temp.id('b1')::text || '/r1.png', 'image/png', 10),
  (pg_temp.k('R2')::uuid, '00000000-0000-0000-0000-00000000cc11', pg_temp.id('b1'),
   'invented.png', 'reports/' || pg_temp.id('b1')::text || '/r2.png', 'image/png', 10),
  (pg_temp.k('R3')::uuid, '00000000-0000-0000-0000-00000000cc11', pg_temp.id('a1'),
   'invented.png', 'reports/' || pg_temp.id('a1')::text || '/r3.png', 'image/png', 10);
insert into storage.objects (bucket_id, name) values
  ('pairing-media', 'reports/' || pg_temp.id('b1')::text || '/r1.png'),
  ('pairing-media', 'reports/' || pg_temp.id('b1')::text || '/r2.png'),
  ('pairing-media', 'reports/' || pg_temp.id('a1')::text || '/r3.png');

-- How many of one report's files somebody can read: rows, then stored files.
create or replace function pg_temp.evidence(p_short text, p_key text) returns text language sql as $$
  select pg_temp.answer(pg_temp.who(p_short),
           format($q$select count(*)::text from public.report_files where report_id = %L$q$, pg_temp.k(p_key)))
      || '/' ||
         pg_temp.answer(pg_temp.who(p_short),
           format($q$select count(*)::text from storage.objects where bucket_id = 'pairing-media' and name = %L$q$,
                  (select path from public.report_files where report_id = pg_temp.k(p_key)::uuid)))
$$;

select pg_temp.check(pg_temp.evidence('d3', 'R2') = '0/0',
  'the Director a report is about cannot open its evidence');
select pg_temp.check(pg_temp.evidence('d2', 'R2') = '0/0',
  'nor can another Director, since the report is for Executive Directors');
select pg_temp.check(pg_temp.evidence('e1', 'R2') = '1/1',
  'the Executive Director can');
select pg_temp.check(pg_temp.evidence('d1', 'R1') = '1/1' and pg_temp.evidence('d2', 'R1') = '1/1',
  'a Director opens the evidence in a report about an Explorer');
select pg_temp.check(pg_temp.evidence('a1', 'R1') = '0/0',
  'the Explorer it is about does not');
select pg_temp.check(pg_temp.evidence('b2', 'R3') = '0/0',
  'nor does the Guide brought into the conversation');
select pg_temp.check(pg_temp.evidence('f1', 'R1') = '0/0',
  'nor anybody of another church');

-- A SUSPENDED DIRECTOR IS NOT LEADERSHIP ---------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'), format($q$select public.suspend_member(%L, 'Invented')$q$, pg_temp.id('d3'))) = 'ok',
  'an Executive Director suspends a Director');
select pg_temp.check(pg_temp.rule(pg_temp.who('d3'), format($q$select private.may_handle_report(%L)::text$q$, pg_temp.k('R1'))) = 'false'
    and pg_temp.rule(pg_temp.who('d3'), format($q$select private.in_report(%L)::text$q$, pg_temp.k('R3'))) = 'false',
  'who may then neither handle a report nor read its conversation');

-- THE RECORD OUTLIVES THE ACCOUNT -----------------------------------------------------
delete from auth.users where id = pg_temp.id('b1');
select pg_temp.check((select reporter_id is null and reporter_name = 'Person b1'
                        from public.reports where id = pg_temp.k('R1')::uuid),
  'the report stays when the account of the person who raised it is deleted');
select pg_temp.check((select count(*) from public.report_messages where report_id = pg_temp.k('R1')::uuid) = 1
    and (select count(*) from public.report_files where report_id = pg_temp.k('R1')::uuid and added_name = 'Person b1') = 1,
  'with its conversation and its evidence');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select author_name from public.report_thread(%L) limit 1$q$, pg_temp.k('R1'))) = 'Person b1 (account deleted)',
  'and what they wrote is shown as written by a deleted account');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.say_in_report(%L, 'Invented reply')::text$q$, pg_temp.k('R1')),
  'deleted their account', 'a reply nobody would read is not taken');

delete from auth.users where id = pg_temp.id('a1');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.say_in_report(%L, 'Invented reply to b2')::text$q$, pg_temp.k('R3')),
  'ok', 'a conversation the person it is about has joined goes on when the one who raised it is gone');
select pg_temp.check(pg_temp.answer(pg_temp.who('b2'),
    format($q$select reporter_name from public.my_reports() where id = %L$q$, pg_temp.k('R3'))) = 'Person a1 (account deleted)',
  'and shows them as deleted');

delete from auth.users where id = pg_temp.id('d3');
select pg_temp.check((select subject_id is null and subject_name = 'Person d3' and subject_role = 'admin'
                        from public.reports where id = pg_temp.k('R2')::uuid),
  'a report about a Director stays when that Director''s account is deleted');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select count(*)::text from public.my_reports() where id = %L$q$, pg_temp.k('R2'))) = '0',
  'and still does not open to Directors');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select subject_name from public.my_reports() where id = %L$q$, pg_temp.k('R2'))) = 'Person d3 (account deleted)',
  'the Executive Director reads it, the person shown as deleted');
select pg_temp.as_claims(pg_temp.who('e1'), format($q$select public.claim_report(%L)::text$q$, pg_temp.k('R2')),
  'ok', 'and picks it up');
select pg_temp.as_claims(pg_temp.who('e1'), format($q$select public.bring_subject_into_report(%L)::text$q$, pg_temp.k('R2')),
  'deleted', 'but there is nobody left to bring in');

-- THE CHURCH IS THE BOUNDARY ------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('f1'), $q$select count(*)::text from public.my_reports()$q$) = '0',
  'somebody of another church sees none of it');

-- WHAT IS NOT OPEN ------------------------------------------------------------------------
select pg_temp.check(not has_function_privilege('anon', 'public.bring_subject_into_report(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_reports()', 'execute')
    and not has_function_privilege('anon', 'private.may_read_report_file(text)', 'execute'),
  'the signed-out visitor brings nobody in, lists nothing and opens no evidence');
select pg_temp.check(not has_function_privilege('authenticated', 'private.name_kept(uuid, text)', 'execute'),
  'nobody signed in looks up a name by an id');
select pg_temp.check(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname in ('public', 'private')
                                    and p.prosrc ~* '(public\.trials|trial_parties|trial_statements|court_record|court_leave)'),
  'and nothing that remains still reaches for the court room');

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
  if total < 70 then raise exception 'only % checks ran; expected at least 70', total; end if;
  if failed > 0 then raise exception '% of % report checks failed', failed, total; end if;
  raise notice 'a report is one conversation and keeps its rules: % checks hold', total;
end $$;

rollback;
