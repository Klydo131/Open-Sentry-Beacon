-- Accuracy replaces withdrawal, and a change of details is not private from
-- the people walking with you.
--
-- THE DECISION THIS ENCODES, in the owner's words: there is no self-service
-- "withdraw permission" button. A member may change their contact details
-- whenever they like, as long as what they put there is true, and when they do,
-- their Guide and their Director see that it changed. Using the app is the
-- undertaking to keep it truthful.
--
-- WHAT THAT REPLACES. The sign-up form promised , and Settings had a
-- button that cleared them. Both go. Leaving the button while removing the
-- promise, or the reverse, would be worse than either -- a promise with no
-- mechanism is a lie, and a mechanism the app never mentions is a trap.
--
-- LEAVING IS STILL POSSIBLE, just not silently. remove_member_by_leader already
-- exists and deletes the profile outright. So the route out is a conversation
-- with a Director rather than a button, which for a church is the more honest
-- shape: somebody notices that a person has gone.
--
-- WHY A LOG RATHER THAN A NOTIFICATION. A notification is read once and lost,
-- and the question a Guide actually asks is , weeks later. Only a record answers that.

begin;

-- ---------------------------------------------------------------------------
-- 1. The self-service withdrawal is gone.
-- ---------------------------------------------------------------------------
-- Dropped rather than left unused. A SECURITY DEFINER function that clears
-- somebody's details is reachable over PostgREST by anything holding a session,
-- whether or not a screen still calls it, so an unused one is not a dead
-- function -- it is an undocumented one.
drop function if exists public.withdraw_my_consent();

-- ---------------------------------------------------------------------------
-- 2. What changed, when, and from what.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_changes (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Copied at write time rather than joined at read time, because the reader
  -- is a Director whose right to see the row depends on the church, and a join
  -- back to profiles would re-enter that table's policies. 0001a is the whole
  -- story of why that deadlocks.
  church_id   uuid,
  field       text not null,
  old_value   text,
  new_value   text,
  changed_at  timestamptz not null default now()
);

-- The one query this table exists to answer: what has this person changed,
-- most recent first.
create index if not exists profile_changes_by_person
  on public.profile_changes (profile_id, changed_at desc);

alter table public.profile_changes enable row level security;

-- WHY on delete cascade, when 0028 went to trouble to make the discipline log
-- OUTLIVE the person it describes. A safeguarding record answers a question the
-- church still has after somebody leaves. A list of old phone numbers does not:
-- it is contact data with no remaining purpose, and keeping it past the account
-- would be hoarding. Different records, different lifetimes, on purpose.

-- ---------------------------------------------------------------------------
-- 3. The trigger that writes it.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the row is written even though nobody holds an INSERT
-- policy on this table. That is deliberate: the log is append-only from the
-- outside, and the only thing that may append to it is this trigger.
create or replace function public.record_profile_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  watched text[] := array[
    'full_name', 'preferred_contact', 'preferred_language',
    'birthday', 'gender', 'life_status',
    'city_of_residence', 'work_industry'
  ];
  f       text;
  before  text;
  after   text;
begin
  foreach f in array watched loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f)
      into before, after
      using old, new;

    -- `is distinct from` rather than <>, so a value going to or from NULL
    -- counts as a change. Clearing a phone number is exactly the edit a Guide
    -- most needs to know about, and <> would have missed it silently.
    if before is distinct from after then
      insert into public.profile_changes (profile_id, church_id, field, old_value, new_value)
      values (new.id, new.church_id, f, before, after);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_record_changes on public.profiles;
create trigger profiles_record_changes
  after update on public.profiles
  for each row
  execute function public.record_profile_change();

-- ---------------------------------------------------------------------------
-- 4. Who may read it.
-- ---------------------------------------------------------------------------
-- Three readers, and nobody else. There is no insert, update or delete policy
-- at all, so the only writer is the trigger above and no one can edit or erase
-- their own history -- which is the entire point of keeping one.
drop policy if exists profile_changes_read_own on public.profile_changes;
create policy profile_changes_read_own on public.profile_changes
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- The Guide walking with them, and only while the pairing is active. A Guide
-- who has moved on does not keep reading somebody's history.
drop policy if exists profile_changes_read_guide on public.profile_changes;
create policy profile_changes_read_guide on public.profile_changes
  for select to authenticated
  using (public.is_paired_with(profile_id));

drop policy if exists profile_changes_read_leadership on public.profile_changes;
create policy profile_changes_read_leadership on public.profile_changes
  for select to authenticated
  using (public.manages_church(church_id));

-- ---------------------------------------------------------------------------
-- 5. Nothing new is open to anon. (The rule from 0031.)
-- ---------------------------------------------------------------------------
revoke all on public.profile_changes from public, anon;
grant select on public.profile_changes to authenticated;

revoke all on function public.record_profile_change() from public, anon;

comment on table public.profile_changes is
  'Append-only record of a member changing their own details. Readable by that '
  'member, their active Guide, and their church leadership. Written only by the '
  'profiles trigger; there is no insert or delete policy by design.';

commit;
