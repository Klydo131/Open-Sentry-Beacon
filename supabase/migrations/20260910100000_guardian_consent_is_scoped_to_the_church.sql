-- Guardian consent is a Director's power over THEIR OWN church, not every one.
--
-- ---------------------------------------------------------------------------
-- WHAT THE AUDIT FOUND.
-- ---------------------------------------------------------------------------
--
-- This app has two families of authorisation helper and they are not
-- interchangeable:
--
--   is_admin() / is_executive()          the caller's ROLE. No church.
--   leads_church(c) / manages_church(c)  the caller's role AND that church.
--
-- Both guardian-consent functions used the first. They take a member id and
-- change that member's guardian record, so the check needed to be the second:
-- as written, a Director of one church could record or withdraw guardian
-- consent for a minor in ANOTHER church. These are the two most safeguarding-
-- sensitive functions in the app -- guardian consent is what makes it lawful
-- for a child to be walked with at all.
--
-- record_guardian_consent is otherwise careful, which is what makes the gap
-- worth naming rather than just closing: it refuses self-consent, demands a
-- guardian's name, refuses a guardian who is a minor, and REFUSES A GUARDIAN
-- FROM A DIFFERENT CHURCH. It looks the child's church up into `child_church`
-- to run that last check -- and never uses it to ask whether the caller has any
-- business with that child. The value was already in a variable.
--
-- HOW EXPLOITABLE IS IT TODAY: not at all. There is ONE church in the live
-- database, so there is no second church to reach into. That is the bound on
-- the impact, not a defence -- an Executive Director exists precisely to
-- oversee more than one church, so the day a second is created is the day this
-- becomes live. Fixed before that rather than after.
--
-- WHY NOT is_head_executive OR A WIDER RULE: an Executive Director already
-- passes leads_church for every church they oversee, through church_executives.
-- Nobody legitimate loses a power here; the check simply stops being blind to
-- which church the child is in.

create or replace function public.withdraw_guardian_consent(p_member uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  child_church uuid;
  child_exists boolean;
begin
  select church_id, true into child_church, child_exists
    from public.profiles where id = p_member;
  if not coalesce(child_exists, false) then
    raise exception 'No such member';
  end if;

  -- THE CHANGE. Was: is_admin() or is_executive() -- role only, any church.
  if not public.leads_church(child_church) then
    raise exception 'Only a Director or Executive Director of that church can withdraw guardian consent'
      using errcode = '42501';
  end if;

  update public.profiles
     set guardian_name       = null,
         guardian_member_id  = null,
         guardian_consent_at = null,
         guardian_consent_by = null
   where id = p_member;
end;
$function$;

create or replace function public.record_guardian_consent(
  p_member uuid, p_guardian_name text, p_guardian_member uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  child_church uuid;
  child_exists boolean;
  guardian_church uuid;
  guardian_birthday date;
begin
  -- THE CHURCH IS ESTABLISHED FIRST, because the authorisation depends on it.
  -- It used to be looked up halfway down, purely to check the guardian, while
  -- the caller had already been let through on their role alone.
  select church_id, true into child_church, child_exists
    from public.profiles where id = p_member;
  if not coalesce(child_exists, false) then
    raise exception 'No such member';
  end if;

  if not public.leads_church(child_church) then
    raise exception 'Only a Director or Executive Director of that church can record guardian consent'
      using errcode = '42501';
  end if;

  -- Everything below is unchanged, and all of it still matters.
  if p_member = (select auth.uid()) then
    raise exception 'Somebody else has to record consent for you'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_guardian_name), '') = '' then
    raise exception 'Name the parent or guardian who signed';
  end if;

  if p_guardian_member is not null then
    if p_guardian_member = p_member then
      raise exception 'Somebody cannot be their own guardian';
    end if;
    select church_id, birthday into guardian_church, guardian_birthday
      from public.profiles where id = p_guardian_member;
    if not found then
      raise exception 'No such guardian';
    end if;
    if public.is_minor(guardian_birthday) then
      raise exception 'A guardian must be an adult';
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
$function$;

-- ---------------------------------------------------------------------------
-- TWO INTERNAL FUNCTIONS THE BROWSER COULD CALL
-- ---------------------------------------------------------------------------
--
-- Both were added yesterday with the Guild wall pulse and both are internal:
-- one is a trigger body, the other is called only by triggers. Supabase grants
-- EXECUTE on new functions to the browser roles by default, so both were
-- reachable from a signed-in session.
--
-- Neither leaks anything -- the pulse row holds a guild id, a counter and a
-- timestamp. But `bump_guild_wall(guild)` reachable from a browser means
-- anybody could make any guild's wall reload on demand, for every member of it,
-- which is somebody else's screen flickering for no reason. An internal
-- function should not be callable at all.
revoke all on function private.bump_guild_wall(uuid)   from authenticated, anon, public;
revoke all on function private.guild_wall_pulse_seed() from authenticated, anon, public;
