-- Under 18: a badge that cannot be taken off, and consent that a Director saw.
--
-- WHY THIS IS NOT ONE COLUMN. Two different facts get confused here, and they
-- have different lifetimes:
--
--   1. IS THIS PERSON A MINOR. Derived from their birthday, every time it is
--      asked. NOT stored, and deliberately so: a stored boolean is correct on
--      the day a Director ticks it and silently wrong on the person's
--      eighteenth birthday. Nothing would ever tell anybody it had gone stale.
--      Safeguarding controls that quietly become false are worse than none,
--      because people trust them.
--
--   2. DID A PARENT CONSENT, AND WHO CHECKED. A fact about an event that
--      happened once. It is stored, with who recorded it and when, because it
--      is the thing somebody may have to answer for later.
--
-- THE SIGNED LETTER ITSELF IS NOT STORED HERE. It names a child and carries a
-- parent's signature, and this database is read by the app on every device in
-- the congregation. It stays in the church's own files, with the Directors, and
-- what lives here is the record that one was seen.

alter table public.profiles
  add column if not exists guardian_name              text,
  add column if not exists guardian_consent_at        timestamptz,
  add column if not exists guardian_consent_by        uuid references public.profiles(id) on delete set null;

comment on column public.profiles.guardian_name is
  'The parent or guardian who signed. Recorded by a Director, never by the person.';
comment on column public.profiles.guardian_consent_at is
  'When a Director confirmed they had seen a signed consent letter. Null means '
  'no letter has been recorded, which for somebody under 18 is a thing to fix.';
comment on column public.profiles.guardian_consent_by is
  'Which Director recorded it. Kept so the question "who checked?" has an answer.';

alter table public.profiles
  drop constraint if exists profiles_guardian_name_length;
alter table public.profiles
  add constraint profiles_guardian_name_length check (
    coalesce(length(guardian_name), 0) <= 120
  );

-- ---------------------------------------------------------------------------
-- Is this person under 18, asked fresh every time.
-- ---------------------------------------------------------------------------
-- STABLE, not IMMUTABLE, because the answer depends on today's date. That is
-- also why this cannot be a generated column or a CHECK constraint: Postgres
-- allows only IMMUTABLE functions there, and it is right to, since a stored
-- answer to this question goes wrong on a birthday.
--
-- A null birthday returns false rather than true. Somebody who has not filled
-- the field in is not thereby a child, and treating them as one would put a
-- MINOR badge on adults who skipped a question.
create or replace function public.is_minor(p_birthday date)
returns boolean language sql stable set search_path to 'public' as $$
  select p_birthday is not null
     and p_birthday > (current_date - interval '18 years');
$$;

comment on function public.is_minor(date) is
  'True when the birthday is less than 18 years ago. Computed, never stored: a '
  'stored answer is wrong from the morning of the eighteenth birthday onwards.';

-- ---------------------------------------------------------------------------
-- Nobody records their own guardian consent.
-- ---------------------------------------------------------------------------
-- The existing trigger already refuses a self-edit of role, church, approval
-- and head-executive, and pins those columns for callers who are not
-- leadership. The guardian columns belong in exactly that set and for exactly
-- the same reason: the whole value of the record is that somebody OTHER than
-- the applicant checked the letter.
--
-- A fifteen year old who can tick their own consent box has a consent box, not
-- a safeguard.
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
       or new.guardian_consent_by is distinct from old.guardian_consent_by then
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
  end if;
  return new;
end;
$$;

drop trigger if exists lock_privileged_profile_columns on public.profiles;
create trigger lock_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.lock_privileged_profile_columns();

-- ---------------------------------------------------------------------------
-- A Director records the letter.
-- ---------------------------------------------------------------------------
create or replace function public.record_guardian_consent(
  p_member uuid,
  p_guardian_name text
) returns void language plpgsql security definer set search_path to 'public' as $$
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

  update public.profiles
     set guardian_name       = btrim(p_guardian_name),
         guardian_consent_at = now(),
         guardian_consent_by = (select auth.uid())
   where id = p_member;

  if not found then
    raise exception 'No such member';
  end if;
end;
$$;

-- Withdrawing it is a real action too. A parent can change their mind, and an
-- app that only records "yes" is an app that cannot record that.
create or replace function public.withdraw_guardian_consent(p_member uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.is_admin() or public.is_executive()) then
    raise exception 'Only a Director or Executive Director can withdraw guardian consent'
      using errcode = '42501';
  end if;
  update public.profiles
     set guardian_name       = null,
         guardian_consent_at = null,
         guardian_consent_by = null
   where id = p_member;
end;
$$;

-- Closed to anonymous callers, like everything else here. Migration 0031
-- installed an event trigger that revokes new functions from anon; these are
-- named explicitly so the intent is on the page rather than inferred.
revoke all on function public.is_minor(date) from anon;
revoke all on function public.record_guardian_consent(uuid, text) from anon;
revoke all on function public.withdraw_guardian_consent(uuid) from anon;
grant execute on function public.is_minor(date) to authenticated;
grant execute on function public.record_guardian_consent(uuid, text) to authenticated;
grant execute on function public.withdraw_guardian_consent(uuid) to authenticated;
