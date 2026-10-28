-- What somebody agreed to is recorded, and the church is named in the notice.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261028120000_what_was_agreed_is_recorded):
--
--   * a person records the versions they agreed to, together with the rest of
--     their profile, as the join form and the agreement step send it;
--   * when is the database's: stamped on a version change, left alone on any
--     other change, and never written by a browser;
--   * nobody records an agreement for somebody else, not even their Director;
--   * a Director writes the church's legal name, address and Data Protection
--     Officer, an Explorer cannot, and a malformed email or an overlong name
--     or address is refused;
--   * a signed-out visitor holding the church's id reads exactly what a
--     privacy notice must name, and an id that names no church reads nothing.
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
--   a1  the Director of the chapel
--   b1  an Explorer in it
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'agreement-director@example.test'),
  ('00000000-0000-0000-0000-0000000003b1', 'agreement-explorer@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000003c01', 'Agreement Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-000000003c01'::uuid,
  role = (case when right(p.id::text, 2) = 'a1' then 'admin' else 'ds' end)::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000003__';

create or replace function pg_temp.as_user(p_user text, p_role text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)
         else jsonb_build_object('sub', p_user, 'role', p_role) end::text, true);
  execute format('set local role %I', p_role);
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

-- A PERSON RECORDS WHAT THEY AGREED TO ----------------------------------------
-- The join form's update: details, the separate permission, and the versions.
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  $q$update public.profiles set full_name = 'Explorer B', consent_at = now(),
       terms_version = '2026-10-28', privacy_version = '2026-10-28'
     where id = '00000000-0000-0000-0000-0000000003b1'$q$, 'ok',
  'a person records the versions they agreed to, with the rest of their details');
select pg_temp.check((select terms_version = '2026-10-28' and privacy_version = '2026-10-28' and consent_at is not null
                        from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
  'both versions and the separate permission are kept');
select pg_temp.check((select terms_agreed_at = now() from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
  'and the database stamps when');

-- WHEN IS THE DATABASE'S ----------------------------------------------------------
-- The operator at the database dates an older agreement, as a correction would.
update public.profiles set terms_agreed_at = '2026-01-01 00:00:00+00'
 where id = '00000000-0000-0000-0000-0000000003b1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  $q$update public.profiles set preferred_contact = 'by phone' where id = '00000000-0000-0000-0000-0000000003b1'$q$, 'ok',
  'a person changes something else on their profile');
select pg_temp.check((select terms_agreed_at = '2026-01-01 00:00:00+00' from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
  'and when they agreed stays as it was');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  $q$update public.profiles set terms_agreed_at = '2020-01-01' where id = '00000000-0000-0000-0000-0000000003b1'$q$, '42501',
  'a browser cannot write when somebody agreed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  $q$update public.profiles set privacy_version = '2026-12-01' where id = '00000000-0000-0000-0000-0000000003b1'$q$, 'ok',
  'agreeing to a newer version');
select pg_temp.check((select terms_agreed_at = now() and terms_version = '2026-10-28' and privacy_version = '2026-12-01'
                        from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
  'is stamped again, by the database clock');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  format($q$update public.profiles set terms_version = %L where id = '00000000-0000-0000-0000-0000000003b1'$q$, repeat('9', 41)), '23514',
  'a version longer than any the app writes is refused');

-- NOBODY AGREES FOR SOMEBODY ELSE ----------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  $q$update public.profiles set terms_version = '2027-01-01' where id = '00000000-0000-0000-0000-0000000003b1'$q$,
  'Somebody else''s agreement is theirs to give',
  'a Director cannot record an Explorer''s agreement');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  $q$update public.profiles set is_approved = true where id = '00000000-0000-0000-0000-0000000003b1'$q$, 'ok',
  'and still approves them, as before');
select pg_temp.check((select terms_version = '2026-10-28' from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
  'the Explorer''s agreement is unchanged');

-- THE CHURCH IS NAMED BY ITS DIRECTOR ------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  $q$update public.churches set legal_name = 'Agreement Chapel, Inc.', legal_address = '1 Invented Road, Example City',
       dpo_name = 'An Invented Officer', dpo_email = 'privacy@example.test'
     where id = '00000000-0000-0000-0000-000000003c01'$q$, 'ok',
  'a Director writes the church''s legal name, address and Data Protection Officer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003b1', 'authenticated',
  $q$update public.churches set dpo_email = 'someone-else@example.test' where id = '00000000-0000-0000-0000-000000003c01'$q$, 'ok',
  'an Explorer''s attempt changes nothing (no row is theirs to update)');
select pg_temp.check((select dpo_email = 'privacy@example.test' from public.churches where id = '00000000-0000-0000-0000-000000003c01'),
  'so the officer''s email is still the Director''s');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  $q$update public.churches set dpo_email = 'not an email' where id = '00000000-0000-0000-0000-000000003c01'$q$, '23514',
  'an email that is not one is refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  format($q$update public.churches set legal_name = %L where id = '00000000-0000-0000-0000-000000003c01'$q$, repeat('n', 201)), '23514',
  'a legal name longer than 200 characters is refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  format($q$update public.churches set legal_address = %L where id = '00000000-0000-0000-0000-000000003c01'$q$, repeat('a', 301)), '23514',
  'an address longer than 300 characters is refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000003a1', 'authenticated',
  $q$update public.churches set dpo_name = '   ' where id = '00000000-0000-0000-0000-000000003c01'$q$, '23514',
  'an officer''s name of only spaces is refused');

-- READABLE BEFORE SIGN-IN, AND ONLY WHAT A NOTICE NAMES ---------------------------
create temp table seen (name text, legal_name text, legal_address text, dpo_name text, dpo_email text) on commit drop;
grant insert on seen to anon;
select pg_temp.as_user(null, 'anon',
  $q$insert into seen select * from public.church_privacy_contact('00000000-0000-0000-0000-000000003c01')$q$, 'ok',
  'a signed-out visitor asks who holds their information');
select pg_temp.check((select count(*) = 1 and bool_and(name = 'Agreement Chapel' and legal_name = 'Agreement Chapel, Inc.'
                        and legal_address = '1 Invented Road, Example City'
                        and dpo_name = 'An Invented Officer' and dpo_email = 'privacy@example.test') from seen),
  'and reads the church, its legal name and address, and its Data Protection Officer');
delete from seen;
select pg_temp.as_user(null, 'anon',
  $q$insert into seen select * from public.church_privacy_contact('00000000-0000-0000-0000-00000000dead')$q$, 'ok',
  'asking about an id that names no church');
select pg_temp.check((select count(*) = 0 from seen), 'reads nothing');
select pg_temp.check((select string_agg(p.proargnames[i], ',' order by i)
                            from pg_proc p, generate_subscripts(p.proargnames, 1) i
                           where p.oid = 'public.church_privacy_contact(uuid)'::regprocedure
                             and p.proargmodes[i] = 't') = 'name,legal_name,legal_address,dpo_name,dpo_email',
  'the answer has those five columns and no others');
select pg_temp.check(not has_function_privilege('anon', 'private.profiles_agreement_is_their_own()', 'execute')
                     and not has_function_privilege('authenticated', 'private.profiles_agreement_is_their_own()', 'execute'),
  'nobody calls the agreement trigger directly');
select pg_temp.check(not has_column_privilege('authenticated', 'public.profiles', 'terms_agreed_at', 'update'),
  'the time of agreement is not a column a signed-in person may update');

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
  if total < 26 then raise exception 'only % checks ran; expected at least 26', total; end if;
  if failed > 0 then raise exception '% of % agreement checks failed', failed, total; end if;
  raise notice 'what was agreed is recorded: % checks hold', total;
end $$;

rollback;
