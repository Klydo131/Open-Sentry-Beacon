-- Somebody who has set up two-step sign-in is let in only after both steps.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261013140000_a_second_step_once_set_up_is_required):
--
--   * a password-only sign-in (`aal1`) is refused by the data API's check
--     before every request, and by the check the live socket and the file
--     store require, once the person has a CONFIRMED authenticator app;
--   * the same person with password and code (`aal2`) is let through;
--   * a person with no authenticator app, or one they never confirmed, is let
--     through on the password alone, exactly as before;
--   * the signed-out visitor and the server's own role are let through;
--   * a suspension and an ended session are still refused first, in their own
--     words, so nothing earlier was loosened;
--   * nobody signed in can ask the new question directly.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon, service_role;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   a  has a confirmed authenticator app
--   b  has no authenticator app
--   c  started setting one up and never confirmed it
--   d  has a confirmed authenticator app and is suspended
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'two-step-confirmed@example.test'),
  ('00000000-0000-0000-0000-0000000002b1', 'two-step-none@example.test'),
  ('00000000-0000-0000-0000-0000000002c1', 'two-step-unconfirmed@example.test'),
  ('00000000-0000-0000-0000-0000000002d1', 'two-step-suspended@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-000000002c01', 'Two Step Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-000000002c01'::uuid,
  role = 'ds'::user_role,
  is_approved = true,
  suspended_at = case when right(p.id::text, 2) = 'd1' then now() else null end
 where p.id::text like '00000000-0000-0000-0000-0000000002__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000f2a1', '00000000-0000-0000-0000-0000000002a1', 'totp', 'verified', now(), now()),
  ('00000000-0000-0000-0000-00000000f2c1', '00000000-0000-0000-0000-0000000002c1', 'totp', 'unverified', now(), now()),
  ('00000000-0000-0000-0000-00000000f2d1', '00000000-0000-0000-0000-0000000002d1', 'totp', 'verified', now(), now());
-- A live session for a, so the ended-session check has something to find.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-00000000a5a1', '00000000-0000-0000-0000-0000000002a1');

-- Run something with these claims, as this database role; record whether it
-- was refused as expected (by SQLSTATE or by words in the message).
create or replace function pg_temp.as_claims(p_claims jsonb, p_role text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
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

-- The value of a yes/no question asked with these claims.
create or replace function pg_temp.answer(p_claims jsonb, p_role text, p_sql text)
returns boolean language plpgsql as $$
declare v boolean;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute format('set local role %I', p_role);
  execute p_sql into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

-- THE DATA API'S CHECK BEFORE EVERY REQUEST ----------------------------------
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal1"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'PT403',
  'a confirmed authenticator app: the password alone is refused');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'Two-step sign-in is needed',
  'a confirmed authenticator app: a token that names no level is refused too');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal2"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'ok',
  'a confirmed authenticator app: password and code are let through');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal2","session_id":"00000000-0000-0000-0000-00000000a5a1"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'ok',
  'a confirmed authenticator app: password and code in a live session are let through');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002b1","role":"authenticated","aal":"aal1"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'ok',
  'no authenticator app: the password alone is let through, as before');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002c1","role":"authenticated","aal":"aal1"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'ok',
  'an authenticator app never confirmed: the password alone is let through');
select pg_temp.as_claims('{"role":"anon"}', 'anon',
  'select public.refuse_suspended_requests()', 'ok',
  'the signed-out visitor is let through');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"service_role"}', 'service_role',
  'select public.refuse_suspended_requests()', 'ok',
  'the server''s own role is let through');

-- NOTHING EARLIER WAS LOOSENED --------------------------------------------------
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002d1","role":"authenticated","aal":"aal2"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'This account is suspended',
  'suspended, with password and code: still refused as suspended');
select pg_temp.as_claims('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal2","session_id":"00000000-0000-0000-0000-00000000dead"}', 'authenticated',
  'select public.refuse_suspended_requests()', 'PT401',
  'an ended session, with password and code: still refused as ended');

-- THE LIVE SOCKET AND THE FILE STORE ASK THE SAME ----------------------------
select pg_temp.check(not pg_temp.answer('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal1"}', 'authenticated',
  'select private.i_am_not_suspended()'),
  'the socket and file check refuses the password alone for a confirmed app');
select pg_temp.check(pg_temp.answer('{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated","aal":"aal2"}', 'authenticated',
  'select private.i_am_not_suspended()'),
  'the socket and file check lets password and code through');
select pg_temp.check(pg_temp.answer('{"sub":"00000000-0000-0000-0000-0000000002b1","role":"authenticated","aal":"aal1"}', 'authenticated',
  'select private.i_am_not_suspended()'),
  'the socket and file check lets the password through with no app');

-- THE QUESTION ITSELF IS NOT OPEN ----------------------------------------------
select pg_temp.check(not has_function_privilege('authenticated', 'private.my_second_step_is_done()', 'execute'),
  'a signed-in person cannot ask the two-step question directly');
select pg_temp.check(not has_function_privilege('anon', 'private.my_second_step_is_done()', 'execute'),
  'a signed-out visitor cannot ask the two-step question directly');
select pg_temp.check(has_function_privilege('anon', 'public.refuse_suspended_requests()', 'execute'),
  'the signed-out visitor can still run the check before every request');

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
  if total < 16 then raise exception 'only % checks ran; expected at least 16', total; end if;
  if failed > 0 then raise exception '% of % two-step checks failed', failed, total; end if;
  raise notice 'a second step once set up is required: % checks hold', total;
end $$;

rollback;
