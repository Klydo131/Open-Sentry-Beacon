-- Feedback is reviewed by a person and handed on; the sender sees what happened.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, with invented people
-- (20261028130000_feedback_is_reviewed_and_handed_on):
--
--   STARTS NEW   whatever a client sends, new feedback is Received.
--   THE SENDER   reads the status, reply and version on their own feedback,
--                never the review, and cannot change the status.
--   REVIEWERS    a Director of the same church reads the feedback, writes the
--                review and moves the status; the database says who and when.
--   NOBODY ELSE  another member, another church's Director, and anybody not
--                signed in read neither the feedback nor its review.
--   THE WORDS    what was sent cannot be rewritten, by anybody.
--   HANDLED_AT   follows the status, and an older app that writes handled_at
--                moves the status with it.
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

-- Run a query as somebody; answer its first value, or 'ERR:' and the SQLSTATE.
create or replace function pg_temp.as_user(p_user text, p_sql text)
returns text language plpgsql as $$
declare v_out text;
begin
  if p_user = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-0000-0000-0000000000' || p_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  begin
    execute p_sql into v_out;
  exception when others then
    v_out := 'ERR:' || sqlstate;
  end;
  reset role;
  return v_out;
end $$;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   ee  Feedback Chapel:  c0 its Director, c1 and c2 Explorers
--   ef  Other Chapel:     d0 its Director
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000000ee', 'Feedback Chapel'),
  ('00000000-0000-0000-0000-0000000000ef', 'Other Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || s)::uuid, 'feedback-' || s || '@example.test'
  from unnest(array['c0', 'c1', 'c2', 'd0']) s;
set local session_replication_role = replica;
update public.profiles p set
  full_name = 'Feedback person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) = 'd0' then '00000000-0000-0000-0000-0000000000ef'
                   else '00000000-0000-0000-0000-0000000000ee' end::uuid,
  role = case when right(p.id::text, 2) in ('c0', 'd0') then 'admin' else 'ds' end::user_role,
  is_approved = true
 where right(p.id::text, 2) in ('c0', 'c1', 'c2', 'd0')
   and p.id::text like '00000000-0000-0000-0000-0000000000%';
set local session_replication_role = origin;

-- STARTS NEW ---------------------------------------------------------------------
select pg_temp.check(pg_temp.as_user('c1', $q$
  insert into public.feedback (id, church_id, author_id, category, message, page, build, client_id, status, reply)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ee',
          '00000000-0000-0000-0000-0000000000c1', 'bug', 'The Journal page is blank. Invented.',
          '/study', 'v-test', 'client-f1', 'done', 'pretend reply')
  returning status || '|' || coalesce(reply, 'none')$q$) = 'new|none',
  'new feedback starts as Received, whatever the client sends');

-- THE SENDER SEES THEIR OWN ---------------------------------------------------------
select pg_temp.check(pg_temp.as_user('c1',
  $q$select status from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$) = 'new',
  'the sender reads the status of their own feedback');
select pg_temp.check(pg_temp.as_user('c2',
  $q$select count(*)::text from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$) = '0',
  'another member of the same church does not see it');

-- A REVIEWER ------------------------------------------------------------------------
select pg_temp.check(pg_temp.as_user('c0',
  $q$select count(*)::text from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$) = '1',
  'the church''s Director reads it');
select pg_temp.check(pg_temp.as_user('c0', $q$
  insert into public.feedback_review (feedback_id, church_id, summary, done_when, route, given_to, note)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ee',
          'Journal opens blank.', 'Journal opens on today.', 'ai', '', 'Private: ask c1 for a screenshot.')
  returning reviewed_by::text$q$) = '00000000-0000-0000-0000-0000000000c0',
  'and writes a review, which the database signs with who wrote it');
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set status = 'in_hand' where id = '00000000-0000-0000-0000-0000000000f1'
  returning status || '|' || (status_at is not null)::text || '|' || (handled_at is null)::text$q$) = 'in_hand|true|true',
  'moving the status stamps when, and an open one is not handled');
select pg_temp.check(pg_temp.as_user('c1',
  $q$select status from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$) = 'in_hand',
  'the sender sees it is being looked at');

-- THE SENDER NEVER READS THE REVIEW, NOR MOVES THE STATUS ---------------------------
select pg_temp.check(pg_temp.as_user('c1',
  $q$select count(*)::text from public.feedback_review$q$) = '0',
  'the sender cannot read the review, its private note least of all');
select pg_temp.check(left(pg_temp.as_user('c1', $q$
  insert into public.feedback_review (feedback_id, church_id, summary)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ee', 'Mine.')
  returning 'written'$q$), 4) = 'ERR:',
  'nor write one');
select pg_temp.as_user('c1', $q$
  update public.feedback set status = 'done' where id = '00000000-0000-0000-0000-0000000000f1' returning 'moved'$q$);
select pg_temp.check((select status from public.feedback where id = '00000000-0000-0000-0000-0000000000f1') = 'in_hand',
  'and cannot mark their own feedback done');

-- NOBODY ELSE ----------------------------------------------------------------------
select pg_temp.check(pg_temp.as_user('d0',
  $q$select count(*)::text from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$) = '0'
  and pg_temp.as_user('d0', $q$select count(*)::text from public.feedback_review$q$) = '0',
  'another church''s Director reads neither the feedback nor its review');
select pg_temp.check(left(pg_temp.as_user('d0', $q$
  insert into public.feedback_review (feedback_id, church_id, summary)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ef', 'Filed from elsewhere.')
  returning 'written'$q$), 4) = 'ERR:',
  'nor files a review against it by naming its id under their own church');
select pg_temp.check(left(pg_temp.as_user('anon', $q$select count(*)::text from public.feedback_review$q$), 4) = 'ERR:',
  'somebody not signed in cannot reach the reviews at all');

-- THE WORDS STAY AS SAID -------------------------------------------------------------
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set message = 'Rewritten.' where id = '00000000-0000-0000-0000-0000000000f1' returning 'changed'$q$) = 'ERR:42501',
  'a Director cannot rewrite what somebody sent');
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set author_id = null where id = '00000000-0000-0000-0000-0000000000f1' returning 'changed'$q$) = 'ERR:42501',
  'nor take the sender''s name off it');

-- DONE, AND HANDLED_AT FOLLOWS ---------------------------------------------------------
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set status = 'done', fixed_in = 'v-next', reply = 'Thank you.'
  where id = '00000000-0000-0000-0000-0000000000f1'
  returning (handled_at is not null)::text || '|' || handled_by::text$q$) = 'true|00000000-0000-0000-0000-0000000000c0',
  'done sets handled_at and who handled it');
select pg_temp.check(pg_temp.as_user('c1', $q$
  select status || '|' || fixed_in || '|' || reply from public.feedback where id = '00000000-0000-0000-0000-0000000000f1'$q$)
  = 'done|v-next|Thank you.',
  'the sender sees Done, the version, and the reply');
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set handled_at = null, handled_by = null where id = '00000000-0000-0000-0000-0000000000f1'
  returning status$q$) = 'reviewing',
  'an older app clearing handled_at puts it back to being looked at');
select pg_temp.check(pg_temp.as_user('c0', $q$
  update public.feedback set handled_at = now() where id = '00000000-0000-0000-0000-0000000000f1'
  returning status$q$) = 'done',
  'and marking it handled the old way makes it done');

-- A REVIEW IS KEPT ----------------------------------------------------------------------
select pg_temp.as_user('c0', $q$delete from public.feedback_review returning 'gone'$q$);
select pg_temp.check((select count(*) from public.feedback_review where feedback_id = '00000000-0000-0000-0000-0000000000f1') = 1,
  'a review cannot be deleted, even by the Director who wrote it');

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
  if total < 20 then raise exception 'only % checks ran; expected at least 20', total; end if;
  if failed > 0 then raise exception '% of % feedback checks failed', failed, total; end if;
  raise notice 'feedback is reviewed and handed on: % checks hold', total;
end $$;

rollback;
