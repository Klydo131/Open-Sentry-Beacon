-- An invitation can be declined, and whoever sent it is told.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261110120000_an_invitation_can_be_declined):
--
--   * the invited person sees their own open invitation, and can decline it;
--   * declining stamps the invitation, tells the leader who sent it and
--     nobody else, and removes the account the invitation made;
--   * when the sender has gone, every approved Director is told instead;
--   * nobody can decline once they have finished joining, nor an expired
--     invitation, nor without one; a visitor cannot call it at all;
--   * the Invitations screen sees the date, and sending again reopens it.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant all on results to public;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   a1, a2  the chapel's Directors      b1  an Explorer already in it
--   e1      invited by a1, says no      e2  invited by somebody since gone, says no
--   f1      invited, and finished joining      c1  invited, but it expired
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0a1', 'decline-director-1@example.test'),
  ('00000000-0000-0000-0000-00000000d0a2', 'decline-director-2@example.test'),
  ('00000000-0000-0000-0000-00000000d0b1', 'decline-member@example.test'),
  ('00000000-0000-0000-0000-00000000d0e1', 'decline-says-no@example.test'),
  ('00000000-0000-0000-0000-00000000d0e2', 'decline-orphan@example.test'),
  ('00000000-0000-0000-0000-00000000d0f1', 'decline-joined@example.test'),
  ('00000000-0000-0000-0000-00000000d0c1', 'decline-expired@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000dc01', 'Decline Chapel');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-00000000dc01'::uuid,
  role = (case when right(p.id::text, 2) in ('a1', 'a2') then 'admin' else 'ds' end)::user_role,
  is_approved = true,
  signup_completed_at = case when right(p.id::text, 2) in ('a1', 'a2', 'b1', 'f1') then now() end
 where p.id::text like '00000000-0000-0000-0000-00000000d0__';

insert into public.invites (church_id, email, role, full_name, invited_by, expires_at) values
  ('00000000-0000-0000-0000-00000000dc01', 'decline-says-no@example.test', 'ds', 'Person e1',
   '00000000-0000-0000-0000-00000000d0a1', now() + interval '14 days'),
  ('00000000-0000-0000-0000-00000000dc01', 'decline-orphan@example.test', 'ds', 'Person e2',
   '00000000-0000-0000-0000-00000000d0a2', now() + interval '14 days'),
  ('00000000-0000-0000-0000-00000000dc01', 'decline-joined@example.test', 'ds', 'Person f1',
   '00000000-0000-0000-0000-00000000d0a1', now() + interval '14 days'),
  ('00000000-0000-0000-0000-00000000dc01', 'decline-expired@example.test', 'ds', 'Person g1',
   '00000000-0000-0000-0000-00000000d0a1', now() - interval '1 day');

-- e2's sender is removed later: the foreign key nulls the column, as here.
update public.invites set invited_by = null where email = 'decline-orphan@example.test';

-- A sender who has since stepped down must not stop a "no": b2 is made a
-- Director, sends d1's invitation, and then is no longer one.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0b2', 'decline-stepped-down@example.test'),
  ('00000000-0000-0000-0000-00000000d0d1', 'decline-after-stepdown@example.test');
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = '00000000-0000-0000-0000-00000000dc01'::uuid,
  role = (case when right(p.id::text, 2) = 'b2' then 'admin' else 'ds' end)::user_role,
  is_approved = true,
  signup_completed_at = case when right(p.id::text, 2) = 'b2' then now() end
 where p.id in ('00000000-0000-0000-0000-00000000d0b2', '00000000-0000-0000-0000-00000000d0d1');
insert into public.invites (church_id, email, role, full_name, invited_by, expires_at) values
  ('00000000-0000-0000-0000-00000000dc01', 'decline-after-stepdown@example.test', 'ds', 'Person d1',
   '00000000-0000-0000-0000-00000000d0b2', now() + interval '14 days');
update public.profiles set role = 'dm' where id = '00000000-0000-0000-0000-00000000d0b2';

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

-- What a signed-in call returned, kept outside the call so it can be checked.
create temp table answers (who text, answer text) on commit drop;
grant all on answers to public;

-- SEEING ONE'S OWN INVITATION ---------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0e1', 'authenticated',
  $q$ insert into answers select 'e1-open', church_name || '|' || role || '|' || coalesce(invited_by_name, '')
        from public.my_open_invitation() $q$,
  'ok', 'the invited person can ask about their own invitation');
select pg_temp.check(
  (select answer = 'Decline Chapel|ds|Person a1' from answers where who = 'e1-open'),
  'and it names the church, the role and who sent it');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0f1', 'authenticated',
  $q$ insert into answers select 'f1-open', church_name from public.my_open_invitation() $q$,
  'ok', 'somebody who has finished joining may ask too');
select pg_temp.check(
  (select count(*) = 0 from answers where who = 'f1-open'),
  'but has no open invitation to be asked about');

-- WHO MAY NOT DECLINE -----------------------------------------------------------
select pg_temp.as_user(null, 'anon',
  $q$ select public.decline_my_invitation() $q$,
  '42501', 'a visitor cannot decline anything');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0f1', 'authenticated',
  $q$ insert into answers select 'f1', public.decline_my_invitation()::text $q$,
  'ok', 'somebody who finished joining is answered');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0c1', 'authenticated',
  $q$ insert into answers select 'g1', public.decline_my_invitation()::text $q$,
  'ok', 'so is somebody whose invitation expired');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0b1', 'authenticated',
  $q$ insert into answers select 'b1', public.decline_my_invitation()::text $q$,
  'ok', 'and a member with no invitation at all');
select pg_temp.check(
  (select array_agg(answer order by who) = array['false', 'false', 'false'] from answers where who in ('b1', 'f1', 'g1')),
  'but none of the three can decline');
select pg_temp.check(
  (select count(*) = 3 from auth.users where id in (
     '00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0c1')),
  'and none of their accounts was touched');

-- DECLINING ---------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0e1', 'authenticated',
  $q$ insert into answers select 'e1', public.decline_my_invitation()::text $q$,
  'ok', 'the invited person declines');
select pg_temp.check((select answer = 'true' from answers where who = 'e1'), 'and is told it worked');
select pg_temp.check(
  (select declined_at is not null from public.invites where email = 'decline-says-no@example.test'),
  'the invitation is stamped declined');
select pg_temp.check(
  (select count(*) = 1 from public.notifications
    where user_id = '00000000-0000-0000-0000-00000000d0a1' and type = 'invitation_declined'
      and title = 'Person e1 declined the invitation'
      and body like 'decline-says-no@example.test will not be joining as an Explorer.%'),
  'the Director who sent it is told, by name, in words');
select pg_temp.check(
  (select count(*) = 0 from public.notifications
    where user_id = '00000000-0000-0000-0000-00000000d0a2' and type = 'invitation_declined'),
  'and the other Director, who did not send it, is not');
select pg_temp.check(
  (select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000d0e1')
  and (select count(*) = 0 from public.profiles where id = '00000000-0000-0000-0000-00000000d0e1'),
  'the account the invitation made is gone, profile and all');

select pg_temp.as_user('00000000-0000-0000-0000-00000000d0e2', 'authenticated',
  $q$ insert into answers select 'e2', public.decline_my_invitation()::text $q$,
  'ok', 'somebody whose inviter has gone declines too');
select pg_temp.check(
  (select count(distinct user_id) = 2 from public.notifications
    where type = 'invitation_declined' and title = 'Person e2 declined the invitation'
      and user_id in ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0a2'))
  and (select count(*) = 0 from public.notifications
    where type = 'invitation_declined' and user_id = '00000000-0000-0000-0000-00000000d0b1'),
  'and every Director is told instead, but not the Explorers');

select pg_temp.as_user('00000000-0000-0000-0000-00000000d0d1', 'authenticated',
  $q$ insert into answers select 'd1', public.decline_my_invitation()::text $q$,
  'ok', 'a person whose sender has since stepped down can still decline');
select pg_temp.check(
  (select answer = 'true' from answers where who = 'd1')
  and (select declined_at is not null from public.invites where email = 'decline-after-stepdown@example.test'),
  'and it is recorded');
select pg_temp.check(
  (select count(*) = 2 from public.notifications
    where type = 'invitation_declined' and title = 'Person d1 declined the invitation')
  and (select count(*) = 0 from public.notifications
    where type = 'invitation_declined' and user_id = '00000000-0000-0000-0000-00000000d0b2'),
  'and the Directors are told, not the sender who is no longer one');
do $$
begin
  update public.invites set role = 'admin' where email = 'decline-after-stepdown@example.test';
  insert into results values (false, 'the guard still refuses any other change to that invitation');
exception when others then
  insert into results values (sqlerrm like 'The inviter may not invite%', 'the guard still refuses any other change to that invitation');
end $$;

-- WHAT THE LEADERS SEE, AND ASKING AGAIN -------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000d0a1', 'authenticated',
  $q$ insert into answers select 'list', count(*)::text from public.church_invitations() where declined_at is not null $q$,
  'ok', 'a Director lists the invitations');
select pg_temp.check((select answer = '3' from answers where who = 'list'),
  'and sees the three declined ones as declined');
-- What the invite function does on Re-send: refresh the expiry of the same row
-- to fourteen days from then. A re-send comes later than the invitation; inside
-- this one transaction now() does not move, so the minute stands for "later".
update public.invites set expires_at = now() + interval '14 days' + interval '1 minute'
 where email = 'decline-says-no@example.test';
select pg_temp.check(
  (select declined_at is not null from public.invites where email = 'decline-orphan@example.test'),
  'and only that one: the others still say declined');
select pg_temp.check(
  (select declined_at is null from public.invites where email = 'decline-says-no@example.test'),
  'sending again opens the invitation again');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 20 then raise exception 'only % checks ran; expected at least 20', total; end if;
  if failed > 0 then raise exception '% of % declining checks failed', failed, total; end if;
  raise notice 'an invitation can be declined: % checks hold', total;
end $$;

rollback;
