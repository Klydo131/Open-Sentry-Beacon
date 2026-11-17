-- A deletion reaches everyone it was shared with.
--
-- ---------------------------------------------------------------------------
-- Members reported that a study, a lesson or a resource deleted by a Guide or
-- the Director stayed on their Explorer's screen. Three causes, each proved
-- here against a database built from nothing:
--
--   1. Nobody could take a study back: lesson_assignments had no delete rule,
--      so "delete" only hid it from the person who pressed it.
--   2. A Guide's changes to somebody else's study go into the Guide's own
--      copy, which the Explorer could not read; the Explorer kept reading the
--      original, deleted lessons and all.
--   3. A delete the rules refuse removes zero rows and raises no error, so the
--      app said "deleted" when nothing was (fixed in lib/live/data.ts, which
--      now asks for the rows back; the zero here is that case).
--
-- EVERYTHING IS ROLLED BACK.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;
-- All fictional.
create temp table results (n serial, ok boolean, label text, got text) on commit drop;
grant all on results to authenticated, anon; grant usage on sequence results_n_seq to authenticated, anon;

insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000aa001', 'Study Chapel'),
  ('00000000-0000-0000-0000-0000000aa002', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000a00' || s)::uuid, 'gone-' || s || '@example.test'
  from unnest(array['d1','b1','b2','a1','a2','b9','a9']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 1) = '9' then '00000000-0000-0000-0000-0000000aa002'::uuid
                   else '00000000-0000-0000-0000-0000000aa001'::uuid end,
  role = case left(right(p.id::text, 2), 1) when 'd' then 'admin' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000a00__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000a00d1', 'totp', 'verified', now(), now());
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-0000000a9001', '00000000-0000-0000-0000-0000000a00b1', '00000000-0000-0000-0000-0000000a00a1', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000a9002', '00000000-0000-0000-0000-0000000a00b2', '00000000-0000-0000-0000-0000000a00a2', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000a9009', '00000000-0000-0000-0000-0000000a00b9', '00000000-0000-0000-0000-0000000a00a9', 'digital', 'connect');

create or replace function pg_temp.run(p_who text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_out text; v_msg text := '';
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000a00' || p_who, 'role', 'authenticated',
    'aal', case when left(p_who,1)='d' then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object('method', case when left(p_who,1)='d' then 'totp' else 'password' end,
           'timestamp', floor(extract(epoch from now()) - 60)::bigint)))::text, true);
  set local role authenticated;
  begin execute p_sql into v_out; exception when others then v_state := sqlstate; v_msg := sqlerrm; end;
  reset role;
  insert into results (ok, label, got)
  values ((v_state = 'ok' and coalesce(v_out,'') = p_expect) or (v_state <> 'ok' and p_expect = 'REFUSED'),
          p_label, case when v_state='ok' then coalesce(v_out,'(null)') else v_state || ' ' || left(v_msg, 90) end);
end $$;

\set P1 '00000000-0000-0000-0000-0000000a9001'
\set P2 '00000000-0000-0000-0000-0000000a9002'
\set CA '00000000-0000-0000-0000-0000000aa001'

-- The Director writes a published study; Guide b1 gives it to their Explorer.
insert into public.lesson_series (id, church_id, title, topic, author_id, is_published) values
  ('00000000-0000-0000-0000-00000000c001', :'CA', 'Director study', 'General', '00000000-0000-0000-0000-0000000a00d1', true),
  ('00000000-0000-0000-0000-00000000c002', :'CA', 'Second study', 'General', '00000000-0000-0000-0000-0000000a00d1', true),
  ('00000000-0000-0000-0000-00000000c003', :'CA', 'Guide study', 'General', '00000000-0000-0000-0000-0000000a00b1', false);
insert into public.lessons (series_id, church_id, author_id, title, body, position) values
  ('00000000-0000-0000-0000-00000000c001', :'CA', '00000000-0000-0000-0000-0000000a00d1', 'One', '', 1),
  ('00000000-0000-0000-0000-00000000c001', :'CA', '00000000-0000-0000-0000-0000000a00d1', 'Two', '', 2),
  ('00000000-0000-0000-0000-00000000c002', :'CA', '00000000-0000-0000-0000-0000000a00d1', 'Only', '', 1),
  ('00000000-0000-0000-0000-00000000c003', :'CA', '00000000-0000-0000-0000-0000000a00b1', 'Mine', '', 1);
insert into public.lesson_assignments (pairing_id, series_id, assigned_by) values
  (:'P1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000a00b1'),
  (:'P1', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000a00b1'),
  (:'P1', '00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000a00b1');

-- AN EXPLORER READS WHAT THEIR GUIDE GAVE THEM, even the Guide's own study.
select pg_temp.run('a1', 'select count(*) from public.lesson_series', '3', 'The Explorer reads every study given to them, the Guide''s own included');
select pg_temp.run('a2', $q$select count(*) from public.lesson_series where title = 'Guide study'$q$, '0', 'Another Explorer does not read the Guide''s study');

-- TAKING A STUDY BACK.
select pg_temp.run('a1', format($q$with d as (delete from public.lesson_assignments where pairing_id = %L and series_id = '00000000-0000-0000-0000-00000000c002' returning 1) select count(*) from d$q$, :'P1'), '0', 'An Explorer cannot take a study away');
select pg_temp.run('b2', format($q$with d as (delete from public.lesson_assignments where pairing_id = %L returning 1) select count(*) from d$q$, :'P1'), '0', 'Another Guide cannot take studies from this pairing');
select pg_temp.run('b1', format($q$with d as (delete from public.lesson_assignments where pairing_id = %L and series_id = '00000000-0000-0000-0000-00000000c002' returning 1) select count(*) from d$q$, :'P1'), '1', 'The Guide takes a study back');
select pg_temp.run('a1', $q$select count(*) from public.lesson_assignments where series_id = '00000000-0000-0000-0000-00000000c002'$q$, '0', 'and it is no longer given to the Explorer');

-- A GUIDE'S OWN COPY REACHES THEIR EXPLORER. Copy the Director's study, drop
-- a lesson from the copy, and move the pairing's assignment onto the copy.
insert into public.lesson_series (id, church_id, title, topic, author_id, is_published, copied_from) values
  ('00000000-0000-0000-0000-00000000c011', :'CA', 'Director study', 'General', '00000000-0000-0000-0000-0000000a00b1', false, '00000000-0000-0000-0000-00000000c001');
insert into public.lessons (series_id, church_id, author_id, title, body, position) values
  ('00000000-0000-0000-0000-00000000c011', :'CA', '00000000-0000-0000-0000-0000000a00b1', 'One', '', 1);
select pg_temp.run('b2', $q$select public.give_my_copy_to_my_explorers('00000000-0000-0000-0000-00000000c011')$q$, '0', 'Another Guide cannot move pairings onto a copy that is not theirs');
select pg_temp.run('b1', $q$select public.give_my_copy_to_my_explorers('00000000-0000-0000-0000-00000000c011')$q$, '1', 'The Guide''s Explorer is moved onto the Guide''s copy');
select pg_temp.run('a1', $q$select count(*) from public.lesson_assignments where series_id = '00000000-0000-0000-0000-00000000c011'$q$, '1', 'The Explorer is now given the Guide''s copy');
select pg_temp.run('a1', $q$select count(*) from public.lessons where series_id = '00000000-0000-0000-0000-00000000c011' and title = 'Two'$q$, '0', 'The lesson the Guide deleted is not in what the Explorer is given');
select pg_temp.run('a1', $q$select count(*) from public.lessons where series_id = '00000000-0000-0000-0000-00000000c011' and title = 'One'$q$, '1', 'and the Explorer reads the lesson the Guide kept');
select pg_temp.run('a2', $q$select count(*) from public.lesson_series where id = '00000000-0000-0000-0000-00000000c011'$q$, '0', 'Another Explorer does not read that Guide''s copy');

-- A DIRECTOR DELETES ANY STUDY IN THEIR CHURCH, and it is gone for everybody.
select pg_temp.run('d1', $q$with d as (delete from public.lesson_series where id = '00000000-0000-0000-0000-00000000c003' returning 1) select count(*) from d$q$, '1', 'The Director deletes a Guide''s study');
select pg_temp.run('a1', $q$select count(*) from public.lessons where title = 'Mine'$q$, '0', 'and the Explorer no longer reads it');
select pg_temp.run('b1', $q$select count(*) from public.lesson_assignments where series_id = '00000000-0000-0000-0000-00000000c003'$q$, '0', 'and nothing is left assigned');

-- A RESOURCE DELETED BY ITS ADDER IS GONE FOR THE EXPLORER.
select pg_temp.run('b1', format($q$with i as (insert into public.materials (church_id, added_by, title, kind, external_url) values (%L, auth.uid(), 'Handout', 'link', 'https://example.org/h') returning 1) select count(*) from i$q$, :'CA'), '1', 'Guide adds a resource');
select id as "M1" from public.materials where title = 'Handout' \gset
select pg_temp.run('b1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, auth.uid()) returning 1) select count(*) from i$q$, :'M1', :'P1'), '1', 'and shares it');
select pg_temp.run('a1', $q$with d as (delete from public.materials where title = 'Handout' returning 1) select count(*) from d$q$, '0', 'The Explorer cannot delete it (zero rows: the app must check the count)');
select pg_temp.run('b1', $q$with d as (delete from public.materials where title = 'Handout' returning 1) select count(*) from d$q$, '1', 'The Guide deletes it');
select pg_temp.run('a1', $q$select count(*) from public.materials where title = 'Handout'$q$, '0', 'and it is gone for the Explorer');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 18 then raise exception 'only % checks ran; expected at least 18', total; end if;
  if failed > 0 then raise exception '% of % deletion checks failed', failed, total; end if;
  raise notice 'a deletion reaches everyone: % checks hold', total;
end $$;

rollback;
