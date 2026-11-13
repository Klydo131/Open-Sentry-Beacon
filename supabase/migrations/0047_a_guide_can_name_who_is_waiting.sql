-- Two narrow windows, because a Guide can see almost nobody, and that is right.
--
-- WHAT I FOUND, AND IT IS A DELIBERATE DESIGN RATHER THAN A GAP. A Guide can
-- read exactly two profiles: their own, and the Explorer they walk with. Not
-- other Explorers, not other Guides. That is the promise the app makes and it
-- should stay.
--
-- It also makes both features in migration 0046 impossible as built:
--
--   * "ask to walk with somebody" needs the NAME of an Explorer who is
--     waiting, and you cannot ask for somebody you cannot name;
--   * the Guides' room needs the NAME beside each message, and a room where
--     every line says "Someone" is not a room.
--
-- SO THIS WIDENS WHAT A GUIDE CAN SEE, AND SAYS SO PLAINLY rather than
-- pretending otherwise. A Guide can now learn:
--
--   * that an Explorer in their church exists and is not yet walking with
--     anybody, and that person's name;
--   * the names and roles of the other Guides and Directors in their church.
--
-- WHAT IS STILL NOT VISIBLE, and this is the part that matters: no birthday,
-- no contact details, no journey stage, no messages, no prayer requests, no
-- notes. Two functions returning a name and an id, and nothing else reachable
-- through them. A Guide who asks "who needs somebody?" gets a list of names,
-- which is the smallest answer that lets them ask.
--
-- WHY FUNCTIONS RATHER THAN A WIDER POLICY. A policy widened on `profiles`
-- would widen it for every column and every query, everywhere, forever. These
-- return three fields and cannot be joined outwards.

begin;

-- ---------------------------------------------------------------------------
-- Who is waiting for a Guide
-- ---------------------------------------------------------------------------
create or replace function public.unpaired_explorers()
returns table (
  id                  uuid,
  full_name           text,
  signup_completed_at timestamptz,
  created_at          timestamptz
)
language sql stable security definer set search_path to 'public' as $fn$
  select p.id,
         coalesce(p.full_name, 'Member'),
         p.signup_completed_at,
         p.created_at
  from public.profiles p
  where p.role = 'ds'
    and p.is_approved
    and p.suspended_at is null
    and p.church_id is not null
    -- The caller's own church, and only if the caller is somebody who could
    -- act on the answer. An Explorer asking this would be reading a roster.
    and p.church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.suspended_at is null
        and me.role in ('dm', 'admin', 'executive')
    )
    and not exists (
      select 1 from public.pairings pr
      where pr.ds_id = p.id and pr.status = 'active'
    )
  order by coalesce(p.signup_completed_at, p.created_at);
$fn$;

comment on function public.unpaired_explorers() is
  'Explorers in the caller''s church with no active Guide. Names and ids only. '
  'Callable by Guides and leadership; an Explorer gets an empty set.';

revoke all on function public.unpaired_explorers() from public, anon;
grant execute on function public.unpaired_explorers() to authenticated;

-- ---------------------------------------------------------------------------
-- Who is in the Guides' room
-- ---------------------------------------------------------------------------
-- Only ever used to put a name against a message that is already readable. It
-- returns the same set of people the room already contains, so it tells a
-- caller nothing the room did not.
create or replace function public.guide_room_people()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path to 'public' as $fn$
  select p.id, coalesce(p.full_name, 'Someone'), p.role::text
  from public.profiles p
  where p.church_id = public.my_church_id()
    and p.role in ('dm', 'admin', 'executive')
    and p.is_approved
    and public.in_guide_room(public.my_church_id());
$fn$;

comment on function public.guide_room_people() is
  'Names for the Guides room, for callers who are in it. Name, id and role '
  'only; returns nothing to anybody outside the room.';

revoke all on function public.guide_room_people() from public, anon;
grant execute on function public.guide_room_people() to authenticated;

commit;

begin;

-- ---------------------------------------------------------------------------
-- The write policy had the same blind spot as the screen did.
-- ---------------------------------------------------------------------------
-- Migration 0046's `pairing_requests_write` ends with:
--
--     exists (select 1 from public.profiles them where them.id = ds_id ...)
--
-- which reads `profiles` AS THE CALLER, and a Guide cannot see the Explorer
-- they are asking about. So the check was always false and the insert was
-- always refused, for exactly the people the feature is for.
--
-- The rule itself was right and is kept: you may only ask about a real,
-- approved Explorer in your own church. It just has to be evaluated somewhere
-- that can see them. This function is that place, and it answers one question
-- with a boolean.
create or replace function public.may_ask_to_walk_with(p_ds uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles them
    where them.id = p_ds
      and them.role = 'ds'
      and them.is_approved
      and them.suspended_at is null
      and them.church_id = public.my_church_id()
  );
$$;

revoke all on function public.may_ask_to_walk_with(uuid) from public, anon;
grant execute on function public.may_ask_to_walk_with(uuid) to authenticated;

drop policy if exists pairing_requests_write on public.pairing_requests;
create policy pairing_requests_write on public.pairing_requests
  for insert to authenticated
  with check (
    guide_id = (select auth.uid())
    and church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved and me.suspended_at is null
        and me.role = 'dm'
    )
    and public.may_ask_to_walk_with(ds_id)
  );

commit;
