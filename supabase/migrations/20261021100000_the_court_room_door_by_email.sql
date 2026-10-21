-- The court room's door can take a code sent by email, when a project chooses.
--
-- ---------------------------------------------------------------------------
-- WHY. 20261020160000 opened the court room to leadership only with a code
-- from an authenticator app. On 21 October 2026 the owner could not get an
-- authenticator app to work on their live project after three tries, so no
-- Director could enter the court room and no judge could be drawn. They asked
-- for email verification instead, and for a project built from this code to
-- choose its own.
--
-- THE CHOICE IS THE PROJECT'S. One row in public.app_settings, which only the
-- service role can read or write (0014_mail_settings_fallback):
--
--     COURT_DOOR_METHOD = 'email'           a code sent to the leader's email
--     anything else, or no row at all       an authenticator app (as before)
--
-- Nothing changes for a project that does not add the row.
--
-- WHAT EMAIL TRADES AWAY, said once and plainly: with 'email', whoever can
-- read a leader's email can open the court room, because the same inbox can
-- also reset the password. An authenticator app does not have that weakness.
-- A leader who has an authenticator app is still asked for its code, which
-- is the stronger proof.
--
-- HOW IT WORKS.
--   1. The leader asks for a code. supabase/functions/door-code checks who is
--      asking, calls court_email_code_issue (service role only) for their
--      user AND their sign-in session, and emails the six digits. The digits
--      are never returned to a browser; only a salted hash is stored.
--   2. They type it. court_email_code_prove checks it against that same
--      session: ten minutes to use it, five tries, used once.
--   3. The door is open for court_pass_minutes() from that moment, for that
--      session only. Signing out ends the session, and the pass with it.
--
-- Also replaced, each as before apart from the email way in:
--   private.court_pass_until   (as 20261020180000)
--   public.court_door          (as 20261020180000; says 'email' when asked)
--   private.court_judge_pool   (as 20261020200000; with 'email', every
--                               leader can open the door, so every leader can
--                               be drawn)
-- ---------------------------------------------------------------------------

begin;

/** How this project's leaders open the court room: 'email' or 'authenticator'. */
create or replace function private.court_door_method()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(trim(coalesce(
           (select s.value from public.app_settings s where s.key = 'COURT_DOOR_METHOD'), '')))
         = 'email' then 'email'
    else 'authenticator'
  end;
$$;

-- ------------------------------------------------------------ the codes ----

create table if not exists private.court_email_codes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  salt       text not null,
  code_hash  text not null,
  tries      integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

/** When each code was sent, so nobody's inbox can be flooded. */
create table if not exists private.court_email_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists court_email_sends_by_user on private.court_email_sends (user_id, sent_at);

/** A session that proved an emailed code, and when. */
create table if not exists private.court_email_passes (
  session_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  proven_at  timestamptz not null default now()
);

revoke all on private.court_email_codes, private.court_email_sends, private.court_email_passes
  from public, anon, authenticated;

create or replace function private.court_email_code_hash(p_salt text, p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(p_salt || ':' || p_code, 'sha256'), 'hex') $$;

/**
 * Make a new code for this person's session, and return it to the function
 * that emails it. For the service role only: a browser that could call this
 * would read the code without the email.
 */
create or replace function public.court_email_code_issue(p_user uuid, p_session uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_salt text;
begin
  if private.court_door_method() <> 'email' then
    raise exception 'This project opens the court room with an authenticator app, not email.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_user and p.is_approved and p.suspended_at is null
       and p.role in ('admin', 'executive')) then
    raise exception 'Only a Director or an Executive Director is sent a code for the court room.'
      using errcode = '42501';
  end if;
  if exists (select 1 from auth.mfa_factors f
              where f.user_id = p_user and f.status::text = 'verified') then
    raise exception 'This account has an authenticator app. Type the code from it instead.'
      using errcode = '42501';
  end if;
  if p_session is null or not exists (
    select 1 from auth.sessions s
     where s.id = p_session and s.user_id = p_user
       and (s.not_after is null or s.not_after > now())) then
    raise exception 'This sign-in has ended. Sign in again.' using errcode = '42501';
  end if;

  -- Old codes, old passes and old sends are kept no longer than they are useful.
  delete from private.court_email_codes where created_at < now() - interval '1 day';
  delete from private.court_email_passes where proven_at < now() - interval '1 day';
  delete from private.court_email_sends where sent_at < now() - interval '1 day';

  if exists (select 1 from private.court_email_sends
              where user_id = p_user and sent_at > now() - interval '30 seconds') then
    raise exception 'A code was sent a moment ago. Wait half a minute, then ask again.'
      using errcode = 'P0001';
  end if;
  if (select count(*) from private.court_email_sends
       where user_id = p_user and sent_at > now() - interval '1 hour') >= 5 then
    raise exception 'Five codes have been sent in the last hour. Wait a while, then ask again.'
      using errcode = 'P0001';
  end if;

  -- Six digits from the server's strong random source (gen_random_uuid uses
  -- it; the first 32 bits of a version-4 id are all random).
  v_code := lpad((('x' || left(replace(gen_random_uuid()::text, '-', ''), 8))::bit(32)::bigint
                  % 1000000)::text, 6, '0');
  v_salt := replace(gen_random_uuid()::text, '-', '');

  insert into private.court_email_codes (user_id, session_id, salt, code_hash)
  values (p_user, p_session, v_salt, private.court_email_code_hash(v_salt, v_code))
  on conflict (user_id, session_id) do update
     set salt = excluded.salt, code_hash = excluded.code_hash, tries = 0, created_at = now();
  insert into private.court_email_sends (user_id) values (p_user);
  return v_code;
end;
$$;

/**
 * Prove the emailed code for the session this request is signed in with.
 * Answers {ok, left} rather than raising on a wrong code, so the count of
 * tries is kept (a raise would roll it back).
 */
create or replace function public.court_email_code_prove(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_session uuid;
  v_digits  text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  v_row     private.court_email_codes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'session_id', '') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'This sign-in cannot take an emailed code. Sign out, sign in again, and ask for a new code.'
      using errcode = '42501';
  end if;
  v_session := (auth.jwt() ->> 'session_id')::uuid;
  if v_digits !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'shape');
  end if;

  select * into v_row from private.court_email_codes
   where user_id = v_user and session_id = v_session
   for update;
  if v_row.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'none');
  end if;
  if v_row.created_at < now() - interval '10 minutes' then
    delete from private.court_email_codes where user_id = v_user and session_id = v_session;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if private.court_email_code_hash(v_row.salt, v_digits) <> v_row.code_hash then
    if v_row.tries + 1 >= 5 then
      delete from private.court_email_codes where user_id = v_user and session_id = v_session;
      return jsonb_build_object('ok', false, 'reason', 'spent');
    end if;
    update private.court_email_codes set tries = tries + 1
     where user_id = v_user and session_id = v_session;
    return jsonb_build_object('ok', false, 'reason', 'wrong', 'left', 4 - v_row.tries);
  end if;

  delete from private.court_email_codes where user_id = v_user and session_id = v_session;
  insert into private.court_email_passes (session_id, user_id, proven_at)
  values (v_session, v_user, now())
  on conflict (session_id) do update set user_id = excluded.user_id, proven_at = now();
  return jsonb_build_object('ok', true, 'until', now() + make_interval(mins => private.court_pass_minutes()));
end;
$$;

-- ------------------------------------------------------------- the door ----

/**
 * When the caller's pass to the court room runs out. As 20261020180000, and
 * where the project has chosen email, a leader's pass may also be an emailed
 * code proved for this very session (court_email_code_prove). An
 * authenticator app's code still counts wherever the person has one.
 */
create or replace function private.court_pass_until()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims    jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  leader    boolean;
  suspended boolean;
  leave_end timestamptz;
  latest    bigint;
  by_email  timestamptz;
  pass_end  timestamptz;
begin
  if coalesce(claims ->> 'role', '') <> 'authenticated' or (select auth.uid()) is null then
    return null;
  end if;

  select p.role in ('admin', 'executive') and p.suspended_at is null,
         p.suspended_at is not null
    into leader, suspended
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_approved;
  if leader is null then
    return null;
  end if;

  if suspended then
    leave_end := private.court_leave_ends();
    if leave_end is null then
      return null;
    end if;
  end if;

  if leader and private.court_door_method() = 'email'
     and coalesce(claims ->> 'session_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select ep.proven_at into by_email
      from private.court_email_passes ep
      join auth.sessions s on s.id = ep.session_id and s.user_id = ep.user_id
     where ep.session_id = (claims ->> 'session_id')::uuid
       and ep.user_id = (select auth.uid())
       and (s.not_after is null or s.not_after > now());
  end if;

  if not leader or coalesce(claims ->> 'aal', '') = 'aal2' then
    select max((e ->> 'timestamp')::bigint) into latest
      from jsonb_array_elements(
             case when jsonb_typeof(claims -> 'amr') = 'array'
                  then claims -> 'amr' else '[]'::jsonb end) as e
     where coalesce(e ->> 'timestamp', '') ~ '^[0-9]{1,12}$'
       and (not leader or e ->> 'method' = 'totp');
  end if;

  if latest is null and by_email is null then
    return null;
  end if;
  pass_end := greatest(to_timestamp(latest), by_email)
              + make_interval(mins => private.court_pass_minutes());
  if suspended then
    pass_end := least(pass_end, leave_end);
  end if;
  return pass_end;
end;
$$;

/**
 * What the door needs from this person. As 20261020180000, and it says how
 * this project's leaders open it ('method'). A leader without an
 * authenticator app, where the project has chosen email, needs 'email'.
 */
create or replace function public.court_door()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me        public.profiles%rowtype;
  until_    timestamptz := private.court_pass_until();
  two_step  boolean;
  open_     boolean;
  leave_on  uuid := private.court_leave_case();
  suspended boolean;
  method    text := private.court_door_method();
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    return jsonb_build_object('open', false, 'needs', 'sign_in');
  end if;
  suspended := me.suspended_at is not null;
  two_step := exists (
    select 1 from auth.mfa_factors f
     where f.user_id = me.id and f.status::text = 'verified');
  open_ := coalesce(until_ > now(), false);
  return jsonb_build_object(
    'open',      open_,
    'until',     until_,
    'minutes',   private.court_pass_minutes(),
    'leader',    me.role in ('admin', 'executive') and not suspended,
    'two_step',  two_step,
    'method',    method,
    'suspended', suspended,
    'leave',     case when leave_on is null then null
                      else jsonb_build_object('case', leave_on, 'until', private.court_leave_ends()) end,
    'me',        jsonb_build_object('id', me.id, 'name', coalesce(me.full_name, ''), 'role', me.role),
    'needs', case
      when open_ then null
      when suspended and leave_on is null then 'suspended'
      when me.role in ('admin', 'executive') and not suspended and two_step then 'code'
      when me.role in ('admin', 'executive') and not suspended and method = 'email' then 'email'
      when me.role in ('admin', 'executive') and not suspended then 'two_step'
      when two_step then 'code'
      else 'password'
    end);
end;
$$;

/**
 * Who is free to judge this case. As 20261020200000, except that where the
 * project has chosen email every leader can open the door, so having an
 * authenticator app is no longer what makes a leader free to be drawn.
 */
create or replace function private.court_judge_pool(p_trial uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select tr.*, coalesce(
             (select p.role::text from public.profiles p where p.id = tr.subject_id),
             tr.subject_role) in ('admin', 'executive') as about_lead
      from public.trials tr where tr.id = p_trial
  )
  select coalesce(array_agg(p.id order by p.id::text collate "C"), '{}'::uuid[])
    from public.profiles p, t
   where p.is_approved
     and p.suspended_at is null
     and p.id is distinct from t.subject_id
     and (private.court_door_method() = 'email'
          or exists (select 1 from auth.mfa_factors f
                      where f.user_id = p.id and f.status::text = 'verified'))
     and not exists (select 1 from public.trial_parties tp
                      where tp.trial_id = t.id and tp.person_id = p.id
                        and tp.part in ('accused', 'reporter', 'witness'))
     and not exists (select 1 from public.court_record r
                      where r.trial_id = t.id and r.act = 'judge_stepped_down'
                        and r.actor_id = p.id)
     and (
       (not coalesce(t.about_lead, false) and p.role = 'admin' and p.church_id = t.church_id)
       or (coalesce(t.about_lead, false) and p.role = 'executive'
           and (p.church_id = t.church_id
                or exists (select 1 from public.church_executives ce
                            where ce.executive_id = p.id and ce.church_id = t.church_id)))
     );
$$;

-- --------------------------------------------------------------- grants ----

revoke all on function private.court_door_method()                  from public, anon, authenticated;
revoke all on function private.court_email_code_hash(text, text)    from public, anon, authenticated;
revoke all on function public.court_email_code_issue(uuid, uuid)    from public, anon, authenticated;
revoke all on function public.court_email_code_prove(text)          from public, anon;
revoke all on function public.court_door()                          from public, anon;
grant execute on function public.court_email_code_issue(uuid, uuid) to service_role;
grant execute on function public.court_email_code_prove(text)       to authenticated;
grant execute on function public.court_door()                       to authenticated;

commit;
