-- A Guide is told why sharing is paused, instead of being told nothing.
--
-- ---------------------------------------------------------------------------
-- FOUND BY PROBING THE LIVE DATABASE, not by reading code. A Guide trying to
-- share a resource with their own Explorer was refused outright. The rule doing
-- it was `pairing_can_share_library`, and it was right: an open case about
-- either person in a pairing pauses sharing. What was wrong was everything the
-- Guide could see about it.
--
-- The insert failed with a bare row-level-security violation. `humanError`
-- caught that and said:
--
--     "You do not have permission to do that. If that seems wrong, ask your
--      Director."
--
-- Three things wrong with that sentence in this situation. The Guide DOES have
-- permission -- it is paused, not withheld. Nothing tells them it will come
-- back on its own. And it sends them to a Director, of which this church
-- currently has none, so the advice is a dead end.
--
-- WHY THE REASON AND THE RULE ARE NOW ONE FUNCTION. The obvious fix is a second
-- function listing the same nine conditions and returning a sentence for each.
-- That is two copies of one rule, and the copies drift: the day somebody adds a
-- tenth condition to the rule, the explanation quietly starts lying, saying
-- "nothing is wrong" to somebody who has just been refused. So the explanation
-- is the source, and the permission is derived from it:
--
--     pairing_can_share_library(p) := why_library_sharing_is_paused(p) is null
--
-- A condition cannot be added to one without appearing in the other, because
-- there is no longer an "other".
--
-- WHOSE CASE IT IS, IS NOT SAID. `join_trial` in 20260916120000 deliberately
-- gives one message for every refusal, because "it is about you" and "it is
-- about a colleague" each confirm something about a case the asker may not be
-- entitled to know the shape of. This must not become the way around that, so
-- the trial branch names no one.
-- ---------------------------------------------------------------------------

/**
 * Why this pairing cannot share right now, or null when it can.
 *
 * Conditions are checked in the order a person would want to hear them: the
 * ones they can act on first, the one they simply have to wait out last.
 */
create or replace function public.why_library_sharing_is_paused(p_pairing uuid)
returns text
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare
  pair     public.pairings%rowtype;
  guide    public.profiles%rowtype;
  explorer public.profiles%rowtype;
begin
  select * into pair from public.pairings where id = p_pairing;

  -- ONE ANSWER FOR "no such pairing" AND "not one of yours", so the question
  -- cannot be used to discover that a pairing exists.
  if pair.id is null
     or (pair.dm_id <> (select auth.uid()) and pair.ds_id <> (select auth.uid())) then
    return 'That pairing is not one of yours.';
  end if;

  if pair.status <> 'active' then
    return 'That pairing is not active, so nothing can be shared through it.';
  end if;

  select * into guide    from public.profiles where id = pair.dm_id;
  select * into explorer from public.profiles where id = pair.ds_id;

  -- The old rule used an INNER JOIN onto profiles, so a pairing pointing at a
  -- person who is gone was simply false. Without this guard the checks below
  -- would compare against NULL, every `if` would be neither true nor false, and
  -- the function would fall through to "allowed" -- turning a refusal into a
  -- permission. The join did this silently; here it has to be said.
  if guide.id is null or explorer.id is null then
    return 'That pairing is missing somebody.';
  end if;

  if not guide.is_approved or not explorer.is_approved then
    return 'Sharing waits until both people in this pairing are approved.';
  end if;

  if guide.suspended_at is not null or explorer.suspended_at is not null then
    return 'Sharing is off while somebody in this pairing is suspended.';
  end if;

  if guide.church_id is distinct from explorer.church_id then
    return 'Sharing only works between two people in the same church.';
  end if;

  if public.library_blocked(pair.dm_id) or public.library_blocked(pair.ds_id) then
    return 'Sharing the library has been turned off for somebody in this pairing.';
  end if;

  if exists (
    select 1 from public.pairing_library_permissions permission
     where permission.pairing_id = pair.id
       and not permission.sharing_allowed
  ) then
    return 'Library sharing has been turned off for this pairing.';
  end if;

  -- NAMES NOBODY. See the header.
  if exists (
    select 1 from public.trials trial
     where trial.status = 'open'
       and trial.subject_id in (pair.dm_id, pair.ds_id)
  ) then
    return 'Sharing is paused while a case is open. It starts working again '
           'on its own once the case is closed.';
  end if;

  return null;
end;
$$;

revoke all on function public.why_library_sharing_is_paused(uuid) from public, anon;
grant execute on function public.why_library_sharing_is_paused(uuid) to authenticated;

/**
 * May this pairing share? Derived, so it cannot disagree with the explanation.
 *
 * Every condition that used to live here now lives in the function above, in
 * the same order and with the same meaning.
 */
create or replace function public.pairing_can_share_library(p_pairing uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select public.why_library_sharing_is_paused(p_pairing) is null;
$$;

revoke all on function public.pairing_can_share_library(uuid) from public, anon;
grant execute on function public.pairing_can_share_library(uuid) to authenticated;
