-- What one person does reaches the other person (20261116120000).
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh:
--
--   * a new pairing, a message, a share, a study given and finished, a lesson
--     read, a meeting, a published post, a church notice and a Guides' room
--     post each tell the right person, and never the person who did it;
--   * a busy conversation is one notification until it is read;
--   * no message, prayer or post words are ever in a notification;
--   * a suspended member is told nothing, a private post tells nobody;
--   * nobody signed in can call the functions that write them.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant all on results to public;
create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin insert into results values (coalesce(p_cond, false), p_label); end $$;
create or replace function pg_temp.n(p_user text, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user::uuid and type = p_type $$;

-- FIXTURES (all fictional): d1 a Guide, e1 an Explorer, e2 a suspended Explorer,
-- a1 a Director, d2 another Guide, in one chapel.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ac0d1', 'act-guide@example.test'),
  ('00000000-0000-0000-0000-0000000ac0e1', 'act-explorer@example.test'),
  ('00000000-0000-0000-0000-0000000ac0e2', 'act-suspended@example.test'),
  ('00000000-0000-0000-0000-0000000ac0a1', 'act-director@example.test'),
  ('00000000-0000-0000-0000-0000000ac0d2', 'act-guide-two@example.test');
insert into public.churches (id, name) values ('00000000-0000-0000-0000-0000000ac0c1', 'Activity Chapel');
update public.profiles p set
  full_name = case right(p.id::text, 2) when 'd1' then 'Grace Guide' when 'e1' then 'Ezra Explorer'
                when 'e2' then 'Ed Away' when 'a1' then 'Dana Director' else 'Gil Guide' end,
  church_id = '00000000-0000-0000-0000-0000000ac0c1'::uuid,
  role = (case right(p.id::text, 2) when 'a1' then 'admin' when 'd1' then 'dm' when 'd2' then 'dm' else 'ds' end)::user_role,
  is_approved = true,
  suspended_at = case when right(p.id::text, 2) = 'e2' then now() end,
  signup_completed_at = now()
 where p.id::text like '00000000-0000-0000-0000-0000000ac0__';

-- 1. A NEW PAIRING tells both, by first name.
insert into public.pairings (id, dm_id, ds_id, created_by) values
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1', '00000000-0000-0000-0000-0000000ac0e1', '00000000-0000-0000-0000-0000000ac0a1'),
  ('00000000-0000-0000-0000-0000000ac0f2', '00000000-0000-0000-0000-0000000ac0d1', '00000000-0000-0000-0000-0000000ac0e2', '00000000-0000-0000-0000-0000000ac0a1');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'pairing') = 1 and pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'pairing') = 2,
  'a new pairing tells the Explorer and the Guide');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0e1' and title = 'You have a Guide: Grace'),
  'the Explorer is told their Guide''s first name');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e2', 'pairing') = 0, 'a suspended member is told nothing');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0a1', 'pairing') = 0, 'the Director who made the pairing is not told about their own action');

-- 2. MESSAGES: one notification until read, never the words.
insert into public.messages (pairing_id, sender_id, body) values
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS one'),
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS two'),
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS three');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'message') = 1, 'three messages in a row are one notification until it is read');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'message') = 0, 'the sender is not told about their own message');
update public.notifications set read_at = now() where user_id = '00000000-0000-0000-0000-0000000ac0e1' and type = 'message';
insert into public.messages (pairing_id, sender_id, body) values
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS four');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'message') = 2, 'once read, the next message tells them again');
insert into public.messages (pairing_id, sender_id, body) values
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0e1', 'SECRET WORDS reply');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'message') = 1, 'a reply tells the Guide');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0d1' and type = 'message'
  and title = 'Ezra sent you a message' and data->>'url' = '/dm'), 'the Guide''s notification names the Explorer and opens their desk');

-- 3. A SHARE.
insert into public.materials (id, church_id, added_by, title, external_url) values
  ('00000000-0000-0000-0000-0000000ac0b1', '00000000-0000-0000-0000-0000000ac0c1', '00000000-0000-0000-0000-0000000ac0d1', 'Steps to Peace', 'https://example.org/steps');
insert into public.material_shares (material_id, pairing_id, shared_by) values
  ('00000000-0000-0000-0000-0000000ac0b1', '00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0d1');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0e1' and type = 'share' and body = 'Steps to Peace'),
  'a share tells the Explorer what was shared');

-- 4. A STUDY GIVEN, then FINISHED; a LESSON READ.
insert into public.lesson_series (id, church_id, title) values
  ('00000000-0000-0000-0000-0000000ac0b2', '00000000-0000-0000-0000-0000000ac0c1', 'Life of Jesus');
insert into public.lessons (id, church_id, author_id, title, series_id) values
  ('00000000-0000-0000-0000-0000000ac0b3', '00000000-0000-0000-0000-0000000ac0c1', '00000000-0000-0000-0000-0000000ac0d1', 'The Sermon on the Mount', '00000000-0000-0000-0000-0000000ac0b2');
insert into public.lesson_assignments (id, pairing_id, series_id, assigned_by) values
  ('00000000-0000-0000-0000-0000000ac0b4', '00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0b2', '00000000-0000-0000-0000-0000000ac0d1');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0e1' and type = 'lesson' and title = 'Grace gave you a study'),
  'a study given tells the Explorer');
insert into public.lesson_reads (lesson_id, user_id) values ('00000000-0000-0000-0000-0000000ac0b3', '00000000-0000-0000-0000-0000000ac0e1');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0d1' and type = 'lesson' and title = 'Ezra read a lesson'),
  'a lesson read tells the Guide');
update public.lesson_assignments set completed_at = now() where id = '00000000-0000-0000-0000-0000000ac0b4';
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0d1' and type = 'lesson' and title = 'Ezra finished a study'),
  'a study finished tells the Guide');

-- 5. A MEETING suggested, then confirmed.
insert into public.meetings (id, pairing_id, church_id, title, starts_at, created_by) values
  ('00000000-0000-0000-0000-0000000ac0b5', '00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac0c1', 'Coffee and Bible', now() + interval '2 days', '00000000-0000-0000-0000-0000000ac0d1');
select pg_temp.check(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000ac0e1' and type = 'meeting' and title = 'Grace suggested a time to meet'),
  'a meeting suggested tells the other person');
-- Confirmed as the app confirms, through answer_meeting, which does the telling
-- (since 20261116140000 the trigger speaks only for a proposal or a moved time,
-- so an answer is told once, not twice).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ac0e1","role":"authenticated"}', true);
set local role authenticated;
select public.answer_meeting('00000000-0000-0000-0000-0000000ac0b5', 'confirmed');
reset role;
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'meeting') + pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'meeting') = 2, 'confirming tells one more person, once');
update public.meetings set starts_at = starts_at + interval '1 day' where id = '00000000-0000-0000-0000-0000000ac0b5';
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'meeting') + pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'meeting') = 3, 'a moved time is told too');

-- 6. POSTS: a private one tells nobody; publishing it tells the Guide's Explorers.
insert into public.blog_posts (id, author_id, church_id, title, body, visibility) values
  ('00000000-0000-0000-0000-0000000ac0b6', '00000000-0000-0000-0000-0000000ac0d1', '00000000-0000-0000-0000-0000000ac0c1', 'This week''s thought', 'SECRET WORDS post', 'private');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'post') = 0, 'a private post tells nobody');
update public.blog_posts set visibility = 'published' where id = '00000000-0000-0000-0000-0000000ac0b6';
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'post') = 1 and pg_temp.n('00000000-0000-0000-0000-0000000ac0e2', 'post') = 0, 'publishing tells the Guide''s active Explorers, not a suspended one');
update public.blog_posts set title = 'Edited' where id = '00000000-0000-0000-0000-0000000ac0b6';
update public.blog_posts set visibility = 'published' where id = '00000000-0000-0000-0000-0000000ac0b6';
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'post') = 1, 'touching a published post again does not tell them twice');

-- 7. A CHURCH NOTICE tells every approved member but its author.
insert into public.announcements (church_id, author_id, title) values ('00000000-0000-0000-0000-0000000ac0c1', '00000000-0000-0000-0000-0000000ac0a1', 'Potluck on Sabbath');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'announcement') = 1 and pg_temp.n('00000000-0000-0000-0000-0000000ac0d2', 'announcement') = 1
  and pg_temp.n('00000000-0000-0000-0000-0000000ac0a1', 'announcement') = 0 and pg_temp.n('00000000-0000-0000-0000-0000000ac0e2', 'announcement') = 0,
  'a church notice tells every approved member, not its author or a suspended member');

-- 8. THE GUIDES' ROOM: Guides and leaders, once per half hour.
insert into public.guide_room_messages (church_id, author_id, body) values ('00000000-0000-0000-0000-0000000ac0c1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS room one');
insert into public.guide_room_messages (church_id, author_id, body) values ('00000000-0000-0000-0000-0000000ac0c1', '00000000-0000-0000-0000-0000000ac0d1', 'SECRET WORDS room two');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0d2', 'guide_room') = 1 and pg_temp.n('00000000-0000-0000-0000-0000000ac0a1', 'guide_room') = 1,
  'two posts in the Guides'' room are one notification for each Guide and leader');
select pg_temp.check(pg_temp.n('00000000-0000-0000-0000-0000000ac0d1', 'guide_room') = 0 and pg_temp.n('00000000-0000-0000-0000-0000000ac0e1', 'guide_room') = 0,
  'not the author, and never an Explorer');

-- 9. NOTHING SECRET, NOTHING CALLABLE.
select pg_temp.check(not exists (select 1 from public.notifications where title ilike '%SECRET%' or body ilike '%SECRET%'),
  'no words of a message or a post appear in any notification');
select pg_temp.check(not exists (select 1 from public.notifications n where n.data ? 'url' and n.data->>'url' !~ '^/[a-z]'),
  'every notification opens a screen inside the app');
select pg_temp.check(not has_function_privilege('authenticated', 'private.tell(uuid, uuid, text, text, text, jsonb)', 'execute'),
  'nobody signed in can write a notification');
select pg_temp.check(not has_function_privilege('authenticated', 'private.a_message_is_told()', 'execute'),
  'nor call a trigger function directly');

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
  if failed > 0 then raise exception '% of % activity checks failed', failed, total; end if;
  raise notice 'activity reaches the other person: % checks hold', total;
end $$;

rollback;
