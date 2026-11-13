-- Opening a link is not signing up.
--
-- WHAT WENT WRONG, in the order it happened.
--
-- A Director sends an invitation. The Edge Function creates the account before
-- the message goes, so a row appears in auth.users immediately. The Director,
-- reasonably, copies the join link the screen hands them and opens it to check
-- it works. /join redeems it — and redeeming a link IS a sign-in, so Supabase
-- stamps last_sign_in_at on the invited person and hands that browser their
-- session. The Director is now signed in as the person they just invited, on
-- their own device, and the Invitations screen reports that person as joined.
--
-- Nobody has set a password. Nobody has filled in the form. The invited person
-- has not touched anything. Two accounts here were stamped "signed in" twelve
-- and forty-three seconds after their invitation was created, which is the
-- shape of a Director testing a link, not of somebody reading their email.
--
-- So last_sign_in_at cannot mean "joined" either. It means "this link was
-- opened, by somebody". The only honest marker is the one thing that cannot
-- happen by accident: submitting the sign-up form with a password.
--
-- There is no such marker in auth.users, and both candidates were checked
-- rather than assumed. encrypted_password is not it — every invited account
-- already carries a 60-character hash it was born with, so "has a password" is
-- true for somebody who has never chosen one. consent_at is not it either: the
-- resend path uses a recovery link, which skips the consent box, and every
-- person invited so far came through it.

alter table public.profiles
  add column if not exists signup_completed_at timestamptz;

comment on column public.profiles.signup_completed_at is
  'When this person finished the sign-up form and chose their own password. NULL means invited-but-not-arrived, however many links have been opened.';

-- Backfill only where there is proof. consent_at is stamped by submitting the
-- form, so anybody who has one finished it. Everybody else stays NULL and
-- appears in Waiting with a Re-send button — which is the true state, and the
-- one the church has been asking for.
update public.profiles
   set signup_completed_at = consent_at
 where consent_at is not null
   and signup_completed_at is null;

-- Stamped by the sign-up form itself, at the end, once the password is set.
--
-- A definer for one column rather than a widened update policy: profiles
-- already refuses self-service role changes, and the way that protection dies
-- is somebody adding a column to the set a browser may write and taking the
-- role along with it. This function can only ever touch the caller's own row
-- and only ever this one column, and coalesce keeps the first time honest.
create or replace function public.finish_my_signup()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.profiles
     set signup_completed_at = coalesce(signup_completed_at, now())
   where id = (select auth.uid());
$$;

revoke all on function public.finish_my_signup() from public, anon;
grant execute on function public.finish_my_signup() to authenticated;

-- The Invitations screen, told the truth.
--
--   has_account  an auth row exists. True for almost every invitation, because
--                sending one creates the account. Its ABSENCE is the useful
--                half: no account means the send never got that far.
--   opened_at    somebody opened the link. Not necessarily the invited person.
--   joined_at    they finished the form and chose a password. This, and only
--                this, is what "accepted" means.
--
-- Dropped rather than replaced: Postgres will not add an OUT parameter to a
-- function in place.
drop function if exists public.church_invitations();

create function public.church_invitations()
returns table (
  id           uuid,
  email        text,
  role         public.user_role,
  full_name    text,
  created_at   timestamptz,
  expires_at   timestamptz,
  has_account  boolean,
  opened_at    timestamptz,
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
    (u.id is not null)    as has_account,
    u.last_sign_in_at     as opened_at,
    p.signup_completed_at as joined_at
  from public.invites i
  left join auth.users u on lower(btrim(u.email)) = lower(btrim(i.email))
  left join public.profiles p on p.id = u.id
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

-- The duplicate check, on the same footing.
--
-- Refusing to re-invite anybody who merely HAS an account strands the one
-- person who most needs the invitation resent: their account was created by
-- the send, they never chose a password, and they cannot sign in. Refuse a
-- member; resend to a stranger who happens to have a row.
--
-- Safe to loosen. handle_new_user fires only on INSERT into auth.users and only
-- reads an invite whose redeemed_at is still null, so a second invitation can
-- never re-apply a role to an account that already exists. Verified against the
-- deployed function body rather than assumed.
drop function if exists public.member_by_email(text);

create function public.member_by_email(p_email text)
returns table (
  id            uuid,
  role          public.user_role,
  church_id     uuid,
  full_name     text,
  completed_at  timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, p.role, p.church_id, p.full_name, p.signup_completed_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = lower(btrim(p_email))
  limit 1;
$$;

-- Never a browser's to call: it answers "is this address registered?", which is
-- an account-enumeration oracle. Revoked from PUBLIC as well, because EXECUTE
-- on a new function is granted to PUBLIC by default and removing it from one
-- member of that group removes nothing.
revoke all on function public.member_by_email(text) from public, anon, authenticated;
grant execute on function public.member_by_email(text) to service_role;
