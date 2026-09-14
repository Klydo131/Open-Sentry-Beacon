-- An invitation whose account has since been removed must stop offering to send.
--
-- REPORTED FROM THE SCREEN, with a photograph of two rows: "I can still see the
-- e-mails that I sent here that should have been disappeared because they where
-- part of the system before and now they are deleted. If the e-mail is part of
-- the system of the app, the re-send should be gone please."
--
-- WHAT THE ROW SAID, AND WHY ALL OF IT WAS WRONG. Both rows read
-- "invited 7 days ago - never sent" and offered Re-send. Neither part was true.
-- The invitation had been sent, the person had joined, and their account was
-- later deleted. The screen could not tell, because it was reading the absence
-- of an auth row -- and a deleted account and an account that was never created
-- are the same absence.
--
-- WHY THIS IS NOT A TIDINESS FIX. Sending an invitation CREATES the account
-- (see supabase/functions/invite: "the account is created here, with a password
-- already on it"). So Re-send on one of these rows does not resend anything --
-- it RE-CREATES the account of somebody who was removed from this church,
-- silently, from a row that told the Director nothing had ever happened. If a
-- person was removed for a safeguarding reason, that is the readmission of
-- somebody a leader decided to remove, performed by a button labelled as a
-- retry.
--
-- THE SIGNAL, AND THE TWO EARLIER ANSWERS IT MUST NOT REPEAT. components/
-- LiveChurchPages.tsx carries the scar: twice, redeemed_at was used ALONE to
-- mean "this person has joined", and twice that was wrong, because redeemed_at
-- is stamped when the account row is created -- the moment Send is pressed.
-- People who had never opened their email were filed under Accepted and left
-- with no Re-send button.
--
-- That is not what is used here. The distinguishing pair is redeemed_at AND the
-- absence of an account, which is not ambiguous in either direction:
--
--   redeemed_at null,     no account  -> the send never got as far as making
--                                        one. Genuinely never sent; Re-send is
--                                        exactly right and is left alone.
--   redeemed_at present,  no account  -> an account WAS made and is now gone.
--                                        Somebody removed it.
--
-- redeemed_at still says nothing about whether anybody arrived, and this does
-- not ask it to. Joined is still decided by signup_completed_at, untouched.
--
-- The column was already on the table and simply never returned to the browser,
-- so the screen had no way to draw the distinction even though the database had
-- recorded it all along.

begin;

drop function if exists public.church_invitations();

create function public.church_invitations()
returns table (
  id          uuid,
  email       text,
  role        user_role,
  full_name   text,
  created_at  timestamptz,
  expires_at  timestamptz,
  has_account boolean,
  opened_at   timestamptz,
  joined_at   timestamptz,
  redeemed_at timestamptz
)
language sql
stable
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
    (u.id is not null) as has_account,
    u.last_sign_in_at  as opened_at,
    coalesce(p.signup_completed_at, u.last_sign_in_at) as joined_at,
    i.redeemed_at
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

-- The authorisation lives inside the body, as before; these grants only decide
-- who may ask. Revoke first so a re-run cannot widen what an earlier one set.
revoke all on function public.church_invitations() from public, anon;
grant execute on function public.church_invitations() to authenticated;

commit;
