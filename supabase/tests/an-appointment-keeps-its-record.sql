-- An appointment keeps its record: took place, or did not
-- (20261116140000_an_appointment_keeps_its_record.sql).
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people:
--
--   MARKED     either person in the pairing says an agreed, past appointment
--              took place or did not, and both see who said so and why.
--   ONCE       a marked one is not marked again or called off after.
--   ONLY THEN  not one still to come, not one never agreed, not from outside
--              the pairing, not by writing the status directly.
--   TOLD       the other person hears once, with a link to their appointments.
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
  ('00000000-0000-0000-0000-0000000ab001', 'Record Chapel'),
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

-- Three agreed appointments, two already past, made as the app would have.
insert into public.meetings (id, pairing_id, church_id, title, starts_at, mode, created_by, status) values
  ('00000000-0000-0000-0000-00000000c001', :'P1', :'CA', 'Met one',    now() - interval '2 days', 'online',    '00000000-0000-0000-0000-0000000b00b1', 'confirmed'),
  ('00000000-0000-0000-0000-00000000c002', :'P1', :'CA', 'Missed one', now() - interval '1 day',  'in_person', '00000000-0000-0000-0000-0000000b00b1', 'confirmed'),
  ('00000000-0000-0000-0000-00000000c003', :'P1', :'CA', 'Ahead',      now() + interval '2 days', 'online',    '00000000-0000-0000-0000-0000000b00b1', 'confirmed'),
  ('00000000-0000-0000-0000-00000000c004', :'P1', :'CA', 'Proposed',   now() - interval '3 days', 'online',    '00000000-0000-0000-0000-0000000b00b1', 'proposed');

select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c001', 'done')$q$, 'ok', 'The Explorer marks an agreed, past appointment as met');
select pg_temp.run('b1', $q$select status::text || ' / ' || answer_name from public.meetings where id = '00000000-0000-0000-0000-00000000c001'$q$, 'done / Person a1', 'The Guide sees it took place, and who said so');
select pg_temp.run('b1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c002', 'missed', 'Rain.')$q$, 'ok', 'The Guide says one did not happen, with a reason');
select pg_temp.run('a1', $q$select status::text || ' / ' || answer_note from public.meetings where id = '00000000-0000-0000-0000-00000000c002'$q$, 'missed / Rain.', 'The Explorer sees it did not happen, and why');
select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c001', 'missed')$q$, 'REFUSED', 'A marked appointment is not marked again');
select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c001', 'cancelled')$q$, 'REFUSED', 'nor called off after it took place');
select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c003', 'done')$q$, 'REFUSED', 'One still to come cannot be marked as met');
select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c004', 'done')$q$, 'REFUSED', 'Nor one that was never agreed');
select pg_temp.run('b2', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c003', 'missed')$q$, 'REFUSED', 'Nobody outside the pairing marks it');
select pg_temp.run('a1', $q$select public.answer_meeting('00000000-0000-0000-0000-00000000c003', 'held')$q$, 'REFUSED', 'An answer the app does not have is refused');
select pg_temp.run('a1', $q$with u as (update public.meetings set status = 'done' where id = '00000000-0000-0000-0000-00000000c003' returning 1) select count(*) from u$q$, 'REFUSED', 'Nobody writes the status directly');
select pg_temp.run('b1', $q$select count(*) from public.notifications where user_id = auth.uid() and type = 'meeting' and title like '%marked Met one as met'$q$, '1', 'The other person is told once that it took place');
select pg_temp.run('b1', $q$select coalesce(data->>'url', '') from public.notifications where user_id = auth.uid() and title like '%marked Met one as met'$q$, '/dm', 'and the notification opens their appointments');
select pg_temp.run('a1', $q$select count(*) from public.notifications where user_id = auth.uid() and title like '%did not happen'$q$, '1', 'and the Explorer is told once it did not');
select pg_temp.run('d1', $q$select count(*) from public.church_meeting_summary() where status::text in ('done', 'missed')$q$, '2', 'A Director knows how they went, without what they were');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 15 then raise exception 'only % checks ran; expected at least 15', total; end if;
  if failed > 0 then raise exception '% of % record checks failed', failed, total; end if;
  raise notice 'an appointment keeps its record: % checks hold', total;
end $$;

rollback;
