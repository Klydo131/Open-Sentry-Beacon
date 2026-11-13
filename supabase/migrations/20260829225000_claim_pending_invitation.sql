-- A recovery link does not fire auth.users' INSERT trigger.
--
-- A person can have an old, unassigned Hope Beacon account and later receive
-- a real invitation. Supabase correctly sends that person a recovery email,
-- because the account already exists. The `handle_new_user` trigger therefore
-- cannot run again to copy the invitation's church and role into the profile.
-- The result was an unapproved profile with no church, invisible to the
-- Directors who should approve it.
--
-- This is deliberately not a broader profiles policy. The function can only
-- fill the current authenticated person's own profile, only while it has no
-- church and no approval, and only from an unexpired invitation addressed to
-- that account's email. It cannot change a member's existing church, promote
-- anybody, or reveal anybody else's data.

begin;

-- Keep self-service role changes locked. The single exception is a person
-- claiming the exact church and role from an active invitation addressed to
-- their own authenticated email, while their profile is still unassigned and
-- unapproved. The trigger is the boundary, so a browser cannot substitute a
-- church or role of its choosing.
create or replace function public.lock_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  caller_privileged boolean := public.is_admin() or public.is_executive();
begin
  -- SQL migrations and service-side recovery work have no end-user JWT. They
  -- are the deliberate administrative path, not a browser self-update.
  if v_user_id is null then
    return new;
  end if;

  if new.id = v_user_id then
    if new.role is distinct from old.role
       or new.is_approved is distinct from old.is_approved
       or new.church_id is distinct from old.church_id
       or new.is_head_executive is distinct from old.is_head_executive
       or new.guardian_name is distinct from old.guardian_name
       or new.guardian_consent_at is distinct from old.guardian_consent_at
       or new.guardian_consent_by is distinct from old.guardian_consent_by
       or new.guardian_member_id is distinct from old.guardian_member_id then
      if old.church_id is null
         and old.is_approved is false
         and new.is_approved is false
         and new.is_head_executive is not distinct from old.is_head_executive
         and new.guardian_name is not distinct from old.guardian_name
         and new.guardian_consent_at is not distinct from old.guardian_consent_at
         and new.guardian_consent_by is not distinct from old.guardian_consent_by
         and new.guardian_member_id is not distinct from old.guardian_member_id
         and exists (
           select 1
           from auth.users u
           join public.invites i
             on lower(btrim(i.email)) = lower(btrim(u.email))
           where u.id = v_user_id
             and i.expires_at > now()
             and i.church_id = new.church_id
             and i.role = new.role
         ) then
        return new;
      end if;

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
$fn$;

revoke all on function public.lock_privileged_profile_columns() from public, anon, authenticated;

create or replace function public.claim_my_pending_invitation()
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  with matching_invitation as (
    select i.church_id, i.role, i.recommended_by
    from auth.users u
    join public.invites i
      on lower(btrim(i.email)) = lower(btrim(u.email))
    where u.id = v_user_id
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
  )
  update public.profiles p
     set church_id = i.church_id,
         role = i.role,
         recommended_by = i.recommended_by,
         recommended_at = case when i.recommended_by is not null then now() else null end
    from matching_invitation i
   where p.id = v_user_id
     and p.church_id is null
     and p.is_approved is false;

  return found;
end;
$fn$;

revoke all on function public.claim_my_pending_invitation() from public, anon;
grant execute on function public.claim_my_pending_invitation() to authenticated;

-- Repair existing orphaned pending accounts with the exact same narrow rule.
-- At deployment time this affects the currently affected account and remains
-- safe if another account reached the same state before this migration ran.
with orphaned_pending_profiles as (
  select p.id, i.church_id, i.role, i.recommended_by
  from public.profiles p
  join auth.users u on u.id = p.id
  join lateral (
    select i.church_id, i.role, i.recommended_by
    from public.invites i
    where lower(btrim(i.email)) = lower(btrim(u.email))
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
  ) i on true
  where p.church_id is null
    and p.is_approved is false
)
update public.profiles p
   set church_id = o.church_id,
       role = o.role,
       recommended_by = o.recommended_by,
       recommended_at = case when o.recommended_by is not null then now() else null end
  from orphaned_pending_profiles o
 where p.id = o.id;

commit;
