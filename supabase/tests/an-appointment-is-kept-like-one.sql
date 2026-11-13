-- An appointment is made, answered, changed and called off as a calendar
-- appointment is, and only through its answer.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people:
--
--   PRIVATE    the two people in a pairing read their appointment; nobody
--              else does, and a Director learns only when, not what.
--   ANSWERED   the other person confirms or declines; whoever proposed it
--              cannot confirm it themselves; an answered one stays answered.
--   CHANGED    a change is a new proposal plus calling the old one off, with
--              a note saying where it moved (components/LiveMeetings.tsx).
--   ONLY SO    nobody edits the time, place or status of a row directly, or
--              deletes one (20261112150000).
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;
-- All fictional.
create temp table results (n serial, ok boolean, label text, got text) on commit drop;
grant all on results to authenticated, anon; grant usage on sequence results_n_seq to authenticated, anon;

insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000ab001', 'Hour Chapel'),
  ('00000000-0000-0000-0000-0000000ab002', 'Other Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000b00' || s)::uuid, 'hour-' || s || '@example.test'
  from unnest(array['d1','b1','b2','a1','a2','b9','a9']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 1) = '9' then '00000000-0000-0000-0000-0000000ab002'::uuid
                   else '00000000-0000-0000-0000-0000000ab001'::uuid end,
  role = case left(right(p.id::text, 2), 1) when 'd' then 'admin' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000b00__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000b00d1', 'totp', 'verified', now(), now());
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-0000000b9001', '00000000-0000-0000-0000-0000000b00b1', '00000000-0000-0000-0000-0000000b00a1', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000b9002', '00000000-0000-0000-0000-0000000b00b2', '00000000-0000-0000-0000-0000000b00a2', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000b9009', '00000000-0000-0000-0000-0000000b00b9', '00000000-0000-0000-0000-0000000b00a9', 'digital', 'connect');

create or replace function pg_temp.run(p_who text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_out text; v_msg text := '';
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000b00' || p_who, 'role', 'authenticated',
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

\set P1 '00000000-0000-0000-0000-0000000b9001'
\set CA '00000000-0000-0000-0000-0000000ab001'

select pg_temp.run('b1', format($q$with i as (insert into public.meetings (pairing_id, church_id, title, starts_at, mode, created_by) values (%L, %L, 'Bible study', now() + interval '2 days', 'online', auth.uid()) returning 1) select count(*) from i$q$, :'P1', :'CA'), '1', 'Guide proposes a time');
select id as "T1" from public.meetings where title = 'Bible study' and pairing_id = :'P1' \gset
select pg_temp.run('a1', 'select count(*) from public.meetings', '1', 'Their Explorer sees it');
select pg_temp.run('a2', 'select count(*) from public.meetings', '0', 'Another Explorer does not');
select pg_temp.run('b2', 'select count(*) from public.meetings', '0', 'Another Guide does not');
select pg_temp.run('d1', 'select count(*) from public.meetings', '0', 'A Director does not read the appointment itself');
select pg_temp.run('d1', 'select count(*) from public.church_meeting_summary()', '1', 'A Director knows one is arranged');
select pg_temp.run('b9', 'select count(*) from public.meetings', '0', 'Another church sees nothing');
select pg_temp.run('b2', format($q$with i as (insert into public.meetings (pairing_id, church_id, title, starts_at, mode, created_by) values (%L, %L, 'Intruding', now(), 'online', auth.uid()) returning 1) select count(*) from i$q$, :'P1', :'CA'), 'REFUSED', 'Nobody proposes into another pairing');

select pg_temp.run('b1', format($q$select public.answer_meeting(%L, 'confirmed')$q$, :'T1'), 'REFUSED', 'Whoever proposed it cannot confirm it');
select pg_temp.run('b1', format($q$with u as (update public.meetings set status = 'confirmed' where id = %L returning 1) select count(*) from u$q$, :'T1'), 'REFUSED', 'Nor by writing the status directly');
select pg_temp.run('a1', format($q$with u as (update public.meetings set starts_at = now() + interval '9 days' where id = %L returning 1) select count(*) from u$q$, :'T1'), 'REFUSED', 'Nobody moves the time directly');
select pg_temp.run('a1', format($q$with u as (update public.meetings set location = 'https://evil.example/join' where id = %L returning 1) select count(*) from u$q$, :'T1'), 'REFUSED', 'Nobody swaps the place or link directly');
select pg_temp.run('a1', format($q$with d as (delete from public.meetings where id = %L returning 1) select count(*) from d$q$, :'T1'), 'REFUSED', 'Nobody deletes one directly');
select pg_temp.run('b2', format($q$select public.answer_meeting(%L, 'confirmed')$q$, :'T1'), 'REFUSED', 'Somebody outside the pairing cannot answer it');
select pg_temp.run('a1', format($q$select public.answer_meeting(%L, 'confirmed')$q$, :'T1'), 'ok', 'The Explorer confirms it');
select pg_temp.run('b1', format($q$select status::text from public.meetings where id = %L$q$, :'T1'), 'confirmed', 'Both see it confirmed');

-- A change: the new time proposed, the old one called off with a note.
select pg_temp.run('b1', format($q$with i as (insert into public.meetings (pairing_id, church_id, title, starts_at, mode, created_by) values (%L, %L, 'Bible study', now() + interval '3 days', 'in_person', auth.uid()) returning 1) select count(*) from i$q$, :'P1', :'CA'), '1', 'Guide proposes the changed time');
select pg_temp.run('b1', format($q$select public.answer_meeting(%L, 'cancelled', 'Moved to Friday.')$q$, :'T1'), 'ok', 'and calls the old one off');
select pg_temp.run('a1', format($q$select status::text || ' / ' || answer_note from public.meetings where id = %L$q$, :'T1'), 'cancelled / Moved to Friday.', 'The Explorer sees the old one called off and why');
select pg_temp.run('a1', $q$select count(*) from public.meetings where status = 'proposed'$q$, '1', 'and the new one waiting for an answer');
select pg_temp.run('a1', format($q$select public.answer_meeting(%L, 'confirmed')$q$, :'T1'), 'REFUSED', 'A called-off appointment cannot be confirmed again');
select id as "T2" from public.meetings where status = 'proposed' and pairing_id = :'P1' \gset
select pg_temp.run('a1', format($q$select public.answer_meeting(%L, 'declined', 'Working that day.')$q$, :'T2'), 'ok', 'The Explorer can say no to the new time');
select pg_temp.run('b1', format($q$select status::text || ' / ' || answer_note from public.meetings where id = %L$q$, :'T2'), 'declined / Working that day.', 'and the Guide sees the no and the reason');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 20 then raise exception 'only % checks ran; expected at least 20', total; end if;
  if failed > 0 then raise exception '% of % appointment checks failed', failed, total; end if;
  raise notice 'an appointment is kept like an appointment: % checks hold', total;
end $$;

rollback;
