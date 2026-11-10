-- An invitation can be declined, and whoever sent it is told.
--
-- ---------------------------------------------------------------------------
-- WHY (10 November 2026, the founder: "make the invitation option to have a
-- decline and if it got decline by the user, the admin will be notified that
-- the invitation got decline"). Until now an invitation could only be used or
-- ignored. Somebody who did not want to join had no way to say so, and the
-- Director who sent it saw a row waiting for ever, re-sent it, and sent the
-- person another e-mail they did not want.
--
-- WHAT HAPPENS NOW. The invitation link signs the person in, and before the
-- app opens they are asked: join, or decline. Declining
--
--   * stamps the invitation `declined_at`, so the Invitations screen shows it
--     as declined, and no "re-send all" reaches it;
--   * tells whoever sent it, in the bell. If that person has left the church
--     or is no longer approved, every approved Director and Executive
--     Director is told instead, so the news never goes nowhere;
--   * removes the account the invitation made. Sending an invitation creates
--     the account up front (supabase/functions/invite), and somebody who said
--     no should not be left holding one. It also frees the address: a leader
--     can invite them again later, and that new invitation is open again.
--
-- WHO MAY DECLINE. Only the invited person, signed in, while their invitation
-- is still open: not expired, not already declined, and before they have
-- finished signing up (chosen a password of their own). After that they are a
-- member, and leaving is a different, deliberate act. Nothing here can be done
-- to somebody else: there is no argument to name another account.
--
-- Not a link in the e-mail. A one-click "decline" address would be clicked by
-- the link checkers many mail services run on every message, declining for
-- people who never saw it. Declining takes a press of a button on the page.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

alter table public.invites
  add column if not exists declined_at timestamptz;

-- A re-sent invitation is open again. The invite function refreshes the expiry
-- of the existing row, to fourteen days from the moment a leader sends again; that is the leader deciding
-- to ask once more, so the earlier "no" no longer stands on the row (it stays
-- in the bell of whoever was told).
create or replace function private.a_resent_invitation_is_open_again()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only a later expiry is a re-send: removing a sender (invited_by nulled)
  -- or anything else leaves a "no" standing.
  if new.expires_at > old.expires_at
     and new.declined_at is not distinct from old.declined_at then
    new.declined_at := null;
  end if;
  return new;
end $$;

drop trigger if exists a_resent_invitation_is_open_again on public.invites;
create trigger a_resent_invitation_is_open_again
  before update on public.invites
  for each row execute function private.a_resent_invitation_is_open_again();

revoke all on function private.a_resent_invitation_is_open_again() from public, anon, authenticated;

-- THE INVITATION GUARD LETS A "NO" THROUGH. validate_invite_privilege() runs
-- on every update to an invitation and checks that its sender may still
-- invite. A decline is not a new invitation: if the Director who sent it has
-- since stepped down, the person must still be able to say no. So an update
-- that changes nothing but `declined_at` passes; every other check below is
-- 20260914100000's, unchanged.
create or replace function public.validate_invite_privilege()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inviter public.profiles%rowtype;
  v_guide public.profiles%rowtype;
begin
  -- The inviter has been removed and the foreign key has nulled the column.
  -- This row is a record of something that already happened.
  if TG_OP = 'UPDATE' and new.invited_by is null then
    return new;
  end if;

  -- Declined (20261110120000), and nothing else about it changed.
  if TG_OP = 'UPDATE' and (to_jsonb(new) - 'declined_at') = (to_jsonb(old) - 'declined_at') then
    return new;
  end if;

  select * into v_inviter from public.profiles where id = new.invited_by;

  if v_inviter.id is null
     or not v_inviter.is_approved
     or v_inviter.role not in ('admin', 'executive')
     or v_inviter.church_id is distinct from new.church_id then
    raise exception 'The inviter may not invite into this church' using errcode = '42501';
  end if;

  if new.role = 'executive' and v_inviter.role <> 'executive' then
    raise exception 'Only an Executive Director may appoint an Executive Director'
      using errcode = '42501';
  end if;
  if new.role = 'admin' and v_inviter.role <> 'executive' then
    raise exception 'Only an Executive Director may invite a Director' using errcode = '42501';
  end if;

  if new.recommended_by is not null then
    if new.role <> 'ds' then
      raise exception 'Only an Explorer invitation may name a Guide' using errcode = '22023';
    end if;
    select * into v_guide from public.profiles where id = new.recommended_by;
    if v_guide.id is null
       or v_guide.role <> 'dm'
       or not v_guide.is_approved
       or v_guide.church_id is distinct from new.church_id then
      raise exception 'The recommended Guide must be approved in this church' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- The signed-in person's own open invitation, if there is one: what the
-- choice on arrival names. VOLATILE, though it changes nothing, so the app
-- never answers it from a copy kept for no signal (lib/live/kept.ts): the
-- answer changes the moment the choice is made.
create or replace function public.my_open_invitation()
returns table (invite_id uuid, church_name text, role public.user_role, invited_by_name text)
language sql volatile security definer set search_path = '' as $$
  select i.id, c.name, i.role, nullif(btrim(ib.full_name), '')
    from auth.users u
    join public.profiles p on p.id = u.id
    join public.invites i
      on i.church_id = p.church_id
     and lower(btrim(i.email)) = lower(btrim(u.email))
    join public.churches c on c.id = i.church_id
    left join public.profiles ib on ib.id = i.invited_by
   where u.id = (select auth.uid())
     and p.signup_completed_at is null
     and i.declined_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1
$$;

create or replace function public.decline_my_invitation()
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv record;
  role_noun text;
  inviter_here boolean;
begin
  if me is null then
    raise exception 'Sign in with the invitation first.' using errcode = '42501';
  end if;

  select i.id, i.church_id, i.role, i.invited_by, u.email,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(i.full_name), ''), u.email) as name
    into inv
    from auth.users u
    join public.profiles p on p.id = u.id
    join public.invites i
      on i.church_id = p.church_id
     and lower(btrim(i.email)) = lower(btrim(u.email))
   where u.id = me
     and p.signup_completed_at is null
     and i.declined_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if inv.id is null then
    return false;
  end if;

  update public.invites set declined_at = now() where id = inv.id;

  role_noun := case inv.role
    when 'executive' then 'an Executive Director'
    when 'admin' then 'a Director'
    when 'dm' then 'a Guide'
    else 'an Explorer'
  end;

  -- The sender is told while they still lead this church. One who has left,
  -- or stepped down, is not: the church's Directors are told instead.
  inviter_here := exists (
    select 1 from public.profiles x
     where x.id = inv.invited_by and x.id <> me
       and x.church_id = inv.church_id and x.is_approved
       and x.role in ('admin', 'executive'));

  insert into public.notifications (user_id, type, title, body, data)
  select l.id,
         'invitation_declined',
         inv.name || ' declined the invitation',
         inv.email || ' will not be joining as ' || role_noun || '. The account the '
           || 'invitation made has been removed. If they change their mind, invite them '
           || 'again from Invitations.',
         jsonb_build_object('invite_id', inv.id)
    from public.profiles l
   where l.church_id = inv.church_id
     and l.id <> me
     and l.is_approved
     and (case when inviter_here then l.id = inv.invited_by
               else l.role in ('admin', 'executive') end);

  -- Last, so everything above is written before the account goes. The profile
  -- goes with it (on delete cascade), as remove_member_by_leader() does.
  delete from auth.users where id = me;
  return true;
end $$;

revoke all on function public.my_open_invitation() from public, anon;
revoke all on function public.decline_my_invitation() from public, anon;
grant execute on function public.my_open_invitation() to authenticated;
grant execute on function public.decline_my_invitation() to authenticated;

-- The Invitations screen learns the date, so a declined row is shown as one.
-- A function's columns cannot change in place, so it is replaced.
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
  redeemed_at timestamptz,
  declined_at timestamptz
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
    i.redeemed_at,
    i.declined_at
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

commit;
