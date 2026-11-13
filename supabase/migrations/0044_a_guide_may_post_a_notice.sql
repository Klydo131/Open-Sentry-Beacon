-- Guides write notices too, and a notice can go to fewer than everybody.
--
-- WHAT WAS WRONG. Announcements were leadership-only and church-wide only, and
-- migration 0039 argued for that in a comment: "a notice that only some of the
-- congregation can see is not a notice". That is true of a NOTICEBOARD, and it
-- was the wrong model for the thing a Guide actually needs. A Guide arranging
-- something for the five people they walk with has no way to pin it anywhere
-- those five will see it, so it goes in five separate conversations and is
-- missed by whoever does not scroll back.
--
-- So the audience is now explicit rather than assumed:
--
--   public  — everybody in the church. What 0039 built, unchanged in meaning,
--             and still the default.
--   private — the people the author walks with, and the author. For a Guide
--             that is their Explorers; for a Director it is anyone paired with
--             them, which is usually nobody, so a Director writing privately
--             is writing a note to themselves. That is worth saying out loud
--             in the screen rather than pretending it does something.
--
-- WHO MAY WRITE. Guides, Directors and Executive Directors. Not Explorers:
-- a notice is pinned to the top of everybody's church screen, and pinning is
-- an act of leading rather than of speaking. An Explorer who wants to say
-- something to the church has Community Blogs, which is exactly that and does
-- not sit above everyone else's.
--
-- LEADERSHIP CAN STILL TAKE ANYTHING DOWN, including a Guide's, and that is
-- the same reason the blogs have it: a pinned notice reaches the whole church,
-- and anything that reaches the whole church needs an off switch that does not
-- depend on the author being available.

begin;

alter table public.announcements
  add column if not exists is_public boolean not null default true;

comment on column public.announcements.is_public is
  'True for the whole church. False means the people the author walks with, '
  'and the author. Defaults true, so every notice written before this stays '
  'exactly as public as it was.';

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (
    church_id = public.my_church_id()
    and (
      is_public
      or author_id = (select auth.uid())
      or public.is_paired_with(author_id)
      -- Leadership sees everything in its own church, because it is
      -- responsible for everything in its own church.
      or public.leads_church(church_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- Pinned to your own name and your own church, both enforced here rather than
-- in the app, so a hand-made request cannot post as somebody else.
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_approved
        and p.suspended_at is null
        and p.role in ('dm', 'admin', 'executive')
    )
  );

-- ---------------------------------------------------------------------------
-- Editing and taking down
-- ---------------------------------------------------------------------------
drop policy if exists announcements_edit on public.announcements;
create policy announcements_edit on public.announcements
  for update to authenticated
  using (author_id = (select auth.uid()) or public.manages_church(church_id))
  with check (author_id = (select auth.uid()) or public.manages_church(church_id));

drop policy if exists announcements_drop on public.announcements;
create policy announcements_drop on public.announcements
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.manages_church(church_id));

commit;
