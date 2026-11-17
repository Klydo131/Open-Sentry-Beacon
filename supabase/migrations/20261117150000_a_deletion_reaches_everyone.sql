-- A deletion reaches everyone it was shared with.
--
-- ---------------------------------------------------------------------------
-- REPORTED 17 NOVEMBER 2026: a study, a lesson or a resource a Guide or the
-- Director deleted stayed on their Explorer's screen. Proved against a
-- database built from nothing (supabase/tests/a-deletion-reaches-everyone.sql)
-- before anything here was written. Two of the causes are in the database:
--
-- 1. NOBODY COULD TAKE A STUDY BACK. lesson_assignments was granted DELETE but
--    had no delete policy, and row-level security with no policy refuses every
--    row silently. So "delete" on somebody else's study only hid it from the
--    person who pressed it, and the Explorer kept it.
--
-- 2. A GUIDE'S COPY NEVER REACHED THEIR EXPLORER. A Guide who changes or
--    deletes a lesson in somebody else's study works on their own private copy
--    (a study is yours to change, 20260904090000). The Explorer could not read
--    that copy and kept reading the original, deleted lessons and all.
--
-- The third cause is in the app (lib/live/data.ts): a delete the rules refuse
-- removes zero rows and raises no error, and the app called that "deleted".
-- ---------------------------------------------------------------------------

begin;

-- 1. Taking a study back: whoever gave it, the pairing's Guide, or leadership
--    of the church the study belongs to. Never the Explorer, never another Guide.
drop policy if exists la_drop on public.lesson_assignments;
create policy la_drop on public.lesson_assignments
  for delete to authenticated
  using (
    assigned_by = (select auth.uid())
    or exists (select 1 from public.pairings p
                where p.id = lesson_assignments.pairing_id and p.dm_id = (select auth.uid()))
    or exists (select 1 from public.lesson_series s
                where s.id = lesson_assignments.series_id and public.manages_church(s.church_id))
  );

-- 2a. An Explorer reads what was given to them, whoever wrote it. Asked
--     through a definer function so the series rule does not run the
--     assignments rule row by row.
create or replace function private.series_given_to_me()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select la.series_id from public.lesson_assignments la
   where la.pairing_id in (select private.my_pairing_ids());
$$;
revoke all on function private.series_given_to_me() from public, anon;
grant execute on function private.series_given_to_me() to authenticated;

drop policy if exists ls_read on public.lesson_series;
create policy ls_read on public.lesson_series
  for select to authenticated
  using (
    (is_published and church_id = public.my_church_id())
    or author_id = (select auth.uid())
    or public.manages_church(church_id)
    or (
      public.auth_role() = 'dm'
      and exists (
        select 1
        from public.lesson_guide_shares as share
        where share.series_id = lesson_series.id
          and share.church_id = lesson_series.church_id
          and (share.guide_id is null or share.guide_id = (select auth.uid()))
      )
    )
    or id in (select private.series_given_to_me())
  );

-- 2b. When a Guide makes their own copy of a study they had given out, their
--     Explorers are moved onto the copy, so what the Guide changes or deletes
--     is what the Explorer sees. Only the copy's author, only their own
--     pairings, and only from the study the copy was made from.
create or replace function public.give_my_copy_to_my_explorers(p_copy uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_from uuid;
  v_moved integer;
begin
  select s.copied_from into v_from
    from public.lesson_series s
   where s.id = p_copy and s.author_id = (select auth.uid());
  if v_from is null then
    return 0;
  end if;
  update public.lesson_assignments la
     set series_id = p_copy
   where la.series_id = v_from
     and la.pairing_id in (select p.id from public.pairings p where p.dm_id = (select auth.uid()))
     and not exists (select 1 from public.lesson_assignments x
                      where x.pairing_id = la.pairing_id and x.series_id = p_copy);
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;
revoke all on function public.give_my_copy_to_my_explorers(uuid) from public, anon;
grant execute on function public.give_my_copy_to_my_explorers(uuid) to authenticated;

comment on function public.give_my_copy_to_my_explorers(uuid) is
  'Moves the caller''s own pairings from a study onto the caller''s copy of it, so a Guide''s changes and deletions reach their Explorer.';

commit;
