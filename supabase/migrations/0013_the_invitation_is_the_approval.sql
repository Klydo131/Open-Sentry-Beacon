-- The invitation flow, end to end: the mail, the form, and the front door.
--
-- Three things were broken between "a Director sends an invitation" and "the
-- invited person is using the app", and they are fixed together because fixing
-- any one alone still leaves a person stuck.
--
--   1. THE FORM COULD NOT ASK WHAT THE CHURCH NEEDS TO KNOW. The sign-up the
--      client specified collects a birthday, a city, what someone does, what
--      they would like to study, and — the important one — a recorded
--      permission to hold any of it. `profiles` had columns for none of that,
--      so the live form asked for a name and a password and nothing else,
--      while the demo asked the full set. Same app, two different sign-ups.
--
--   2. AN INVITED PERSON LANDED IN A WAITING ROOM. Every new account was
--      created with is_approved = false, including one created by following an
--      invitation a Director had personally addressed and sent. The Director
--      made that decision when they typed the address; asking them to make it
--      a second time, after the person has already set a password and is
--      staring at "one approval remains", is not a safeguard. It is the same
--      decision, charged twice, and the second charge is the one that loses
--      people.
--
--      THE GATE ITSELF IS NOT REMOVED, and that distinction is the whole point:
--      a sign-up with NO invitation row still lands unapproved, exactly as
--      before. That is the case the gate was built for — somebody who found the
--      sign-up page without being asked. Being invited is what changes, and
--      being invited already required an approved Director, in the right
--      church, with the right role, enforced by validate_invite_privilege in
--      0003. The approval decision has already happened upstream.
--
--   3. CONSENT WAS COLLECTED AND THROWN AWAY. The demo has recorded consent_at
--      since the form was designed. Live had nowhere to put it, which means the
--      church had no record that anyone agreed to anything.

-- ---------------------------------------------------------------------------
-- 1. The fields the client's sign-up form asks for
-- ---------------------------------------------------------------------------
-- Every one is nullable and every one is optional in the form except consent.
-- A person invited by somebody they know should be able to finish in under a
-- minute; the rest helps their Guide and can wait until they feel like typing
-- it.
--
-- `life_status`, not `status`: `status` is already a column name on pairings
-- and invites meaning something entirely different, and a third meaning of the
-- same word on the table everything joins to is how a wrong join gets written
-- one day and nobody notices.

alter table public.profiles
  add column if not exists birthday          date,
  add column if not exists gender            text,
  add column if not exists life_status       text,
  add column if not exists city_of_residence text,
  add column if not exists work_industry     text,
  add column if not exists consent_at        timestamptz;

comment on column public.profiles.consent_at is
  'When this person agreed their church may hold these details. Set once, at '
  'sign-up. Cleared when they withdraw, which also clears the details.';

-- Length caps. Not validation theatre: these columns are written by whoever
-- owns the row, they are read back into a Guide's screen, and an unbounded
-- text column that a stranger controls is a way to make somebody else's page
-- unusable. Generous enough that no honest answer hits them.
alter table public.profiles
  drop constraint if exists profiles_signup_fields_length;
alter table public.profiles
  add constraint profiles_signup_fields_length check (
    coalesce(length(gender), 0)            <= 60
    and coalesce(length(life_status), 0)   <= 60
    and coalesce(length(city_of_residence), 0) <= 120
    and coalesce(length(work_industry), 0) <= 120
  );

-- A birthday from before anyone alive was born is a typo rather than a fact,
-- and it will be read as an age by whoever sees it.
--
-- The bound is a FIXED DATE and not `current_date`, which is what this
-- constraint was first written with. Postgres refuses that outright — a CHECK
-- may only call IMMUTABLE functions, and `current_date` is STABLE — because a
-- constraint whose truth changes as the clock moves would make already-stored
-- rows retroactively invalid and break the next dump/restore. So the upper
-- bound is a far-future date that catches a fat-fingered year, and "not in the
-- future" is enforced in the form, where it belongs and where the person can
-- see what they typed.
alter table public.profiles
  drop constraint if exists profiles_birthday_plausible;
alter table public.profiles
  add constraint profiles_birthday_plausible check (
    birthday is null
    or (birthday > date '1900-01-01' and birthday < date '2100-01-01')
  );

-- ---------------------------------------------------------------------------
-- 2. Being invited is being approved
-- ---------------------------------------------------------------------------
-- Replaces the handle_new_user() of 0003. The ONLY change is the is_approved
-- value: it was the literal `false`, and it is now "true when this sign-up
-- matched a live invitation". Everything else — how the invite is found, the
-- name fallback chain, the role and church defaults, the recommended_by
-- carry-over, the redeemed_at stamp — is character for character what 0003
-- installed, deliberately, so that a future reader diffing the two files sees
-- one decision and not a rewrite.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite
  from public.invites
  where lower(btrim(email)) = lower(btrim(new.email))
    and redeemed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  insert into public.profiles (
    id, full_name, role, church_id, is_approved, recommended_by, recommended_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, ''),
    coalesce(v_invite.role, 'ds'),
    v_invite.church_id,
    -- A matched invitation is a Director's decision, already made and already
    -- authorized. No invitation, no approval — that path is unchanged.
    v_invite.id is not null,
    v_invite.recommended_by,
    case when v_invite.recommended_by is not null then now() end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.invites set redeemed_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;

-- The ACL from 0004/0010. Restated because `create or replace function` keeps
-- the old privileges, and relying on that is relying on a reader knowing it.
-- This is a trigger function: nothing should be able to call it directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Withdrawing permission
-- ---------------------------------------------------------------------------
-- The sign-up form promises:  A promise with no mechanism behind it
-- is worse than not making it, so here is the mechanism.
--
-- Clears the optional details and the consent stamp in one statement. It does
-- NOT delete the account: the person still has a Guide, a conversation and a
-- study history, and destroying those was never what was agreed to. What goes
-- is exactly what was collected under the permission being withdrawn.
--
-- security invoker, so it can only ever clear the caller's own row — a definer
-- version taking an id would be a way for anyone to wipe anyone.

create or replace function public.withdraw_my_consent()
returns void language sql security invoker set search_path to 'public' as $$
  update public.profiles set
    birthday           = null,
    gender             = null,
    life_status        = null,
    city_of_residence  = null,
    work_industry      = null,
    preferred_contact  = null,
    topics_of_interest = '{}',
    consent_at         = null
  where id = (select auth.uid());
$$;

revoke all on function public.withdraw_my_consent() from public, anon;
grant execute on function public.withdraw_my_consent() to authenticated;
