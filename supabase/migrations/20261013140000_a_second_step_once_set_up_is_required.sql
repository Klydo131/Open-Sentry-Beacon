-- A person who has set up two-step sign-in is let in only after both steps.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS TRUE. The app had no two-step sign-in at all. The review for the
-- Data Protection Officer (13 October 2026) found that no leader used it and
-- that the app offered no screen to set it up, and the owner asked for it to be
-- built. The sign-in service already supports it: a person adds an
-- authenticator app, and each sign-in then ends with a six-digit code. A token
-- from the password alone is marked `aal1`; a token from password and code is
-- marked `aal2`.
--
-- WHY THE DATABASE HAS TO SAY SO. The app asks for the code before it shows
-- anything, but the app is not what stands between a stolen password and the
-- church's data. The password alone still produces a valid `aal1` token, and
-- anybody holding one can call the data API directly. So the code is required
-- where the data is: one question, asked in the two places that already run on
-- every request, the same way an ended session is refused
-- (20260929130000_an_ended_session_ends_at_once):
--
--   * public.refuse_suspended_requests(), the data API's check before every
--     request, refuses a password-only token for somebody who has set up
--     two-step sign-in, with HTTP 403 (SQLSTATE PT403). The app hears it and
--     shows the code screen. lib/live/two-step.ts.
--   * private.i_am_not_suspended(), which every broadcast table and the file
--     store already require, asks the same question, so the live socket and
--     the files stop at the same point as the data API.
--
-- WHY IT CANNOT LOCK OUT ANYBODY WHO HAS NOT SET IT UP. The question is asked
-- only of a signed-in request. It lets through the signed-out role, the
-- server's own role, every `aal2` token, and every person with no VERIFIED
-- factor. A factor that was started and never confirmed with a code counts for
-- nothing, so abandoning the set-up halfway changes nothing.
--
-- WHAT A LOST PHONE MEANS. The person cannot finish signing in until the
-- project's custodian removes the factor (Supabase dashboard, Authentication,
-- the person's account, delete the factor). docs/SECURITY.md says so. That is
-- what two-step sign-in is for: a password alone is no longer enough.
--
-- WHAT IT COSTS. Nothing for an `aal2` token. For a password-only token, one
-- indexed lookup in auth.mfa_factors by user, beside the two the earlier checks
-- already make.
-- ---------------------------------------------------------------------------

begin;

create or replace function private.my_second_step_is_done()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Signed out, or the server itself: not this check's business.
    when coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then true
    -- Password and code: done.
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then true
    -- Password only: fine for anybody who has not set up a second step.
    else not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid())
        and f.status = 'verified')
  end;
$$;

-- Asked only from inside the two checks below, which run as their owner.
revoke all on function private.my_second_step_is_done() from public, anon, authenticated;

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
  -- And somebody who set up two-step sign-in has finished both steps.
  if not private.my_second_step_is_done() then
    raise exception 'Two-step sign-in is needed.'
      using errcode = 'PT403',
            hint = 'Enter the six-digit code from your authenticator app to finish signing in.';
  end if;
end;
$$;

-- RESTATED, AND IT IS NOT DECORATION. Replacing a function in `public` fires the
-- lock_new_functions event trigger, which takes EXECUTE away from the signed-out
-- role. This check runs before every request, the signed-out visitor's too, so
-- without this line every page anybody opens before signing in would fail.
grant execute on function public.refuse_suspended_requests() to anon;

create or replace function private.i_am_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- The name is older than the second and third halves. Every broadcast table
  -- and the file store require this, so a session ended elsewhere, or a
  -- password-only sign-in for somebody with two-step sign-in, stops the live
  -- socket and the files at the same moment as the data API.
  select not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.suspended_at is not null
  ) and private.my_session_is_live()
    and private.my_second_step_is_done();
$$;

commit;
