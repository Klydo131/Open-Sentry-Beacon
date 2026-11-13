-- An Executive Director who arrived by invitation can see their own church.
--
-- ---------------------------------------------------------------------------
-- REPORTED AS , from a phone and
-- then from a laptop. The Guide picker on the pairing form opened with one row
-- in it, "Choose guide", and no people.
--
-- The people were there. The church has forty-two approved Guides and
-- forty-five approved Explorers. What was missing was the reader's permission
-- to see any of them, and the picker was simply the first place that showed.
-- Measured, per Executive Director, by running the real policies as each of
-- them:
--
--     four executives  ->  109 profiles readable, 42 guides, 45 explorers
--     two executives   ->    1 profile readable,   0 guides,  0 explorers
--
-- One profile is their own. Those two accounts were not looking at a broken
-- dropdown; they were looking at an app with nobody in it. Approvals, Guides,
-- Explorers and Directors were all empty too.
--
-- WHY. For an Executive Director, `manages_church(c)` rests entirely on
-- `oversees_church(c)`, which is a lookup in `church_executives` --
-- `is_admin()` is false for them by definition, so `profiles.church_id` grants
-- them nothing at all. And `handle_new_user`, which builds the profile when
-- somebody finishes signing up, sets their role, sets their church_id and
-- auto-approves them, but has never inserted the `church_executives` row.
--
-- So the link was only ever created by `create_church()`, which inserts one for
-- whoever calls it. An executive who CREATES a church works. An executive who
-- is INVITED into one gets an account that can see nothing, and every one of
-- them has had this since executives could be invited at all. Four of six
-- worked here only because they made a church at some point.
--
-- This is the third time this shape has been fixed. Migration 0025 says so in
-- its own header: `discipline_check` compared church_id to church_id and
-- "silently refused them on every member of a church they are responsible
-- for", and it notes "the same fault that made executives see one profile
-- instead of twenty-four, in a different function". Both of those were fixed
-- where they were found. Nothing was done about the reason the link is missing,
-- so it came back in a third place.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. THE REPAIR, for the accounts that are already broken.
-- ---------------------------------------------------------------------------
--
-- Every approved Executive Director with a church and no link to it. Not a
-- guess about intent: an invitation naming somebody an Executive Director of a
-- church is a decision an existing executive already made and the edge function
-- already refused to let anybody else make. The row records that decision; its
-- absence was a bug, not a withholding.
insert into public.church_executives (church_id, executive_id)
select p.church_id, p.id
from public.profiles p
where p.role = 'executive'
  and p.church_id is not null
on conflict (church_id, executive_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. THE REASON IT CANNOT HAPPEN AGAIN.
-- ---------------------------------------------------------------------------
--
-- A TRIGGER ON profiles RATHER THAN A LINE IN handle_new_user, deliberately.
-- Signing up is not the only way somebody becomes an Executive Director:
-- `approveMember` sets a role on an existing profile, and any future path that
-- writes the column would need remembering too. A rule that lives beside the
-- column it depends on cannot be forgotten by the next thing that writes it,
-- and that forgetting is the entire history above.
create or replace function public.executive_oversees_their_church()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.role = 'executive' and new.church_id is not null then
    insert into public.church_executives (church_id, executive_id)
    values (new.church_id, new.id)
    on conflict (church_id, executive_id) do nothing;
  end if;
  return null;   -- AFTER trigger; the row is already written.
end;
$$;

comment on function public.executive_oversees_their_church() is
  'Keeps church_executives in step with a profile that is an Executive Director of a church.';

-- NOTHING IS DELETED WHEN SOMEBODY STOPS BEING AN EXECUTIVE, and that is a
-- decision rather than an omission. An Executive Director may oversee SEVERAL
-- churches, which is what this table is for, and deleting on demotion would
-- throw away assignments this trigger never made and cannot recreate. It does
-- not leave authority behind either: `oversees_church` was rewritten in
-- 20260816130240 to require `is_executive()` as well as the row, so a stale
-- link on somebody who is no longer an executive grants nothing.
drop trigger if exists profiles_executive_oversees_their_church on public.profiles;
create trigger profiles_executive_oversees_their_church
  after insert or update of role, church_id on public.profiles
  for each row
  execute function public.executive_oversees_their_church();

commit;
