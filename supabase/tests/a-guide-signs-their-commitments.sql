-- A Guide signs their commitments, and leaders see who has (20261116130000).
--
-- WHAT THIS PROVES, against a database built from nothing:
--   * a Guide signs with their own full name (case and spaces forgiven), and
--     with any other name is refused;
--   * an Explorer and a visitor cannot sign;
--   * a Guide reads only their own signature; a Director reads the church's;
--     a leader of another church reads none;
--   * nobody can write, change or delete a signature directly.
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant all on results to public;
create temp table answers (who text, answer text) on commit drop;
grant all on answers to public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0dd1', 'commit-guide@example.test'),
  ('00000000-0000-0000-0000-0000000c0dd2', 'commit-guide-two@example.test'),
  ('00000000-0000-0000-0000-0000000c0de1', 'commit-explorer@example.test'),
  ('00000000-0000-0000-0000-0000000c0da1', 'commit-director@example.test'),
  ('00000000-0000-0000-0000-0000000c0da2', 'commit-other-director@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000c0dc1', 'Commit Chapel'),
  ('00000000-0000-0000-0000-0000000c0dc2', 'Other Chapel');
update public.profiles p set
  full_name = case right(p.id::text, 2) when 'd1' then 'Grace Mae Guide' when 'd2' then 'Gil Guide'
                when 'e1' then 'Ezra Explorer' when 'a1' then 'Dana Director' else 'Otto Other' end,
  church_id = (case when right(p.id::text, 2) = 'a2' then '00000000-0000-0000-0000-0000000c0dc2'
                    else '00000000-0000-0000-0000-0000000c0dc1' end)::uuid,
  role = (case right(p.id::text, 2) when 'd1' then 'dm' when 'd2' then 'dm' when 'e1' then 'ds' else 'admin' end)::user_role,
  is_approved = true, signup_completed_at = now()
 where p.id::text like '00000000-0000-0000-0000-0000000c0d__';

create or replace function pg_temp.as_user(p_user text, p_role text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)
         else jsonb_build_object('sub', p_user, 'role', p_role) end::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; exception when others then v_state := sqlstate; v_msg := sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;
create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin insert into results values (coalesce(p_cond, false), p_label); end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ select public.sign_guide_commitments('guide-2026-11', 'Somebody Else') $q$, 'exactly as it appears', 'a Guide cannot sign with another name');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ select public.sign_guide_commitments('guide-2026-11', '  grace   MAE guide ') $q$, 'ok', 'a Guide signs with their own name, case and spaces forgiven');
select pg_temp.check((select count(*) = 1 from public.guide_commitments where user_id = '00000000-0000-0000-0000-0000000c0dd1'), 'one signature is kept');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ select public.sign_guide_commitments('guide-2026-11', 'Grace Mae Guide') $q$, 'ok', 'signing again renews it');
select pg_temp.check((select count(*) = 1 from public.guide_commitments where user_id = '00000000-0000-0000-0000-0000000c0dd1'), 'and renewing does not make a second row');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ select public.sign_guide_commitments('Not A Version!', 'Grace Mae Guide') $q$, 'not a version', 'a made-up version is refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0de1', 'authenticated',
  $q$ select public.sign_guide_commitments('guide-2026-11', 'Ezra Explorer') $q$, '42501', 'an Explorer cannot sign the Guide commitments');
select pg_temp.as_user(null, 'anon',
  $q$ select public.sign_guide_commitments('guide-2026-11', 'x') $q$, '42501', 'a visitor cannot sign');

-- READING
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd2', 'authenticated',
  $q$ insert into answers select 'd2', count(*)::text from public.guide_commitments $q$, 'ok', 'another Guide asks');
select pg_temp.check((select answer from answers where who = 'd2') = '0', 'a Guide cannot see anybody else''s signature');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ insert into answers select 'd1', count(*)::text from public.guide_commitments $q$, 'ok', 'the Guide asks');
select pg_temp.check((select answer from answers where who = 'd1') = '1', 'a Guide sees their own');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0da1', 'authenticated',
  $q$ insert into answers select 'a1', count(*)::text from public.guide_commitments $q$, 'ok', 'the Director asks');
select pg_temp.check((select answer from answers where who = 'a1') = '1', 'the church''s Director sees who has signed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0da2', 'authenticated',
  $q$ insert into answers select 'a2', count(*)::text from public.guide_commitments $q$, 'ok', 'another church''s Director asks');
select pg_temp.check((select answer from answers where who = 'a2') = '0', 'a Director of another church sees none');

-- NO WAY AROUND THE FUNCTION
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd2', 'authenticated',
  $q$ insert into public.guide_commitments (user_id, church_id, version, signed_name) values ('00000000-0000-0000-0000-0000000c0dd2', '00000000-0000-0000-0000-0000000c0dc1', 'guide-2026-11', 'Gil Guide') $q$,
  '42501', 'nobody writes a signature directly');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0dd1', 'authenticated',
  $q$ update public.guide_commitments set signed_at = now() - interval '5 years' $q$, '42501', 'nobody can change a signature');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0da1', 'authenticated',
  $q$ delete from public.guide_commitments $q$, '42501', 'not even a Director can delete one');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 15 then raise exception 'only % checks ran; expected at least 15', total; end if;
  if failed > 0 then raise exception '% of % commitment checks failed', failed, total; end if;
  raise notice 'a Guide signs their commitments: % checks hold', total;
end $$;

rollback;
