-- Somebody who has signed in has joined, and their password is theirs to keep.
--
-- ---------------------------------------------------------------------------
-- REPORTED TWICE IN ONE BREATH:
--
--   1. Addresses already in the system still appeared in the re-send list.
--
--   2. Once a person had used their account, the password from the invitation
--      could still be changed as if they had never joined.
--
-- Both are the same fault, and it is one column.
--
-- WHAT "JOINED" MEANT, AND WHY IT STOPPED BEING TRUE. `signup_completed_at` is
-- stamped by the sign-up form, at the moment somebody chooses their own
-- password. That was the last step of the old one-time-link flow, so it was a
-- perfectly good test of "this person is really here".
--
-- The invitation carries a PASSWORD now. The account is created before the
-- message leaves, the person signs in at /login with the address and password
-- in the e-mail, and they never see the sign-up form at all. Nothing stamps the
-- column. So the app has been asking a question that the current design can no
-- longer answer, and taking silence for "not here yet".
--
-- So people who have signed in, with no signup_completed_at, are using the
-- app and are still sitting on the Director's re-send list.
--
-- WHY THE SECOND REPORT IS THE SERIOUS ONE. The Re-send button beside those
-- rows calls the invite function, and that function refuses an address that has
-- already joined -- by reading exactly this column. For those people it reads
-- null, so the refusal never fires, and a re-send REPLACES THE PASSWORD on the
-- account of somebody already using it. If they had changed it to one of their
-- own, that is gone, and the first they learn of it is being locked out. A
-- Director tidying up their list by pressing Re-send would do that to all
-- of them.
--
-- The comment in the invite function says "NOBODY'S WORKING PASSWORD IS EVER
-- OVERWRITTEN. An address that has finished signing up is refused far above
-- this point". That was true when it was written. The flow moved underneath it.
--
-- THE ANSWER IS ALREADY IN THE DATABASE. `auth.users.last_sign_in_at` is the
-- thing the old column was standing in for: it is set the moment somebody
-- actually gets in, whichever door they used. Note that church_invitations was
-- ALREADY reading it -- and reporting it as `opened_at`, drawn on screen as
-- "link opened, no password set yet". The app knew these people had signed in
-- and said the opposite.
--
-- NOTHING IS REWRITTEN. Both functions coalesce rather than backfilling, so
-- signup_completed_at keeps meaning exactly what it says and no stored row is
-- given a value it did not earn.
-- ---------------------------------------------------------------------------

begin;

-- Used by the Invitations screen. `joined_at` decides whether somebody is still
-- waiting, so this is what takes them off the re-send list.
create or replace function public.church_invitations()
returns table (
  id uuid, email text, role user_role, full_name text,
  created_at timestamptz, expires_at timestamptz,
  has_account boolean, opened_at timestamptz, joined_at timestamptz
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
    (u.id is not null) as has_account,
    u.last_sign_in_at  as opened_at,
    -- SIGNING IN IS JOINING. The old column still counts when it is there, so
    -- anybody who came through the sign-up form is unaffected.
    coalesce(p.signup_completed_at, u.last_sign_in_at) as joined_at
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

-- Used by the invite edge function, and the only thing standing between a
-- re-send and somebody's working password. Same rule, so the screen and the
-- send can never disagree about who is already a member.
create or replace function public.member_by_email(p_email text)
returns table (
  id uuid, role user_role, church_id uuid, full_name text, completed_at timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, p.role, p.church_id, p.full_name,
         coalesce(p.signup_completed_at, u.last_sign_in_at)
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = lower(btrim(p_email))
  limit 1;
$$;

commit;
