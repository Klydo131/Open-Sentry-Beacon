-- Everybody may change a study, and nobody changes it for anybody else.
--
-- THE RULE, after the first attempt: every user can edit and delete Lessons
-- privately, on their own account, never for everybody.
--
-- The church's shared studies are a STARTING POINT, not a fixed text. A Guide
-- who wants to cut a paragraph, change an example so it lands with the person
-- they walk with, or drop a study they will never use, should be able to. What
-- they must not be able to do is change it for the other sixteen Guides, and
-- the first version of this let a Director do exactly that, church-wide, from a
-- button that looked like an ordinary edit.
--
-- So a shared study becomes a template. The first time somebody edits one they
-- quietly get their own copy, and from then on they see theirs and nobody
-- else's view moves. Deleting one hides it for them alone.
--
-- TWO COLUMNS, NOT A NEW TABLE. A copy already needs a row, and the row already
-- has an owner and policies that let its owner change it. `copied_from` says
-- which template it replaces FOR THIS PERSON; `is_hidden` marks a copy that
-- exists only to record . Both are answered by the same
-- policies that already govern a series somebody wrote, so nothing new decides
-- who may do what.

alter table public.lesson_series
  add column if not exists copied_from uuid references public.lesson_series (id) on delete set null,
  add column if not exists is_hidden   boolean not null default false;

-- One copy of a template per person. Pressing edit twice quickly, or on two
-- devices, must not leave somebody with two versions of the same study and no
-- way to tell which one they are reading.
create unique index if not exists lesson_series_one_copy_each
  on public.lesson_series (copied_from, author_id)
  where copied_from is not null;

comment on column public.lesson_series.copied_from is
  'The shared study this one replaces, for its author only. The original stays untouched for everybody else.';
comment on column public.lesson_series.is_hidden is
  'A copy that exists only to say its author does not want the template it came from.';

-- WHO MAY WRITE ONE AT ALL.
--
-- It was a Guide or somebody who manages the church, which is right for
-- publishing a study to a congregation and wrong for keeping a private copy of
-- one. "All users" was the ask, and an unpublished series nobody else can read
-- is not a thing that needs a rank: `ls_read` already shows a series to its own
-- author and to everybody only once it is published.
drop policy if exists ls_write on public.lesson_series;
create policy ls_write on public.lesson_series
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and author_id = (select auth.uid())
    and (
      -- Publishing to the whole church stays with the people who answer for it.
      not is_published
      or public.manages_church(church_id)
      or public.auth_role() = 'dm'
    )
  );

-- And the same line on the way through, so a private copy cannot be edited into
-- a church-wide publication by somebody who could not have published it.
drop policy if exists ls_edit on public.lesson_series;
create policy ls_edit on public.lesson_series
  for update to authenticated
  using (author_id = (select auth.uid()) or public.manages_church(church_id))
  with check (
    church_id = public.my_church_id()
    and (
      not is_published
      or public.manages_church(church_id)
      or public.auth_role() = 'dm'
    )
  );

-- LESSONS INSIDE A COPY. Same reasoning: a lesson in a series you own is yours
-- to write, whatever your rank, because the series it lives in is only visible
-- to you until it is published.
drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.lesson_series s
      where s.id = lessons.series_id
        and (s.author_id = (select auth.uid()) or public.manages_church(s.church_id))
    )
  );
