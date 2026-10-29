-- The member waiting to be approved is named in the notice, not "Somebody".
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261029110000_a_waiting_member_is_named): when an
-- invited member who needs approval finishes signing up, every Director and
-- Executive Director of their church is told, and the title is the member's
-- name:
--
--   * the name they signed up with, first;
--   * or the name on their invitation, if they gave none;
--   * or "A new member", if there is neither;
--   * at most 80 characters of it, however much was typed;
--   * and never "Somebody";
--
-- and nobody else in the church is told.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   a1  the Director of the chapel     e1  its Executive Director
--   b1  an Explorer in it
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'named-director@example.test'),
  ('00000000-0000-0000-0000-0000000004e1', 'named-executive@example.test'),
  ('00000000-0000-0000-0000-0000000004b1', 'named-explorer@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000004c01', 'Naming Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-000000004c01'::uuid,
  role = (case right(p.id::text, 2) when 'a1' then 'admin' when 'e1' then 'executive' else 'ds' end)::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000004__';

-- Four invitations to be a Guide, which waits for a Director's approval.
insert into public.invites (church_id, email, role, full_name, invited_by) values
  ('00000000-0000-0000-0000-000000004c01', 'guide-own-name@example.test', 'dm', 'Name On The Invitation', '00000000-0000-0000-0000-0000000004a1'),
  ('00000000-0000-0000-0000-000000004c01', 'guide-invite-name@example.test', 'dm', 'Paul Example', '00000000-0000-0000-0000-0000000004a1'),
  ('00000000-0000-0000-0000-000000004c01', 'guide-no-name@example.test', 'dm', null, '00000000-0000-0000-0000-0000000004a1'),
  ('00000000-0000-0000-0000-000000004c01', 'guide-long-name@example.test', 'dm', null, '00000000-0000-0000-0000-0000000004a1');

-- They sign up.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004f1', 'guide-own-name@example.test', '{"full_name": "Grace Example"}'),
  ('00000000-0000-0000-0000-0000000004f2', 'guide-invite-name@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000004f3', 'guide-no-name@example.test', '{"full_name": "   "}'),
  ('00000000-0000-0000-0000-0000000004f4', 'guide-long-name@example.test', jsonb_build_object('full_name', repeat('Long', 50)));

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

-- Notices to the Director, newest last.
create temp view director_notices as
  select title, body from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000004a1' and type = 'approval';

select pg_temp.check(exists (select 1 from director_notices where title = 'Grace Example is waiting to be approved'),
  'the notice is titled with the name the member signed up with');
select pg_temp.check(exists (select 1 from director_notices where title = 'Paul Example is waiting to be approved'),
  'or, when they gave none, with the name on their invitation');
select pg_temp.check(exists (select 1 from director_notices where title = 'A new member is waiting to be approved'),
  'or, when there is neither, "A new member"');
select pg_temp.check(exists (select 1 from director_notices where title = repeat('Long', 20) || ' is waiting to be approved'),
  'a name typed 200 characters long is cut to 80 in the title');
select pg_temp.check(not exists (select 1 from public.notifications where title ilike 'Somebody%'),
  'no notice is titled "Somebody"');
select pg_temp.check((select count(*) from director_notices) = 4
    and (select bool_and(body = 'They have finished signing up and cannot get in until a Director approves them.') from director_notices),
  'each of the four says, under the name, that they cannot get in until a Director approves them');
select pg_temp.check((select count(*) from public.notifications
     where user_id = '00000000-0000-0000-0000-0000000004e1' and type = 'approval' and title like '% is waiting to be approved') = 4,
  'the Executive Director is told too');
select pg_temp.check(not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000004b1'),
  'an Explorer in the same church is not told');

-- RESULTS --------------------------------------------------------------------
\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 8 then raise exception 'only % checks ran; expected at least 8', total; end if;
  if failed > 0 then raise exception '% of % naming checks failed', failed, total; end if;
  raise notice 'a waiting member is named: % checks hold', total;
end $$;

rollback;
