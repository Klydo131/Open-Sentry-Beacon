-- The plan a church pays for sets what each person may keep.
--
-- Asked for on 18 November 2026: a church on Supabase's free plan runs within
-- its limits, and a church that pays gets the room it pays for, by one switch
-- (HOSTING_PLAN in app_settings). This proves, against a database built from
-- nothing: the free plan is the default; the switch raises each person's
-- allowance and the limits leaders are shown; only leaders see the read-out,
-- and it holds totals only. EVERYTHING IS ROLLED BACK.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;
-- All fictional.
create temp table results (n serial, ok boolean, label text, got text) on commit drop;
grant all on results to authenticated, anon; grant usage on sequence results_n_seq to authenticated, anon;

insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000aa001', 'App Chapel'),
  ('00000000-0000-0000-0000-0000000aa002', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000a00' || s)::uuid, 'apps-' || s || '@example.test'
  from unnest(array['d1','b1','b2','a1','a2','b9','a9','e1']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 1) = '9' then '00000000-0000-0000-0000-0000000aa002'::uuid
                   else '00000000-0000-0000-0000-0000000aa001'::uuid end,
  role = case left(right(p.id::text, 2), 1) when 'd' then 'admin' when 'e' then 'executive' when 'a' then 'ds' else 'dm' end::user_role,
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


\set CA '00000000-0000-0000-0000-0000000aa001'
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000a00e1', 'totp', 'verified', now(), now());
insert into public.church_executives (church_id, executive_id) values (:'CA', '00000000-0000-0000-0000-0000000a00e1') on conflict do nothing;

delete from public.app_settings where key = 'HOSTING_PLAN';

-- Person b1 already keeps 250 MB of resources, in three files; b2 keeps 1 MB.
insert into storage.objects (bucket_id, name, owner, metadata)
select 'pairing-media', 'library/00000000-0000-0000-0000-0000000a00b1/' || g || '.pdf',
       '00000000-0000-0000-0000-0000000a00b1', jsonb_build_object('size', (250 * 1024 * 1024 / 3)::text)
  from generate_series(1, 3) g;
insert into storage.objects (bucket_id, name, owner, metadata)
values ('pairing-media', 'library/00000000-0000-0000-0000-0000000a00b2/one.pdf',
        '00000000-0000-0000-0000-0000000a00b2', jsonb_build_object('size', (1024 * 1024)::text));
-- And 250 MB of post photos, for b1 again.
insert into storage.objects (bucket_id, name, owner, metadata)
values ('post-media', 'x/y/250.jpg', '00000000-0000-0000-0000-0000000a00b1',
        jsonb_build_object('size', (250 * 1024 * 1024)::text));

-- THE FREE PLAN, by default.
select pg_temp.run('d1', $q$select public.church_space() ->> 'plan'$q$, 'free', 'With no switch, the plan is free');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'file_limit')::bigint = 1024::bigint*1024*1024$q$, 'true', 'Free shows 1 GB of files');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'database_limit')::bigint = 500::bigint*1024*1024$q$, 'true', 'Free shows 500 MB of database');
select pg_temp.run('e1', $q$select public.church_space() ->> 'plan'$q$, 'free', 'An Executive Director sees it too');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'file_bytes')::bigint >= 500::bigint*1024*1024$q$, 'true', 'The file total counts every kept file');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'database_bytes')::bigint > 0$q$, 'true', 'The database size is read');
select pg_temp.run('d1', $q$select string_agg(k, ',' order by k) from jsonb_object_keys(public.church_space()) k$q$,
  'database_bytes,database_limit,file_bytes,file_limit,person_limit,plan', 'It holds totals and limits, and nothing else');
select pg_temp.run('b1', 'select public.church_space()', 'REFUSED', 'A Guide cannot see it');
select pg_temp.run('a1', 'select public.church_space()', 'REFUSED', 'An Explorer cannot see it');
select pg_temp.run('a1', 'select private.on_a_paid_plan()', 'REFUSED', 'Nobody signed in can call the switch directly');
select pg_temp.run('b1', $q$select count(*) from public.app_settings$q$, 'REFUSED', 'Nobody signed in can read the settings');
select pg_temp.run('b1', $q$insert into public.app_settings (key, value) values ('HOSTING_PLAN', 'paid') returning 1$q$, 'REFUSED', 'Nobody signed in can say the church pays');

insert into results (ok, label, got)
select not private.room_to_upload('00000000-0000-0000-0000-0000000a00b1'), 'Free: 250 MB of resources is past the 200 MB allowance', '';
insert into results (ok, label, got)
select private.room_to_upload('00000000-0000-0000-0000-0000000a00b2'), 'Free: 1 MB leaves room', '';
insert into results (ok, label, got)
select not private.room_for_post_media('00000000-0000-0000-0000-0000000a00b1'), 'Free: 250 MB of post photos is past the allowance', '';

-- THE PAID PLAN, by one row. Spelled loosely on purpose.
insert into public.app_settings (key, value) values ('HOSTING_PLAN', ' Paid ');
insert into results (ok, label, got)
select private.room_to_upload('00000000-0000-0000-0000-0000000a00b1'), 'Paid: the same 250 MB now has room', '';
insert into results (ok, label, got)
select private.room_for_post_media('00000000-0000-0000-0000-0000000a00b1'), 'Paid: post photos have room too', '';
select pg_temp.run('d1', $q$select public.church_space() ->> 'plan'$q$, 'paid', 'The switch says paid');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'file_limit')::bigint = 100::bigint*1024*1024*1024$q$, 'true', 'Paid shows 100 GB of files');
select pg_temp.run('d1', $q$select (public.church_space() ->> 'person_limit')::bigint = 2048::bigint*1024*1024$q$, 'true', 'Paid shows 2 GB a person');

-- Anything else is the free plan.
update public.app_settings set value = 'pro' where key = 'HOSTING_PLAN';
select pg_temp.run('d1', $q$select public.church_space() ->> 'plan'$q$, 'free', 'Any other word is the free plan');
reset role;
delete from public.app_settings where key = 'HOSTING_PLAN';
insert into results (ok, label, got)
select not private.room_to_upload('00000000-0000-0000-0000-0000000a00b1'), 'Deleting the row brings back the free allowance', '';

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 22 then raise exception 'only % checks ran; expected at least 22', total; end if;
  if failed > 0 then raise exception '% of % plan checks failed', failed, total; end if;
  raise notice 'the plan sets the allowance: % checks hold', total;
end $$;

rollback;
