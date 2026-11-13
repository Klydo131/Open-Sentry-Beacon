-- What "accepted" actually means.
--
-- invites.redeemed_at is stamped by handle_new_user, which runs when the AUTH
-- USER ROW is created — and that happens the moment the invitation is sent,
-- because generateLink and inviteUserByEmail both create the account up front.
-- So redeemed_at has always meant "an account exists for this address", never
-- "this person has joined".
--
-- The Invitations screen read it as the latter and filed people under Accepted,
-- "joined today", seconds after the Director pressed Send. Somebody who never
-- opened their email, never set a password and never signed in appeared as a
-- member of the church — with no Re-send button, because the screen believed
-- there was nothing left to do. That is the worst shape a bug can take: it
-- hides the very person who needs chasing.
--
-- SECURITY DEFINER because last_sign_in_at lives in auth.users, which no
-- browser-side policy can read. Everything the definer buys is spent inside the
-- function: no arguments, the church read from the caller's own profile, and
-- nothing returned unless that caller is an approved admin or executive of it.
--
-- NOTE: migration 0018 corrects this again. last_sign_in_at turned out to be
-- stamped by OPENING the link, which the Director does themselves to check it
-- works — so it was wrong in the same direction, just less so.

create or replace function public.church_invitations()
returns table (
  id           uuid,
  email        text,
  role         public.user_role,
  full_name    text,
  created_at   timestamptz,
  expires_at   timestamptz,
  has_account  boolean,
  joined_at    timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select
    i.id,
    i.email,
    i.role,
    i.full_name,
    i.created_at,
    i.expires_at,
    (u.id is not null)  as has_account,
    u.last_sign_in_at   as joined_at
  from public.invites i
  left join auth.users u on lower(btrim(u.email)) = lower(btrim(i.email))
  where i.church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive')
        and me.church_id = i.church_id
    )
  order by i.created_at desc;
$$;

revoke all on function public.church_invitations() from public, anon;
grant execute on function public.church_invitations() to authenticated;

-- The same correction for the duplicate-invitation check.
--
-- member_by_email (0016) refuses to invite somebody who is already a member.
-- Without knowing whether they ever signed in, that refusal also blocks the one
-- person who most needs re-inviting: somebody whose account was created by an
-- invitation that never arrived, and who therefore has a row, no password and
-- no way in. Returning the sign-in lets the invite function refuse a real
-- member and resend to a stranded one.
--
-- Dropped rather than replaced: Postgres will not change a function's OUT
-- parameters in place, and the alternative — a second function under a longer
-- name — leaves two nearly identical definers to keep in step.
drop function if exists public.member_by_email(text);

create function public.member_by_email(p_email text)
returns table (
  id           uuid,
  role         public.user_role,
  church_id    uuid,
  full_name    text,
  last_sign_in timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, p.role, p.church_id, p.full_name, u.last_sign_in_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = lower(btrim(p_email))
  limit 1;
$$;

-- Revoked from PUBLIC as well as anon and authenticated: EXECUTE on a new
-- function is granted to PUBLIC by default, and a function answering "is this
-- address registered?" is an enumeration oracle in any browser's hands.
revoke all on function public.member_by_email(text) from public, anon, authenticated;
grant execute on function public.member_by_email(text) to service_role;
