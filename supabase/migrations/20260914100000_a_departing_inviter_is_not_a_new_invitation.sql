-- A departing inviter is not an invitation being made.
--
-- REPORTED AS: "Why can't I delete this 2 accounts? It's some kind of bug" --
-- and then, when the permission was questioned, "but I am the head ED, so I
-- must have the privilage to delete an ED or Director."
--
-- THE PRIVILEGE WAS NEVER THE PROBLEM, and that is worth recording because it
-- is where the search would naturally start. discipline_check() was asked, as
-- the Head Executive Director, about both Directors on screen. It answered
-- 'ok' for both. The refusal came from much further down.
--
-- WHAT ACTUALLY HAPPENED. remove_member_by_leader() ends with
-- `delete from auth.users`. That cascades to the person's profile, and
-- invites.invited_by is ON DELETE SET NULL -- so the database rewrites every
-- invitation that person ever sent. That rewrite is an UPDATE, and
-- validate_invite_privilege fires BEFORE INSERT OR UPDATE. It then looked up
-- the inviter it had just been told was gone, found nobody, and raised
-- 'The inviter may not invite into this church'. The raise aborted the
-- enclosing delete.
--
-- So ANY Director who had ever sent an invitation could never be removed. Both
-- of this church's Directors had. From the Director's side, Delete did nothing
-- at all: no error reached the screen, because the failure was a database
-- exception inside a function whose verdict the app reads as a string.
--
-- THE FIX. There is no privilege left to check on a historical row. The
-- question this trigger exists to ask is whether somebody MAY invite, and
-- nobody is inviting when a foreign key nulls a column on the way out. INSERT
-- stays strict, so an invitation still cannot be created without a valid
-- inviter.
--
-- SWEPT FOR THE SAME SHAPE ELSEWHERE: nine foreign keys into profiles or
-- churches are ON DELETE SET NULL and land on a table with a BEFORE UPDATE
-- trigger that can raise. This was the only one that actually bites.
-- lock_privileged_profile_columns raises only on a SELF edit, which a cascade
-- never is, and keep_guide_plans_unpublished raises only when publishing with
-- active shares, which a nulled author cannot cause.
--
-- Verified against the live database as the Head Executive Director, inside a
-- transaction that rolled back: both removals returned 'ok' and the profile
-- count fell, then every row was restored.

begin;

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

commit;
