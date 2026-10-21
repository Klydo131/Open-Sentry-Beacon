-- The court room's door by email, where a project chooses it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261021100000_the_court_room_door_by_email):
--
--   UNCHANGED     with no COURT_DOOR_METHOD row, nothing changes: a leader
--                 without an authenticator app is asked to set one up, and
--                 no code can be sent.
--   THE CODE      only the service role can make one; only for an approved,
--                 unsuspended leader with no authenticator app, for one of
--                 their own live sessions; not twice in half a minute nor
--                 more than five times an hour; a browser can read neither
--                 the code nor its hash.
--   PROVING IT    for the session it was sent for and no other; a wrong code
--                 counts, five wrong codes spend it; ten minutes to use it;
--                 used once.
--   THE PASS      opens the door for that session only, ends with the
--                 session, and ends if the project goes back to
--                 authenticator apps.
--   THE DRAW      every leader can be drawn, and a leader with an
--                 authenticator app is still asked for its code.
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
create temp table kept (k text primary key, v text) on commit drop;
grant all on kept to authenticated, anon, service_role;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   cc31 Email Chapel
--   d1  Director, no authenticator app      (brings the case)
--   d2  Director, no authenticator app
--   d3  Director, suspended
--   d5  Director WITH an authenticator app
--   a1  Guide (the case is about them)      a2  Guide (raised it)
-- Each has one live session, s<name>; d1 has a second, d1x (another phone).
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000cc31', 'Email Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000c0' || s)::uuid, 'door-' || s || '@example.test'
  from unnest(array['d1', 'd2', 'd3', 'd5', 'a1', 'a2']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-00000000cc31',
  role = case left(right(p.id::text, 2), 1) when 'd' then 'admin' else 'dm' end::user_role,
  is_approved = true,
  suspended_at = case when right(p.id::text, 2) = 'd3' then now() end
 where p.id::text like '00000000-0000-0000-0000-00000000c0__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000c0d5', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
select ('00000000-0000-0000-0000-0000000005' || s)::uuid,
       ('00000000-0000-0000-0000-00000000c0' || left(s, 2))::uuid, now(), now()
  from unnest(array['d1', 'd2', 'd3', 'd5', 'a1', 'a2']) s;
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000d1f', '00000000-0000-0000-0000-00000000c0d1', now(), now());

create or replace function pg_temp.id(p_short text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000c0' || p_short)::uuid
$$;
create or replace function pg_temp.sess(p_short text) returns uuid language sql as $$
  select case when p_short = 'd1x' then '00000000-0000-0000-0000-000000000d1f'::uuid
              else ('00000000-0000-0000-0000-0000000005' || left(p_short, 2))::uuid end
$$;

/**
 * Signed in with a password a minute ago, on their session ('d1x': d1 on
 * another phone). 'd5' has also typed its app's code; 'd5p' is d5 with the
 * password only. 'a2o': a2 signed in an hour ago.
 */
create or replace function pg_temp.who(p_short text) returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', pg_temp.id(left(p_short, 2)),
    'role', 'authenticated',
    'session_id', pg_temp.sess(p_short),
    'aal', case when p_short = 'd5' then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object(
             'method', case when p_short = 'd5' then 'totp' else 'password' end,
             'timestamp', floor(extract(epoch from now())
                                - case when p_short = 'a2o' then 3600 else 60 end)::bigint)));
$$;

create or replace function pg_temp.as_role(p_role text, p_claims jsonb, p_sql text, p_expect text, p_label text, p_keep text default null)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := ''; v_out text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_out;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if p_keep is not null and v_state = 'ok' then
    insert into kept values (p_keep, v_out) on conflict (k) do update set v = excluded.v;
  end if;
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

create or replace function pg_temp.answer(p_short text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', pg_temp.who(p_short)::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create or replace function pg_temp.issue(p_short text, p_session text, p_label text, p_expect text default 'ok', p_keep text default null)
returns void language sql as $$
  select pg_temp.as_role('service_role', null,
    format('select public.court_email_code_issue(%L, %L)', pg_temp.id(left(p_short, 2)), pg_temp.sess(p_session)),
    p_expect, p_label, p_keep);
$$;

create or replace function pg_temp.prove(p_short text, p_code text) returns jsonb language sql as $$
  select pg_temp.answer(p_short, format('select public.court_email_code_prove(%L)::text', p_code))::jsonb
$$;
create or replace function pg_temp.door(p_short text) returns jsonb language sql as $$
  select pg_temp.answer(p_short, 'select public.court_door()::text')::jsonb
$$;
create or replace function pg_temp.k(p_key text) returns text language sql as $$
  select v from kept where k = p_key
$$;
/** A six-digit code that is not this one. */
create or replace function pg_temp.other(p_code text) returns text language sql as $$
  select lpad(((p_code::integer + 1) % 1000000)::text, 6, '0')
$$;
create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

-- UNCHANGED --------------------------------------------------------------------------
delete from public.app_settings where key = 'COURT_DOOR_METHOD';
select pg_temp.check(pg_temp.door('d1') ->> 'needs' = 'two_step' and pg_temp.door('d1') ->> 'method' = 'authenticator',
  'with no setting, a leader without an authenticator app is asked to set one up, as before');
select pg_temp.issue('d1', 'd1', 'and no code is sent', 'authenticator app, not email');

insert into public.app_settings (key, value) values ('COURT_DOOR_METHOD', ' Email ');

-- THE CODE ---------------------------------------------------------------------------
select pg_temp.check(pg_temp.door('d1') ->> 'needs' = 'email' and pg_temp.door('d1') ->> 'method' = 'email',
  'with COURT_DOOR_METHOD = email, a leader without an authenticator app is asked for an emailed code');
select pg_temp.check(pg_temp.door('d5p') ->> 'needs' = 'code',
  'a leader with an authenticator app is still asked for its code, the stronger proof');
select pg_temp.issue('d5', 'd5', 'and is sent no emailed code in its place', 'authenticator app');
select pg_temp.check(pg_temp.door('d5') ->> 'open' = 'true',
  'and their app''s code still opens the door');
select pg_temp.check(pg_temp.door('a2o') ->> 'needs' = 'password',
  'somebody who is not a leader is asked for their password, as before');

select pg_temp.as_role('authenticated', pg_temp.who('d1'),
  format('select public.court_email_code_issue(%L, %L)', pg_temp.id('d1'), pg_temp.sess('d1')),
  'permission denied', 'a browser cannot make a code (it would read it without the email)');
select pg_temp.as_role('authenticated', pg_temp.who('d1'),
  'select count(*)::text from private.court_email_codes', 'permission denied',
  'nor read the codes or their hashes');
select pg_temp.as_role('anon', null,
  format('select public.court_email_code_issue(%L, %L)', pg_temp.id('d1'), pg_temp.sess('d1')),
  'permission denied', 'nor can somebody signed out');

select pg_temp.issue('a1', 'a1', 'a Guide is sent no code', 'Only a Director');
select pg_temp.issue('d3', 'd3', 'a suspended Director is sent no code', 'Only a Director');
select pg_temp.as_role('service_role', null,
  format('select public.court_email_code_issue(%L, %L)', pg_temp.id('d1'), pg_temp.sess('d2')),
  'sign-in has ended', 'nor is a code made for somebody else''s session');

select pg_temp.issue('d1', 'd1', 'a Director is sent a code', 'ok', 'C1');
select pg_temp.check(pg_temp.k('C1') ~ '^[0-9]{6}$', 'and it is six digits');
select pg_temp.check((select code_hash <> pg_temp.k('C1') and length(salt) = 32
                        from private.court_email_codes where user_id = pg_temp.id('d1')),
  'only a salted hash of it is kept');
select pg_temp.issue('d1', 'd1', 'not twice in half a minute', 'moment ago');

-- PROVING IT -------------------------------------------------------------------------
select pg_temp.check(pg_temp.prove('d1x', pg_temp.k('C1')) ->> 'reason' = 'none',
  'the right code typed on another phone signed in as the same person does not count');
select pg_temp.check(pg_temp.door('d1') ->> 'open' = 'false', 'nothing opens the door before the code');
select pg_temp.check(pg_temp.prove('d1', pg_temp.other(pg_temp.k('C1'))) @> '{"ok": false, "reason": "wrong", "left": 4}',
  'a wrong code is refused, and says how many tries are left');
select pg_temp.check((select tries from private.court_email_codes where user_id = pg_temp.id('d1')) = 1,
  'and the try is counted, not rolled back');
select pg_temp.check(pg_temp.prove('d1', 'abc') ->> 'reason' = 'shape', 'something that is not six digits is not a try');
select pg_temp.check(pg_temp.prove('d1', ' ' || left(pg_temp.k('C1'), 3) || ' ' || right(pg_temp.k('C1'), 3)) ->> 'ok' = 'true',
  'the right code opens it, spaces and all');

-- THE PASS ---------------------------------------------------------------------------
select pg_temp.check(pg_temp.door('d1') ->> 'open' = 'true', 'the door is open for that session');
select pg_temp.check(pg_temp.door('d1x') ->> 'open' = 'false', 'and for no other session of the same person');
select pg_temp.check(pg_temp.prove('d1', pg_temp.k('C1')) ->> 'reason' = 'none', 'the code works once');

-- THE DRAW ---------------------------------------------------------------------------
select pg_temp.as_role('authenticated', pg_temp.who('d1'),
  format($q$select public.open_trial(%L, 'Invented case about a1', null, %L)::text$q$, pg_temp.id('a1'), pg_temp.id('a2')),
  'ok', 'a Director with an emailed code opens a case', 'T');
select pg_temp.check((select right(head_judge_id::text, 2) from public.trials where id = pg_temp.k('T')::uuid) in ('d2', 'd5'),
  'its judge is drawn from every free Director, with or without an authenticator app; never the suspended one');

-- MORE ABOUT THE CODE ----------------------------------------------------------------
update private.court_email_sends set sent_at = sent_at - interval '1 minute';
select pg_temp.issue('d2', 'd2', 'another Director is sent a code', 'ok', 'C2');
select pg_temp.check(pg_temp.prove('d2', pg_temp.other(pg_temp.k('C2'))) ->> 'left' = '4', 'wrong, 4 left');
select pg_temp.prove('d2', pg_temp.other(pg_temp.k('C2'))), pg_temp.prove('d2', pg_temp.other(pg_temp.k('C2'))),
       pg_temp.prove('d2', pg_temp.other(pg_temp.k('C2')));
select pg_temp.check(pg_temp.prove('d2', pg_temp.other(pg_temp.k('C2'))) ->> 'reason' = 'spent',
  'the fifth wrong code spends it');
select pg_temp.check(pg_temp.prove('d2', pg_temp.k('C2')) ->> 'reason' = 'none', 'after which even the right one does not work');

update private.court_email_sends set sent_at = sent_at - interval '1 minute';
select pg_temp.issue('d2', 'd2', 'a new code is sent', 'ok', 'C3');
update private.court_email_codes set created_at = now() - interval '11 minutes' where user_id = pg_temp.id('d2');
select pg_temp.check(pg_temp.prove('d2', pg_temp.k('C3')) ->> 'reason' = 'expired', 'a code is good for ten minutes');

update private.court_email_sends set sent_at = sent_at - interval '1 minute';
insert into private.court_email_sends (user_id, sent_at)
select pg_temp.id('d2'), now() - interval '10 minutes' from generate_series(1, 2);
select pg_temp.issue('d2', 'd2', 'a fifth code in an hour is sent');
update private.court_email_sends set sent_at = sent_at - interval '1 minute';
select pg_temp.issue('d2', 'd2', 'a sixth is not', 'Five codes');

-- THE PASS ENDS ----------------------------------------------------------------------
delete from public.app_settings where key = 'COURT_DOOR_METHOD';
select pg_temp.check(pg_temp.door('d1') ->> 'open' = 'false',
  'going back to authenticator apps closes the door to an emailed code at once');
insert into public.app_settings (key, value) values ('COURT_DOOR_METHOD', 'email');
select pg_temp.check(pg_temp.door('d1') ->> 'open' = 'true', '(and choosing email again opens it)');
delete from auth.sessions where id = pg_temp.sess('d1');
select pg_temp.check(pg_temp.door('d1') ->> 'open' = 'false', 'signing out ends the pass with the session');

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
  if total < 30 then raise exception 'only % checks ran; expected at least 30', total; end if;
  if failed > 0 then raise exception '% of % door-by-email checks failed', failed, total; end if;
  raise notice 'the court room door by email: % checks', total;
end $$;

rollback;
