-- The Guide chosen on the invitation is paired the moment the Explorer arrives.
--
-- REPORTED: (a bug report)
--
-- THREE SEPARATE BUGS SAT ON THIS ONE PATH. Each was found by probing the live
-- database rather than by reading, and the third is the one that was reported.
--
-- ---------------------------------------------------------------------------
-- ONE: THE APPROVAL ITSELF FAILED. Probed, a Director pressing Approve on an
-- Explorer who had a Guide named on their invitation got:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- and the person stayed unapproved. Not a missing pairing -- a locked door.
--
-- SELF-INFLICTED, EARLIER THE SAME DAY. `a_pair_can_be_made_again` dropped
-- `pairings_ds_id_dm_id_key`, the unconditional UNIQUE (ds_id, dm_id), because
-- an archived pairing held that pair's slot forever and two people who had been
-- disconnected could never be paired again. That change was right. What was
-- missed is that a trigger written long before said `on conflict (ds_id, dm_id)
-- do nothing`, and an ON CONFLICT clause needs a unique index on exactly those
-- columns with NO condition -- the partial indexes that replaced it do not
-- satisfy it. Dropping a constraint silently broke a statement inside a
-- function nobody was looking at.
--
-- Worth keeping: grep for a constraint's COLUMNS before dropping it, not only
-- its name. Nothing referenced this one by name; the ON CONFLICT referenced its
-- shape.
--
-- ---------------------------------------------------------------------------
-- TWO: `DO NOTHING` WAS THE WRONG INSTRUCTION ANYWAY. Disconnecting a pairing
-- ARCHIVES it rather than deleting it, deliberately, so the history of who
-- walked with whom survives. So for anybody who had ever been paired with that
-- Guide before, the row already existed, DO NOTHING quietly skipped, and the
-- Explorer came through with no active Guide and no message -- on the exact
-- path a Director would use to re-pair somebody. Reviving the archived row is
-- the honest answer and keeps the history.
--
-- ---------------------------------------------------------------------------
-- THREE, AND THIS IS THE REPORTED ONE: AN INVITED EXPLORER IS NEVER APPROVED,
-- BECAUSE THEY ARRIVE APPROVED. `handle_new_user` sets `is_approved` to true at
-- signup for anybody holding an Explorer invitation -- the invitation IS the
-- approval, which is deliberate and stays. The pairing hung off an
-- `after update of is_approved` trigger, and for those people `is_approved`
-- never transitions: the row is INSERTED with it already true.
--
-- So for a first-time invited Explorer -- the ordinary case, the one in the
-- report -- the pairing trigger has never once fired. The Guide was recorded on
-- their profile and nothing ever read it. Nothing failed, nothing was logged,
-- and the Director simply found an unpaired Explorer.
--
-- The pairing therefore happens on INSERT as well as on approval, and both go
-- through one function so the two paths cannot drift.
--
-- ---------------------------------------------------------------------------
-- AND ARRIVING NEVER FAILS BECAUSE OF PAIRING. Approving is "let this person
-- into the church"; pairing is "and walk with this one". A Guide already
-- carrying five Explorers, or an Explorer paired by hand while the invitation
-- sat unanswered, must not be able to turn Approve -- or SIGNING UP -- into an
-- error. The pairing is attempted, and if the database refuses it the person
-- still gets in and simply has no Guide yet, which is a state the Director's
-- own screen already shows and counts.

begin;

-- The pairing itself, in one place, so the two callers cannot disagree.
create or replace function public.pair_with_named_guide(p_ds uuid, p_dm uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prior uuid;
  v_why   text;
begin
  if p_ds is null or p_dm is null then return; end if;

  -- ALREADY WALKING WITH SOMEBODY. A Director who paired them by hand while the
  -- invitation sat unanswered made a later and better-informed decision than
  -- the suggestion typed into the invitation weeks ago. Leave it alone.
  if exists (select 1 from public.pairings where ds_id = p_ds and status = 'active') then
    return;
  end if;

  begin
    -- THESE TWO HAVE A HISTORY. Reviving the archived row keeps the record of
    -- the first time they walked together instead of starting a second one
    -- beside it.
    select id into v_prior
    from public.pairings
    where ds_id = p_ds and dm_id = p_dm
    order by created_at desc
    limit 1;

    if v_prior is not null then
      update public.pairings
         set status = 'active', updated_at = now()
       where id = v_prior;
    else
      insert into public.pairings (dm_id, ds_id, journey_stage, created_by)
      values (p_dm, p_ds, 'connect', (select auth.uid()));
    end if;
  exception when others then
    -- The Guide may be at their cap, or another Director may have paired this
    -- Explorer a second earlier. Either way the person is still in. Turning
    -- that into a failure is how a five-Explorer cap becomes "the Approve
    -- button is broken".
    get stacked diagnostics v_why = message_text;
    raise warning 'Could not pair % with %: %', p_ds, p_dm, v_why;
  end;
end;
$$;

revoke all on function public.pair_with_named_guide(uuid, uuid) from public, anon, authenticated;

-- The reported case: an invited Explorer arrives already approved.
create or replace function public.pair_recommended_explorer_on_arrival()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.role = 'ds' and new.is_approved and new.recommended_by is not null then
    perform public.pair_with_named_guide(new.id, new.recommended_by);
  end if;
  return new;
end;
$$;

drop trigger if exists pair_recommended_explorer_on_arrival on public.profiles;
create trigger pair_recommended_explorer_on_arrival
  after insert on public.profiles
  for each row execute function public.pair_recommended_explorer_on_arrival();

-- And the case that still needs a human: a Guide, or somebody switched back on.
create or replace function public.pair_recommended_explorer_after_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not old.is_approved
     and new.is_approved
     and new.role = 'ds'
     and new.recommended_by is not null then
    perform public.pair_with_named_guide(new.id, new.recommended_by);
  end if;
  return new;
end;
$$;

drop trigger if exists pair_recommended_explorer_after_approval on public.profiles;
create trigger pair_recommended_explorer_after_approval
  after update of is_approved on public.profiles
  for each row execute function public.pair_recommended_explorer_after_approval();

commit;
