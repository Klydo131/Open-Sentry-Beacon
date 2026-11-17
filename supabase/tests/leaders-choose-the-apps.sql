-- Leaders choose the apps on Discover; everybody in the church sees them.
--
-- Asked for on 17 November 2026: Admins and Executive Directors add the web
-- apps and other technology the church recommends, from inside the app. This
-- proves, against a database built from nothing, who may add, change, remove
-- and read them, and that the Pocket's rules (https only, no social feeds)
-- hold here too. EVERYTHING IS ROLLED BACK.
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
\set CB '00000000-0000-0000-0000-0000000aa002'
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000a00e1', 'totp', 'verified', now(), now());
insert into public.church_executives (church_id, executive_id) values (:'CA', '00000000-0000-0000-0000-0000000a00e1') on conflict do nothing;

select pg_temp.run('d1', format($q$with i as (insert into public.discover_apps (church_id, title, url, about) values (%L, 'Hope Study', 'https://hope.study/en/', 'Experience the Bible') returning 1) select count(*) from i$q$, :'CA'), '1', 'An Admin adds an app for the church');
select pg_temp.run('e1', format($q$with i as (insert into public.discover_apps (church_id, title, url, about) values (%L, 'Bible School', 'https://www.globalbibleschool.org/en', 'Free guided study') returning 1) select count(*) from i$q$, :'CA'), '1', 'An Executive Director adds one too');
select pg_temp.run('b1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Mine', 'https://example.org/a') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A Guide cannot add an app');
select pg_temp.run('a1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Mine', 'https://example.org/b') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'An Explorer cannot add an app');
select pg_temp.run('d1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Theirs', 'https://example.org/c') returning 1) select count(*) from i$q$, :'CB'), 'REFUSED', 'An Admin cannot add to another church');
select pg_temp.run('d1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Bad', 'javascript:alert(1)') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A javascript: address is refused');
select pg_temp.run('d1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Plain', 'http://example.org/d') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A plain http address is refused');
select pg_temp.run('d1', format($q$with i as (insert into public.discover_apps (church_id, title, url) values (%L, 'Feed', 'https://www.facebook.com/page') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A social feed is refused, as in the Pocket');
select pg_temp.run('a1', 'select count(*) from public.discover_apps', '2', 'Everybody in the church sees the apps');
select pg_temp.run('b1', 'select count(*) from public.discover_apps', '2', 'A Guide sees them');
select pg_temp.run('a9', 'select count(*) from public.discover_apps', '0', 'Another church sees none');
select pg_temp.run('b1', $q$with u as (update public.discover_apps set title = 'Changed' returning 1) select count(*) from u$q$, '0', 'A Guide cannot change one');
select pg_temp.run('a1', $q$with d as (delete from public.discover_apps returning 1) select count(*) from d$q$, '0', 'An Explorer cannot remove one');
select pg_temp.run('e1', $q$with u as (update public.discover_apps set about = 'Free lessons' where title = 'Hope Study' returning 1) select count(*) from u$q$, '1', 'An Executive Director edits one');
select pg_temp.run('d1', $q$with d as (delete from public.discover_apps where title = 'Bible School' returning 1) select count(*) from d$q$, '1', 'An Admin removes one');
select pg_temp.run('a1', 'select count(*) from public.discover_apps', '1', 'and it is gone for everybody');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 16 then raise exception 'only % checks ran; expected at least 16', total; end if;
  if failed > 0 then raise exception '% of % Discover app checks failed', failed, total; end if;
  raise notice 'leaders choose the apps: % checks hold', total;
end $$;

rollback;
