-- Announcements: the notices a church pins where everyone will see them.
--
-- The tutorial has had a row of these since the beginning and they were three
-- hard-coded strings, which is fine for a demonstration and useless to a real
-- church. This is the table behind them.
--
-- WHY NOT REUSE THE BLOG. A blog post is somebody's writing, addressed to the
-- people they walk with, and it belongs to its author. A notice is the
-- church's: Sabbath worship is at nine, the week of prayer starts Monday. They
-- have different authors, different lifetimes and different audiences, and
-- collapsing them would mean a Guide's reflection on Psalm 23 sitting in the
-- same list as the times of a meeting.
--
-- EVERY MEMBER READS, ONLY LEADERSHIP WRITES. There is no per-person audience
-- here on purpose. A notice that only some of the congregation can see is not
-- a notice, and building the option invites somebody to use it.

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  icon       text not null default '📌' check (length(icon) <= 8),
  title      text not null check (length(btrim(title)) between 1 and 120),
  body       text not null default '' check (length(body) <= 2000),
  -- Free text, not a timestamp. "This Sabbath, 9:00 AM" and "Every evening
  -- this week" are both what a church actually writes, and neither is a date.
  when_text  text not null default '' check (length(when_text) <= 120),
  -- Notices expire by being taken down, not by a clock nobody set.
  is_pinned  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists announcements_church_idx
  on public.announcements (church_id, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists announcements_read  on public.announcements;
drop policy if exists announcements_write on public.announcements;
drop policy if exists announcements_edit  on public.announcements;
drop policy if exists announcements_drop  on public.announcements;

create policy announcements_read on public.announcements
  for select to authenticated using (church_id = public.my_church_id());

create policy announcements_write on public.announcements
  for insert to authenticated
  with check (
    public.manages_church(church_id)
    and author_id = (select auth.uid())
  );

create policy announcements_edit on public.announcements
  for update to authenticated
  using (public.manages_church(church_id))
  with check (public.manages_church(church_id));

create policy announcements_drop on public.announcements
  for delete to authenticated
  using (public.manages_church(church_id));
