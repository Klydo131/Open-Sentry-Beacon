-- Every minor in the church, on one screen, with their guardian if we know them.
--
-- WHY A ROSTER AND NOT JUST A BADGE. 0033 puts a MINOR badge next to a person
-- wherever a Guide or Director already happens to be looking at them. That is
-- the right thing when you are looking. It is useless for the question a
-- Director actually has to answer, which is "who are all of them, and is
-- anybody missing a consent letter?" A safeguard you can only see by visiting
-- every profile in turn is a safeguard nobody performs.
--
-- WHY THE GUARDIAN IS A REAL LINK AND NOT A NAME. 0033 stores guardian_name as
-- text, which is right for a parent who is not in the app. But when the parent
-- IS a member -- often a Guide -- a Director needs to see that, and matching
-- two rows by a typed name is how the wrong family gets connected.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: guess. Nothing here infers a parent from
-- a shared surname, a shared address or an age gap. Families do not follow
-- those rules, and a wrong guess here is a child linked to a stranger. The
-- Director records the link once, from the letter in front of them, which names
-- the parent. After that the app shows it without being asked again.

alter table public.profiles
  add column if not exists guardian_member_id uuid references public.profiles(id) on delete set null;

comment on column public.profiles.guardian_member_id is
  'The guardian''s own account, when the guardian is also a member. Recorded by '
  'a Director from the signed letter, never inferred from names.';

create index if not exists profiles_guardian_member_idx
  on public.profiles (guardian_member_id) where guardian_member_id is not null;

-- ---------------------------------------------------------------------------
-- The new column is privileged, like the rest of the guardian set.
-- ---------------------------------------------------------------------------
create or replace function public.lock_privileged_profile_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  caller_privileged boolean := public.is_admin() or public.is_executive();
begin
  if new.id = (select auth.uid()) then
    if new.role is distinct from old.role
       or new.is_approved is distinct from old.is_approved
       or new.church_id is distinct from old.church_id
       or new.is_head_executive is distinct from old.is_head_executive
       or new.guardian_name is distinct from old.guardian_name
       or new.guardian_consent_at is distinct from old.guardian_consent_at
       or new.guardian_consent_by is distinct from old.guardian_consent_by
       or new.guardian_member_id is distinct from old.guardian_member_id then
      raise exception 'You cannot change your own role, church, approval or guardian consent'
        using errcode = '42501';
    end if;
  elsif not caller_privileged then
    new.role                := old.role;
    new.is_approved         := old.is_approved;
    new.church_id           := old.church_id;
    new.is_head_executive   := old.is_head_executive;
    new.guardian_name       := old.guardian_name;
    new.guardian_consent_at := old.guardian_consent_at;
    new.guardian_consent_by := old.guardian_consent_by;
    new.guardian_member_id  := old.guardian_member_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_privileged_profile_columns on public.profiles;
create trigger lock_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.lock_privileged_profile_columns();

-- ---------------------------------------------------------------------------
-- Recording consent, now able to name the guardian's own account.
-- ---------------------------------------------------------------------------
create or replace function public.record_guardian_consent(
  p_member uuid,
  p_guardian_name text,
  p_guardian_member uuid default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  child_church uuid;
  guardian_church uuid;
  guardian_birthday date;
begin
  if not (public.is_admin() or public.is_executive()) then
    raise exception 'Only a Director or Executive Director can record guardian consent'
      using errcode = '42501';
  end if;
  if p_member = (select auth.uid()) then
    raise exception 'Somebody else has to record consent for you'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_guardian_name), '') = '' then
    raise exception 'Name the parent or guardian who signed';
  end if;

  select church_id into child_church from public.profiles where id = p_member;
  if child_church is null and not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'No such member';
  end if;

  if p_guardian_member is not null then
    -- NOBODY IS THEIR OWN GUARDIAN. Obvious, and exactly the sort of thing a
    -- form lets through at four in the afternoon.
    if p_guardian_member = p_member then
      raise exception 'Somebody cannot be their own guardian';
    end if;

    select church_id, birthday into guardian_church, guardian_birthday
      from public.profiles where id = p_guardian_member;
    if not found then
      raise exception 'That guardian is not a member here';
    end if;

    -- A CHILD CANNOT BE A GUARDIAN. Without this, a mistyped pick can record a
    -- fifteen year old as another child's responsible adult, and the roster
    -- below would then show that arrangement as settled.
    if public.is_minor(guardian_birthday) then
      raise exception 'That person is under 18 and cannot be recorded as a guardian';
    end if;

    if guardian_church is distinct from child_church then
      raise exception 'A guardian must belong to the same church';
    end if;
  end if;

  update public.profiles
     set guardian_name       = btrim(p_guardian_name),
         guardian_member_id  = p_guardian_member,
         guardian_consent_at = now(),
         guardian_consent_by = (select auth.uid())
   where id = p_member;
end;
$$;

create or replace function public.withdraw_guardian_consent(p_member uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.is_admin() or public.is_executive()) then
    raise exception 'Only a Director or Executive Director can withdraw guardian consent'
      using errcode = '42501';
  end if;
  update public.profiles
     set guardian_name       = null,
         guardian_member_id  = null,
         guardian_consent_at = null,
         guardian_consent_by = null
   where id = p_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- The roster.
-- ---------------------------------------------------------------------------
-- Leadership only, and scoped to a church they actually run. `manages_church`
-- is the existing test for that: this church's Director, or an Executive
-- Director over it. A Guide calling this gets nothing, because a Guide's
-- responsibility is the Explorers they walk with and the badge already tells
-- them that.
--
-- Ordered so the row that needs acting on is the row at the top: no consent
-- recorded first, then youngest.
create or replace function public.minors_in_church(p_church uuid default null)
returns table (
  member_id          uuid,
  full_name          text,
  role               text,
  birthday           date,
  consent_recorded   boolean,
  guardian_name      text,
  guardian_member_id uuid,
  guardian_full_name text,
  guardian_role      text,
  guardian_is_member boolean
) language sql stable security definer set search_path to 'public' as $$
  with target as (
    select coalesce(p_church, public.my_church_id()) as church_id
  )
  select
    child.id,
    child.full_name,
    child.role,
    child.birthday,
    child.guardian_consent_at is not null,
    child.guardian_name,
    child.guardian_member_id,
    guardian.full_name,
    guardian.role,
    guardian.id is not null
  from public.profiles child
  cross join target
  left join public.profiles guardian on guardian.id = child.guardian_member_id
  where child.church_id = target.church_id
    and public.manages_church(target.church_id)
    and public.is_minor(child.birthday)
  order by (child.guardian_consent_at is not null), child.birthday desc;
$$;

comment on function public.minors_in_church(uuid) is
  'Every member under 18 in a church the caller runs, with their guardian if '
  'that guardian is also a member. Consent-missing rows sort first.';

revoke all on function public.minors_in_church(uuid) from anon;
revoke all on function public.record_guardian_consent(uuid, text, uuid) from anon;
grant execute on function public.minors_in_church(uuid) to authenticated;
grant execute on function public.record_guardian_consent(uuid, text, uuid) to authenticated;

-- The two-argument form from 0033 is gone, replaced by the three-argument one
-- above. Dropping it explicitly rather than leaving both: two functions with
-- the same name and different arities is how a caller ends up silently using
-- the one that cannot record a guardian link.
drop function if exists public.record_guardian_consent(uuid, text);
