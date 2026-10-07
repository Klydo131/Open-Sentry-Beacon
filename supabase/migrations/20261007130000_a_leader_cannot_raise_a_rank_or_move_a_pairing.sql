-- A leader cannot raise somebody's rank past their own, and nobody can move a
-- pairing onto other people.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS FOUND, 7 October 2026, by the second agent's security review, and
-- reproduced on a scratch copy of the database before this was written:
--
-- 1. A DIRECTOR COULD RAISE ANOTHER ACCOUNT'S RANK. profiles_update_church lets
--    leadership update any row in its church, and lock_privileged_profile_columns
--    let a leader change every column of somebody else's row. So a Director
--    could make a Guide, or an account of their own, an Executive Director,
--    the one rank above them, which invitations had never allowed
--    (validate_invite_privilege: "Only an Executive Director may appoint an
--    Executive Director"). The same door let a Director demote or disapprove
--    an Executive Director, mark somebody Head Executive, rewrite who approved
--    whom and when, record or erase guardian consent without the checks in
--    record_guardian_consent, and clear a suspension without restore_member.
--
-- 2. A PAIRING COULD BE MOVED ONTO OTHER PEOPLE. pairings_update lets the
--    pairing's Guide, and leadership, update the row, and nothing stopped the
--    update changing dm_id or ds_id. A conversation belongs to its pairing, so
--    a Director who set dm_id to themselves could read everything the Guide
--    and the Explorer had written to each other; and a Guide who changed ds_id
--    handed a different Explorer the whole history with the first. That breaks
--    the product's first promise: a conversation is between the two people in
--    it.
--
-- WHAT THIS DOES
--
--   * A write that comes straight from a browser may change only the columns
--     its sender is entitled to change. On your own account, your own details.
--     On somebody else's, as a leader: approval and role, and only within your
--     rank: the same rule invitations already keep, and the same reach the
--     suspension functions already keep (discipline_check). Everything else
--     (suspension, approval stamps, guardian consent, the Head Executive
--     mark, which church an account is in) changes only inside the database's own
--     functions, which check the caller themselves.
--
--   * Who is in a pairing never changes. The browser may move the journey
--     stage and the track, and end the pairing. A different pair is a new
--     pairing, with a new, empty conversation.
--
--   * Leadership changes an Explorer's Guide with change_guide(): the old
--     pairing ends, a new one begins with an empty conversation, and the
--     Explorer keeps their place on the journey.
--
--   * A new pairing must be an approved, active Guide in the Explorer's own
--     church and an Explorer. The app has only ever offered exactly that; now
--     the database insists on it, so a Director cannot pair an Explorer with
--     themselves either.
--
-- HOW "STRAIGHT FROM A BROWSER" IS TOLD APART. The two checks below run as
-- SECURITY INVOKER, so inside them current_user is the role that wrote the
-- row: `authenticated` for a request from the app, and the function's owner
-- when the write happens inside one of the database's own SECURITY DEFINER
-- functions (suspend_member, record_guardian_consent, finish_my_signup and the
-- rest), which do their own checking first. A migration or the service role
-- is not `authenticated` either.
--
-- NOTHING ALREADY STORED CHANGES. These are checks on future writes. The
-- column grants below are a second, separate wall: even if somebody edits a
-- trigger, the browser's role still cannot name the other columns at all.
-- ---------------------------------------------------------------------------

begin;

-- 1. ACCOUNTS -----------------------------------------------------------------
create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  me     uuid := (select auth.uid());
  reach  text;
  i_lead_executively boolean;
begin
  if current_user <> 'authenticated' then
    return new;  -- the database's own functions, a migration, the service role
  end if;

  -- Never, for anybody, from a browser.
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.is_head_executive is distinct from old.is_head_executive
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_by is distinct from old.suspended_by
     or new.suspended_reason is distinct from old.suspended_reason
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.guardian_name is distinct from old.guardian_name
     or new.guardian_consent_at is distinct from old.guardian_consent_at
     or new.guardian_consent_by is distinct from old.guardian_consent_by
     or new.guardian_member_id is distinct from old.guardian_member_id
     or new.recommended_by is distinct from old.recommended_by
     or new.recommended_at is distinct from old.recommended_at
     or new.signup_completed_at is distinct from old.signup_completed_at then
    raise exception 'That part of an account is not changed this way.'
      using errcode = '42501',
            hint = 'Suspension, approval records, guardian consent and invitations each have their own step in the app.';
  end if;

  if new.id = me then
    -- Your own account: your details are yours. Role, church and approval are
    -- left to lock_privileged_profile_columns, which allows exactly one thing
    -- -- taking up an invitation that names you -- and refuses the rest.
    return new;
  end if;

  -- Somebody else's account. Only a leader reaches here (profiles_update_church),
  -- and a leader changes approval and role, nothing personal.
  if new.full_name is distinct from old.full_name
     or new.preferred_contact is distinct from old.preferred_contact
     or new.preferred_language is distinct from old.preferred_language
     or new.topics_of_interest is distinct from old.topics_of_interest
     or new.birthday is distinct from old.birthday
     or new.gender is distinct from old.gender
     or new.life_status is distinct from old.life_status
     or new.city_of_residence is distinct from old.city_of_residence
     or new.work_industry is distinct from old.work_industry
     or new.consent_at is distinct from old.consent_at
     or new.avatar is distinct from old.avatar
     or new.photo_path is distinct from old.photo_path
     or new.password_is_temporary is distinct from old.password_is_temporary
     or new.church_id is distinct from old.church_id then
    raise exception 'Somebody else''s details are theirs to change.'
      using errcode = '42501';
  end if;

  if new.role is not distinct from old.role and new.is_approved is not distinct from old.is_approved then
    return new;
  end if;

  -- WITHIN YOUR RANK. discipline_check is the rule suspension already keeps: a
  -- Director reaches Guides and Explorers in their own church; an Executive
  -- Director reaches the churches they oversee; nobody reaches the Head
  -- Executive Director from inside the app.
  reach := public.discipline_check(new.id);
  if reach <> 'ok' then
    raise exception '%', reach using errcode = '42501';
  end if;

  -- AND NOBODY APPOINTS ABOVE A DIRECTOR BUT AN EXECUTIVE DIRECTOR, the rule
  -- invitations keep (validate_invite_privilege).
  i_lead_executively := public.is_executive();
  if new.role is distinct from old.role
     and new.role in ('admin', 'executive')
     and not i_lead_executively then
    raise exception 'Only an Executive Director may make somebody a Director or an Executive Director.'
      using errcode = '42501';
  end if;
  -- Approving somebody who signed up as a Director or Executive Director is
  -- making them one.
  if new.is_approved and not coalesce(old.is_approved, false)
     and new.role in ('admin', 'executive')
     and not i_lead_executively then
    raise exception 'Only an Executive Director may approve a Director or an Executive Director.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_profile_writes() from public, anon;
grant execute on function private.guard_profile_writes() to authenticated;

-- Named to run first: before lock_privileged_profile_columns and before
-- stamp_approval, so it sees what the browser sent and not what the stamps add.
drop trigger if exists aa_guard_profile_writes on public.profiles;
create trigger aa_guard_profile_writes
  before update on public.profiles
  for each row execute function private.guard_profile_writes();

-- The second wall: the columns the app writes, and no others.
revoke update on public.profiles from authenticated;
grant update (full_name, preferred_contact, preferred_language, topics_of_interest,
              birthday, gender, life_status, city_of_residence, work_industry,
              consent_at, avatar, photo_path, password_is_temporary, updated_at,
              role, is_approved, church_id)
  on public.profiles to authenticated;

-- 2. PAIRINGS -----------------------------------------------------------------
create or replace function private.guard_pairing_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  guide    record;
  explorer record;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.dm_id is distinct from old.dm_id
       or new.ds_id is distinct from old.ds_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'A pairing cannot be moved to other people. End it, and pair the new two.'
        using errcode = '42501',
              hint = 'A conversation belongs to the two people in it.';
    end if;
    if new.ended_at is distinct from old.ended_at then
      raise exception 'The end date is recorded when a pairing ends.' using errcode = '42501';
    end if;
    -- Ending is anybody's in the pairing's reach; starting again is not a
    -- Guide's to do alone, because it is a pairing leadership did not make.
    if new.status is distinct from old.status
       and new.status = 'active'
       and not public.manages_church(public.church_of(new.ds_id)) then
      raise exception 'Only a Director can make a pairing active again.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- INSERT: an approved, active Guide and an Explorer, in one church.
  select p.role, p.church_id, p.is_approved, p.suspended_at into guide
    from public.profiles p where p.id = new.dm_id;
  select p.role, p.church_id into explorer
    from public.profiles p where p.id = new.ds_id;
  if guide.role is distinct from 'dm' or not coalesce(guide.is_approved, false) or guide.suspended_at is not null then
    raise exception 'Only an approved Guide can be paired with an Explorer.' using errcode = '42501';
  end if;
  if explorer.role is distinct from 'ds' then
    raise exception 'Only an Explorer can be paired with a Guide.' using errcode = '42501';
  end if;
  if guide.church_id is distinct from explorer.church_id then
    raise exception 'A Guide and an Explorer are paired within one church.' using errcode = '42501';
  end if;
  -- Who made it is whoever made it.
  new.created_by := (select auth.uid());
  return new;
end;
$function$;

revoke all on function private.guard_pairing_writes() from public, anon;
grant execute on function private.guard_pairing_writes() to authenticated;

drop trigger if exists aa_guard_pairing_writes on public.pairings;
create trigger aa_guard_pairing_writes
  before insert or update on public.pairings
  for each row execute function private.guard_pairing_writes();

revoke update on public.pairings from authenticated;
grant update (journey_stage, track, status, updated_at) on public.pairings to authenticated;

-- 3. WHAT A ROW IS ABOUT DOES NOT CHANGE ---------------------------------------
-- The same review, widened to every table a browser may update: the columns
-- that say whose a row is, which church it belongs to and whom it concerns are
-- fixed once it is written. Without this, a notice's writer could move it onto
-- another church's board, whoever handles a safeguarding report could rewrite
-- who reported whom, and a leader could change who a request or a
-- recommendation came from. The app changes none of these; now nobody can.
create or replace function private.keep_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  col text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'What this % is about cannot be changed (%).', tg_table_name, col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function private.keep_columns() from public, anon;
grant execute on function private.keep_columns() to authenticated;

drop trigger if exists aa_keep_columns on public.announcements;
create trigger aa_keep_columns before update on public.announcements
  for each row execute function private.keep_columns('id', 'church_id', 'author_id', 'created_at');
drop trigger if exists aa_keep_columns on public.blog_posts;
create trigger aa_keep_columns before update on public.blog_posts
  for each row execute function private.keep_columns('id', 'church_id', 'author_id', 'created_at');
drop trigger if exists aa_keep_columns on public.lessons;
create trigger aa_keep_columns before update on public.lessons
  for each row execute function private.keep_columns('id', 'church_id', 'author_id');
drop trigger if exists aa_keep_columns on public.lesson_series;
create trigger aa_keep_columns before update on public.lesson_series
  for each row execute function private.keep_columns('id', 'church_id', 'author_id');
drop trigger if exists aa_keep_columns on public.reports;
create trigger aa_keep_columns before update on public.reports
  for each row execute function private.keep_columns('id', 'church_id', 'reporter_id', 'subject_id', 'pairing_id', 'guild_post_id', 'created_at');
drop trigger if exists aa_keep_columns on public.pairing_requests;
create trigger aa_keep_columns before update on public.pairing_requests
  for each row execute function private.keep_columns('id', 'church_id', 'ds_id', 'guide_id');
drop trigger if exists aa_keep_columns on public.recommendations;
create trigger aa_keep_columns before update on public.recommendations
  for each row execute function private.keep_columns('id', 'church_id', 'dm_id');
drop trigger if exists aa_keep_columns on public.feedback;
create trigger aa_keep_columns before update on public.feedback
  for each row execute function private.keep_columns('id', 'church_id', 'author_id', 'client_id');
drop trigger if exists aa_keep_columns on public.church_apps;
create trigger aa_keep_columns before update on public.church_apps
  for each row execute function private.keep_columns('id', 'church_id', 'added_by');

-- 4. CHANGING AN EXPLORER'S GUIDE, IN ONE STEP --------------------------------
-- The owner, the same day: "EDs and Directors can change pairs but they can't
-- see the Guide and Explorer's chat or communication." So a change of Guide is
-- the old pairing ending and a new one beginning: the Explorer keeps their
-- place on the journey, the new Guide starts an empty conversation, and what
-- the Explorer and the first Guide wrote stays between those two. Nobody in
-- leadership is ever one of the two.
create or replace function public.change_guide(p_pairing uuid, p_new_guide uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_pair public.pairings%rowtype;
  guide    public.profiles%rowtype;
  explorer public.profiles%rowtype;
  made     uuid;
begin
  select * into old_pair from public.pairings where id = p_pairing for update;
  if old_pair.id is null then
    raise exception 'That pairing is not here.' using errcode = 'P0002';
  end if;
  if not public.manages_church(public.church_of(old_pair.ds_id)) then
    raise exception 'Only a Director or Executive Director of that church can change a Guide.'
      using errcode = '42501';
  end if;
  if old_pair.status <> 'active' then
    raise exception 'That pairing has already ended.' using errcode = '22023';
  end if;
  if p_new_guide = old_pair.dm_id then
    raise exception 'That is already their Guide.' using errcode = '22023';
  end if;

  select * into guide    from public.profiles where id = p_new_guide;
  select * into explorer from public.profiles where id = old_pair.ds_id;
  if guide.id is null or guide.role <> 'dm' or not guide.is_approved or guide.suspended_at is not null then
    raise exception 'Only an approved Guide can be paired with an Explorer.' using errcode = '42501';
  end if;
  if guide.church_id is distinct from explorer.church_id then
    raise exception 'A Guide and an Explorer are paired within one church.' using errcode = '42501';
  end if;

  update public.pairings set status = 'archived', updated_at = now() where id = old_pair.id;
  insert into public.pairings (dm_id, ds_id, track, journey_stage, created_by)
  values (p_new_guide, old_pair.ds_id, old_pair.track, old_pair.journey_stage, (select auth.uid()))
  returning id into made;
  return made;
end;
$function$;

revoke all on function public.change_guide(uuid, uuid) from public, anon;
grant execute on function public.change_guide(uuid, uuid) to authenticated;

commit;
