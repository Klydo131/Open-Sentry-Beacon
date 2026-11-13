-- An Explorer reads the studies. They do not write them.
--
-- THE RULE: Explorers cannot edit the sample Lesson studies; only EDs,
-- Directors and Guides can. Explorers can read every Lesson study, from the
-- samples and from their Guide.
--
-- THIS REVERSES PART OF `a_study_is_yours_to_change`, DELIBERATELY. That
-- migration widened writing to everybody, on an earlier instruction that
-- everybody should be able to keep their own edited copy. The owner has
-- narrowed it, which is theirs to decide and is the better shape for this app:
-- a study is teaching material, and the people who teach are Guides, Directors
-- and Executive Directors. An Explorer is being walked with, not preparing the
-- walk.
--
-- WHAT AN EXPLORER KEEPS. Everything they had for reading: every published
-- study in their church, and anything a Guide shares with them. `ls_read` and
-- `lessons_read` are untouched below, on purpose -- the narrowing is on the
-- three writing verbs only.
--
-- WHAT THE COPY-ON-FIRST-EDIT MACHINERY IS FOR NOW. It stays, and it still
-- matters: a Guide correcting a church sample gets their own copy rather than
-- rewriting it for the other forty Guides. Only the set of people who can
-- start that has changed.
--
-- THE SCREEN IS NOT THE BOUNDARY. components/LiveStudies.tsx stops drawing the
-- controls in the same commit, and that is a convenience -- somebody should not
-- be offered a button that will refuse them. These policies are what actually
-- refuses, and they refuse a request that never went near a screen.

begin;

-- One place that answers "may this person write teaching material?", so the six
-- policies below cannot drift apart from one another.
create or replace function public.may_write_studies()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.auth_role() in ('dm', 'admin', 'executive');
$$;

comment on function public.may_write_studies() is
  'Guides, Directors and Executive Directors write studies. Explorers read them.';

revoke all on function public.may_write_studies() from public, anon;
grant execute on function public.may_write_studies() to authenticated;

-- ---------------------------------------------------------------------------
-- Series
-- ---------------------------------------------------------------------------
drop policy if exists ls_write on public.lesson_series;
create policy ls_write on public.lesson_series
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and author_id = (select auth.uid())
    and public.may_write_studies()
    -- Publishing to the whole church stays with leadership and Guides, which
    -- is the rule that was already here.
    and ((not is_published) or public.manages_church(church_id) or public.auth_role() = 'dm')
  );

drop policy if exists ls_edit on public.lesson_series;
create policy ls_edit on public.lesson_series
  for update to authenticated
  using (
    (author_id = (select auth.uid()) and public.may_write_studies())
    or public.manages_church(church_id)
  )
  with check (
    church_id = public.my_church_id()
    and ((not is_published) or public.manages_church(church_id) or public.auth_role() = 'dm')
  );

drop policy if exists ls_drop on public.lesson_series;
create policy ls_drop on public.lesson_series
  for delete to authenticated
  using (
    public.manages_church(church_id)
    or (author_id = (select auth.uid()) and public.may_write_studies())
  );

-- ---------------------------------------------------------------------------
-- The studies inside them
-- ---------------------------------------------------------------------------
drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and author_id = (select auth.uid())
    and public.may_write_studies()
    and exists (
      select 1 from public.lesson_series s
      where s.id = lessons.series_id
        and (s.author_id = (select auth.uid()) or public.manages_church(s.church_id))
    )
  );

drop policy if exists lessons_edit on public.lessons;
create policy lessons_edit on public.lessons
  for update to authenticated
  using (
    public.manages_church(church_id)
    or (author_id = (select auth.uid()) and public.may_write_studies())
  )
  with check (church_id = public.my_church_id());

drop policy if exists lessons_drop on public.lessons;
create policy lessons_drop on public.lessons
  for delete to authenticated
  using (
    public.manages_church(church_id)
    or (author_id = (select auth.uid()) and public.may_write_studies())
  );

commit;
