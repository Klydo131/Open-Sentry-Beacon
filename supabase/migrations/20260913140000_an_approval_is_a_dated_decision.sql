-- When somebody was approved, and by whom.
--
-- THE ONE DECISION THIS TABLE DID NOT RECORD. Asked for alongside the pairing
-- dates: "approvals should have a date too please, make sure the connection of
-- Guide and Explorer pairing and approval must have a live date record."
--
-- `is_approved` is a bare boolean. Every other consequential thing that happens
-- to a profile carries a timestamp, and the two heaviest carry an actor as
-- well:
--
--     recommended_at / recommended_by     somebody put a name forward
--     consent_at                          they agreed to the terms
--     signup_completed_at                 they finished joining
--     guardian_consent_at / _by           a guardian consented for a minor
--     suspended_at / suspended_by         access was taken away
--     is_approved                         ...nothing. A true or a false.
--
-- So the app can say exactly when access was REMOVED from somebody and by whom,
-- and cannot say when it was GRANTED or by whom. That is the wrong way round:
-- approval is the decision that lets a stranger into a church's private
-- conversations, and it is the one a Director is most likely to be asked to
-- account for afterwards.
--
-- IT WAS NOT AUDITED EITHER, WHICH IS WHY THIS IS NOT RECOVERABLE. The
-- `record_profile_change` trigger watches eight fields -- full_name,
-- preferred_contact, preferred_language, birthday, gender, life_status,
-- city_of_residence, work_industry -- and `is_approved` is not among them. So
-- there is no audit row to read a historical date out of, and nothing is
-- backfilled here for the same reason the pairing end dates were not: an
-- invented date is indistinguishable from a real one forever after.
--
-- WHY A TRIGGER AND NOT THE BROWSER. The same reason as
-- 20260913100000_a_pairing_records_when_it_ended: a client's clock is not a
-- record, a browser may only write the columns it is granted, and the stamp has
-- to arrive however the row is changed -- from the app, a script, or by hand.

begin;

alter table public.profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles (id) on delete set null;

comment on column public.profiles.approved_at is
  'When this person was approved. Null while unapproved, and null for anyone '
  'approved before this column existed -- never captured, not recoverable, and '
  'not present in profile_changes either.';

create or replace function private.stamp_approval()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Only the transition INTO approved. Re-saving an approved profile for any
  -- other reason must not move the date somebody may later be asked about.
  if new.is_approved and old.is_approved is distinct from true then
    new.approved_at := now();
    -- WHO. `approveMember` refuses self-approval outright -- "Somebody else has
    -- to approve you" -- and no definer function grants approval, so the caller
    -- here is always a leader acting on somebody else. auth.uid() is null when
    -- this runs outside a request (a migration, a script); the column is
    -- nullable so that case records the date without inventing a person.
    new.approved_by := auth.uid();
  end if;

  -- Disapproval clears both. Access has been taken away, and `suspended_at`
  -- already records that side; leaving a stale approval date on somebody who is
  -- no longer approved would make the roster contradict itself. Approving again
  -- stamps the new date, which is the truth: they were approved twice.
  if not new.is_approved then
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_approval on public.profiles;
create trigger stamp_approval
  before update of is_approved on public.profiles
  for each row execute function private.stamp_approval();

commit;
