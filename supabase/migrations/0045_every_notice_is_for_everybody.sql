-- Every announcement goes to the whole church. No audience, no choice.
--
-- THIS UNDOES HALF OF 0044, ON PURPOSE, AND THE OTHER HALF STAYS.
--
-- 0044 did two things: it let Guides pin a notice, and it gave a notice a
-- private audience. The first was right and stays. The second is now decided
-- against: a notice is for everybody, and the owner has said so plainly.
--
-- WHY THE COLUMN IS DROPPED RATHER THAN LEFT DEFAULTING TO TRUE. A flag that
-- the policy no longer reads is a trap with a delay on it. Somebody later sets
-- is_public = false, sees the row accept it, and reasonably concludes the
-- notice is now private. It is not; everybody can still read it. A setting
-- that appears to work and does nothing is worse than no setting, and worst of
-- all when what it appears to do is hide something.
--
-- Nothing is lost: there were no announcements in the table when this ran, so
-- there is no audience anywhere to preserve.
--
-- 0039's original comment turns out to have been right about this, and it is
-- worth leaving its reasoning here rather than quietly reinstating it: "a
-- notice that only some of the congregation can see is not a notice, and
-- building the option invites somebody to use it."

begin;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (church_id = public.my_church_id());

alter table public.announcements drop column if exists is_public;

commit;
