-- An ended session is refused at once, not up to an hour later.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS TRUE. Signing out everywhere else, choosing a password, and an
-- invitation's week running out all delete the session on the server, so no
-- device can RENEW its sign-in. But the pass a device already held (an access
-- token, good for an hour) kept working until it expired: the data API, the
-- live socket and the file store check that a token is genuine and unexpired,
-- not that its session still exists. docs/SECURITY.md said so under "What is
-- not protected", and the owner asked, on 29 September 2026, for what could be
-- improved to be improved.
--
-- WHAT THIS DOES. One question, asked in one place: is the session this request
-- came with still on record? private.my_session_is_live() answers it, and the
-- two checks that already run on every request ask it too:
--
--   * public.refuse_suspended_requests(), the data API's check before every
--     request, now refuses an ended session with HTTP 401 (SQLSTATE PT401,
--     which the data API turns into that status). The app hears the 401 and
--     asks the sign-in server once whether the session stands; the server
--     refuses, and the device shows the front door. lib/supabase/client.ts.
--   * private.i_am_not_suspended(), which every broadcast table and the file
--     store already require through their restrictive rule, now also requires
--     a live session. So the live socket and the file store stop at the same
--     moment, with no rule rewritten.
--
-- WHY IT CANNOT LOCK EVERYBODY OUT. It is decided only for a signed-in request
-- that carries a session id. The signed-out role, the server's own role, and a
-- token without a well-formed session id are let through exactly as before. A
-- signed-in request is refused only when its session is gone from auth.sessions
-- or past that session's own end, which is when the sign-in server itself would
-- refuse to renew it.
--
-- WHAT IT COSTS. One primary-key lookup per statement, beside the one the
-- suspension check already makes.
--
-- RUN AGAINST THE LIVE DATABASE FIRST, in a transaction that was thrown away:
-- a live session was let through and saw its church; the same person with an
-- ended session was refused with PT401 and saw no rows; a token with no session
-- id was let through; the signed-out role was let through once its grant was
-- restored (see the grant below, which that run is why this file has).
-- ---------------------------------------------------------------------------

begin;

create or replace function private.my_session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Signed out, or the server itself: not this check's business.
    when coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then true
    -- No session id, or not one that could be: let through, as before.
    when coalesce(auth.jwt() ->> 'session_id', '') !~ '^[0-9a-fA-F-]{36}$' then true
    else exists (
      select 1 from auth.sessions s
      where s.id = (auth.jwt() ->> 'session_id')::uuid
        and (s.not_after is null or s.not_after > now()))
  end;
$$;

-- Asked only from inside the two checks below, which run as their owner.
revoke all on function private.my_session_is_live() from public, anon, authenticated;

create or replace function public.refuse_suspended_requests()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Signed out (no uid) or not suspended: carry on. This runs before EVERY
  -- request, so it does one indexed lookup and nothing else.
  if exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.suspended_at is not null
  ) then
    raise exception 'This account is suspended.'
      using errcode = '42501',
            hint = 'A leader has suspended this account. Sign-in is closed until they lift it.';
  end if;
  -- And a session that has been ended is ended now, not when its pass expires.
  if not private.my_session_is_live() then
    raise exception 'This sign-in has ended.'
      using errcode = 'PT401',
            hint = 'It was signed out, or its password was changed. Sign in again.';
  end if;
end;
$$;

-- RESTATED, AND IT IS NOT DECORATION. Replacing a function in `public` fires the
-- lock_new_functions event trigger, which takes EXECUTE away from the signed-out
-- role. This check runs before every request, the signed-out visitor's too, so
-- without this line every page anybody opens before signing in would fail. The
-- dry run above found it.
grant execute on function public.refuse_suspended_requests() to anon;

create or replace function private.i_am_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- The name is older than the second half. Every broadcast table and the
  -- file store require this, so a session ended elsewhere stops the live
  -- socket and the files at the same moment as the data API.
  select not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.suspended_at is not null
  ) and private.my_session_is_live();
$$;

commit;
