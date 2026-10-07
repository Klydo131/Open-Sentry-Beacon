-- A leader stays within their rank, and a conversation stays with its two
-- people, whoever changes the pairs.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261007130000_a_leader_cannot_raise_a_rank_or_move_a_pairing):
--
--   * a Director cannot make anybody a Director or an Executive Director, nor
--     demote, disapprove or approve one; an Executive Director can, within the
--     churches they oversee, and nobody reaches the Head Executive Director;
--   * a leader changes approval and role, never somebody's own details,
--     suspension, approval records or guardian consent by hand;
--   * nobody moves a pairing onto other people, and so nobody in leadership
--     ever reads a Guide's and an Explorer's conversation;
--   * a Director changes an Explorer's Guide in one step, and the new Guide
--     starts with an empty conversation;
--   * everything the app does day to day still works.
--
-- The owner's rule, 7 October 2026: "Only Executive directors can invite
-- Executive Directors, Directors can't elevate EDs nor invite them. EDs and
-- Directors can change pairs but they can't see the Guide and Explorer's chat
-- or communication."
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
--   h  Head Executive Director        x  Executive Director
--   d  Director                       d2 another Director
--   g  Guide, walking with e          g2 another Guide
--   e  Explorer                       e2 an Explorer waiting for a Guide
--   w  signed up as a Director, not yet approved
--   w2 signed up as an Explorer, not yet approved
--   o  a Guide in another church      oe an Explorer there
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0', 'head@example.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'exec@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'director@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'director-two@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'guide@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'guide-two@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'explorer@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'explorer-two@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'waiting-director@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'waiting-explorer@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'other-guide@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'other-explorer@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000000c01', 'Test Chapel'),
  ('00000000-0000-0000-0000-000000000c02', 'Other Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) in ('d1', 'd2') then '00000000-0000-0000-0000-000000000c02'::uuid
                   else '00000000-0000-0000-0000-000000000c01'::uuid end,
  role = case left(right(p.id::text, 2), 1)
           when 'a' then 'executive'::user_role when 'b' then 'admin'::user_role
           when 'c' then 'dm'::user_role when 'e' then 'ds'::user_role
           when 'd' then (case right(p.id::text, 2) when 'd1' then 'dm' else 'ds' end)::user_role
           else (case right(p.id::text, 2) when 'f1' then 'admin' else 'ds' end)::user_role end,
  is_approved = left(right(p.id::text, 2), 1) <> 'f',
  is_head_executive = right(p.id::text, 2) = 'a0'
 where p.id::text like '00000000-0000-0000-0000-0000000000__';
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'digital', 'connect');
insert into public.messages (pairing_id, sender_id, body) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000e1', 'Something I have only told my Guide.');

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

-- How many of the first pairing's messages somebody can read.
create or replace function pg_temp.messages_seen_by(p_who text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.messages where pairing_id = '00000000-0000-0000-0000-000000000901';
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;

\set H '00000000-0000-0000-0000-0000000000a0'
\set X '00000000-0000-0000-0000-0000000000a1'
\set D '00000000-0000-0000-0000-0000000000b1'
\set G '00000000-0000-0000-0000-0000000000c1'

-- A DIRECTOR DOES NOT APPOINT ABOVE THEMSELVES --------------------------------------
select pg_temp.as_person(:'D', $q$update public.profiles set role = 'executive' where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'Only an Executive Director', 'a Director cannot make a Guide an Executive Director');
select pg_temp.as_person(:'D', $q$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'Only an Executive Director', 'nor a Director');
select pg_temp.as_person(:'D', $q$update public.profiles set is_head_executive = true where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'permission denied', 'nor mark anybody Head Executive Director');
select pg_temp.as_person(:'D', $q$update public.profiles set role = 'dm' where id = '00000000-0000-0000-0000-0000000000a1'$q$,
  'A Director may only', 'a Director cannot demote an Executive Director');
select pg_temp.as_person(:'D', $q$update public.profiles set is_approved = false where id = '00000000-0000-0000-0000-0000000000b2'$q$,
  'A Director may only', 'nor disapprove another Director');
select pg_temp.as_person(:'D', $q$update public.profiles set is_approved = true where id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'A Director may only', 'nor approve somebody who signed up as a Director');
select pg_temp.check((select role = 'dm' and not is_head_executive from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'and after all that, the Guide is still a Guide');
select pg_temp.as_person(:'D', $q$insert into public.invites (church_id, email, role, invited_by) values ('00000000-0000-0000-0000-000000000c01', 'new-exec@example.test', 'executive', '00000000-0000-0000-0000-0000000000b1')$q$,
  'Only an Executive Director', 'and cannot invite an Executive Director');

-- A LEADER CHANGES APPROVAL AND ROLE, NOTHING ELSE, BY HAND -------------------------
select pg_temp.as_person(:'D', $q$update public.profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'permission denied', 'suspension is not set by hand: suspend_member checks who may');
select pg_temp.as_person(:'D', $q$update public.profiles set guardian_consent_at = now(), guardian_name = 'Anyone' where id = '00000000-0000-0000-0000-0000000000e1'$q$,
  'permission denied', 'guardian consent is not written by hand: record_guardian_consent checks it');
select pg_temp.as_person(:'D', $q$update public.profiles set approved_by = '00000000-0000-0000-0000-0000000000b2' where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'permission denied', 'who approved somebody is recorded, never rewritten');
select pg_temp.as_person(:'D', $q$update public.profiles set full_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'theirs to change', 'somebody else''s details are theirs');
select pg_temp.as_person(:'D', $q$update public.profiles set church_id = '00000000-0000-0000-0000-000000000c02' where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  '42501', 'nor is anybody moved to another church');
select pg_temp.as_person(:'X', $q$update public.profiles set role = 'dm' where id = '00000000-0000-0000-0000-0000000000a0'$q$,
  'Head Executive Director', 'nobody reaches the Head Executive Director from inside the app');
select pg_temp.as_person(:'G', $q$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c1'$q$,
  'cannot change your own role', 'and nobody raises themselves');

-- WHAT THEY CAN DO ---------------------------------------------------------------------
select pg_temp.as_person(:'D', $q$update public.profiles set is_approved = true, role = 'ds' where id = '00000000-0000-0000-0000-0000000000f2'$q$,
  'ok', 'a Director approves an Explorer who signed up');
select pg_temp.check((select approved_by = '00000000-0000-0000-0000-0000000000b1' and approved_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'),
  'and the database records who and when');
select pg_temp.as_person(:'D', $q$update public.profiles set is_approved = false where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'ok', 'a Director disapproves a Guide');
select pg_temp.as_person(:'D', $q$update public.profiles set is_approved = true where id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'ok', 'and approves them again');
select pg_temp.as_person(:'X', $q$update public.profiles set is_approved = true where id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'ok', 'an Executive Director approves somebody who signed up as a Director');
select pg_temp.as_person(:'X', $q$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e2'$q$,
  'ok', 'and makes somebody a Director');
select pg_temp.as_person(:'G', $q$update public.profiles set full_name = 'A new name', city_of_residence = 'Elsewhere' where id = '00000000-0000-0000-0000-0000000000c1'$q$,
  'ok', 'everybody changes their own details');
select pg_temp.as_person(:'D', $q$select public.suspend_member('00000000-0000-0000-0000-0000000000c2', 'testing')$q$,
  'ok', 'suspend_member still works for a Director');
select pg_temp.check((select suspended_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'and the Guide is suspended');
select pg_temp.as_person(:'D', $q$select public.restore_member('00000000-0000-0000-0000-0000000000c2')$q$,
  'ok', 'and restore_member lifts it');

-- NOBODY MOVES A PAIRING ONTO OTHER PEOPLE --------------------------------------------
select pg_temp.as_person(:'D', $q$update public.pairings set dm_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-000000000901'$q$,
  'permission denied', 'a Director cannot make themselves the Guide in a pairing');
select pg_temp.as_person(:'G', $q$update public.pairings set ds_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-000000000901'$q$,
  'permission denied', 'a Guide cannot point their pairing at a different Explorer');
select pg_temp.as_person(:'D', $q$insert into public.pairings (dm_id, ds_id, track) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e2', 'digital')$q$,
  'Only an approved Guide', 'a Director cannot pair an Explorer with themselves');
select pg_temp.as_person(:'X', $q$insert into public.pairings (dm_id, ds_id, track) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', 'digital')$q$,
  'Only an approved Guide', 'nor can an Executive Director');
select pg_temp.as_person(:'D', $q$insert into public.pairings (dm_id, ds_id, track) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2', 'digital')$q$,
  '42501', 'a Guide from another church is not paired here');
select pg_temp.as_person(:'D', $q$insert into public.pairings (dm_id, ds_id, track) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'digital')$q$,
  'Only an Explorer', 'and only an Explorer is paired with a Guide');
select pg_temp.check(pg_temp.messages_seen_by(:'D') = 0, 'the Director reads none of the conversation');
select pg_temp.check(pg_temp.messages_seen_by(:'X') = 0, 'nor does the Executive Director');
select pg_temp.check(pg_temp.messages_seen_by(:'G') = 1 and pg_temp.messages_seen_by('00000000-0000-0000-0000-0000000000e1') = 1,
  'the Guide and the Explorer read it');

-- A GUIDE MOVES THE JOURNEY AND CAN END IT; STARTING AGAIN IS LEADERSHIP'S --------------
select pg_temp.as_person(:'G', $q$update public.pairings set journey_stage = 'cultivate' where id = '00000000-0000-0000-0000-000000000901'$q$,
  'ok', 'the Guide moves the journey on');
select pg_temp.as_person(:'G', $q$update public.pairings set ended_at = now() where id = '00000000-0000-0000-0000-000000000901'$q$,
  'permission denied', 'the end date is the database''s to record');

-- CHANGING THE GUIDE, IN ONE STEP ---------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-0000000000c2', $q$select public.change_guide('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000c2')$q$,
  'Only a Director', 'a Guide cannot take over somebody else''s Explorer');
select pg_temp.as_person(:'D', $q$select public.change_guide('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000b1')$q$,
  'Only an approved Guide', 'a Director cannot change the Guide to themselves');
select pg_temp.as_person(:'D', $q$select public.change_guide('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000c2')$q$,
  'ok', 'a Director changes the Explorer''s Guide');
select pg_temp.check((select status = 'archived' and ended_at is not null from public.pairings where id = '00000000-0000-0000-0000-000000000901'),
  'the first pairing has ended');
select pg_temp.check((select count(*) = 1 from public.pairings
                       where ds_id = '00000000-0000-0000-0000-0000000000e1' and dm_id = '00000000-0000-0000-0000-0000000000c2'
                         and status = 'active' and journey_stage = 'cultivate'),
  'the new pairing is active, and the Explorer keeps their place on the journey');
select pg_temp.check(pg_temp.messages_seen_by('00000000-0000-0000-0000-0000000000c2') = 0,
  'the new Guide does not read what the Explorer wrote to the first');
select pg_temp.check(pg_temp.messages_seen_by(:'D') = 0, 'and the Director still reads none of it');
select pg_temp.as_person(:'G', $q$update public.pairings set status = 'active' where id = '00000000-0000-0000-0000-000000000901'$q$,
  'Only a Director', 'the first Guide cannot start the ended pairing again');

-- WHAT A ROW IS ABOUT DOES NOT CHANGE ------------------------------------------------
insert into public.announcements (id, church_id, author_id, title) values
  ('00000000-0000-0000-0000-000000000a51', '00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'Bible study tonight');
insert into public.blog_posts (id, author_id, church_id, title, body, visibility, audience) values
  ('00000000-0000-0000-0000-000000000b51', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000c01', 'For the church', 'Hello', 'published', 'church');
insert into public.reports (id, church_id, reporter_id, subject_id, reason) values
  ('00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'other');
select pg_temp.as_person(:'G', $q$update public.announcements set church_id = '00000000-0000-0000-0000-000000000c02' where id = '00000000-0000-0000-0000-000000000a51'$q$,
  'cannot be changed', 'a notice cannot be moved onto another church''s board');
select pg_temp.as_person(:'D', $q$update public.announcements set author_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-000000000a51'$q$,
  'cannot be changed', 'nor its writer changed');
select pg_temp.as_person(:'G', $q$update public.announcements set title = 'Bible study at seven' where id = '00000000-0000-0000-0000-000000000a51'$q$,
  'ok', 'its writer still edits it');
select pg_temp.as_person(:'G', $q$update public.blog_posts set author_id = '00000000-0000-0000-0000-0000000000c2' where id = '00000000-0000-0000-0000-000000000b51'$q$,
  '42501', 'a post cannot be put in somebody else''s name');
select pg_temp.as_person(:'D', $q$update public.reports set reporter_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-000000000e51'$q$,
  'cannot be changed', 'whoever handles a report cannot change who made it');
select pg_temp.as_person(:'D', $q$update public.reports set subject_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-000000000e51'$q$,
  'cannot be changed', 'nor whom it is about');

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
  if total < 48 then raise exception 'only % checks ran; expected at least 48', total; end if;
  if failed > 0 then raise exception '% of % rank and pairing checks failed', failed, total; end if;
  raise notice 'a leader stays within their rank: % checks hold', total;
end $$;

rollback;
