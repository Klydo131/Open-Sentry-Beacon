-- Two doors that compared a column with itself, and so checked nothing.
--
-- ---------------------------------------------------------------------------
-- THE TRAP. Inside a subquery, an unqualified column name binds to the NEAREST
-- relation that has a column of that name -- not to the row the policy is
-- about. So in
--
--     exists (select 1 from public.trial_parties tp
--              where tp.trial_id = trial_id and ...)
--
-- `trial_id` is tp.trial_id, because trial_parties has one. The line reads as
-- "a party to THIS hearing" and means "a party to ANY hearing". Postgres says
-- so itself: the live policy, deparsed from pg_policies, reads
-- `tp.trial_id = tp.trial_id`. Nothing warns, because it is perfectly valid SQL.
--
-- Found by asking the live database, on 23 September 2026, for every policy
-- whose deparsed text contains `x.col = x.col`. Exactly two came back.
--
-- 1. trial_statements_speak (20260916130000_the_sidelines_are_not_the_bench).
--    That migration took the voice away from people watching a hearing and gave
--    it to the people called to one. Because of the trap, being called to ANY
--    hearing gave a voice in EVERY hearing the person could see -- and leaders
--    can see every hearing in their church. Proven in a transaction that was
--    discarded: a Director who was a witness in one hearing and only watching
--    another could post into the one they were only watching. With the column
--    qualified: refused (42501) there, still allowed where they were called.
--    Not "anyone into every hearing" -- trials' own read rule limits it to
--    hearings the person can already see -- but exactly the thing the earlier
--    migration existed to stop.
--
-- 2. lesson_guide_shares_write (20260908033953_guide_only_lesson_planning).
--    `series.church_id = church_id` and `guide.church_id = church_id` are both
--    tautologies, so the only church check left was manages_church() on the
--    share's own church_id -- which the person inserting chooses. As written, a
--    Director could share ANOTHER church's unpublished series, or name a Guide
--    from another church, by labelling the share with their own church.
--
--    AND IT NEVER WORKED ANYWAY. Every insert fails with 42P17, infinite
--    recursion: this policy reads lesson_series, whose read rule reads
--    lesson_guide_shares, whose read rule is evaluated again. So the feature is
--    dormant -- no screen uses it and the table has no rows -- and the hole was
--    never reachable. It is fixed rather than left because the day somebody
--    breaks the recursion, the hole opens.
--
--    The series check moves into a SECURITY DEFINER function, which reads
--    lesson_series without row security and so ends the recursion. It answers
--    one yes/no question about a series id and a church id the caller already
--    supplied, so it reveals nothing a Director could not already ask.
--
-- DRY RUN, before this was applied, in a transaction that was discarded:
--     share your own church's draft with every Guide     ALLOWED
--     share another church's draft                       denied 42501
--     name a Guide from another church                   denied 42501
--
-- tests/a-door-compares-the-right-things.mjs keeps the shape from coming back:
-- in the latest definition of every policy, `x.col = col` is always the trap.
-- ---------------------------------------------------------------------------

begin;

-- 1 ------------------------------------------------------------------------
drop policy if exists trial_statements_speak on public.trial_statements;
create policy trial_statements_speak on public.trial_statements
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.trials t
      where t.id = trial_statements.trial_id and t.status = 'open'
    )
    and (
      -- The one who accepted the case. They run the hearing.
      exists (
        select 1 from public.trials t
        where t.id = trial_statements.trial_id and t.head_judge_id = (select auth.uid())
      )
      -- Or somebody actually called to THIS hearing. An observer is absent from
      -- the list on purpose; the qualified column is the whole of this fix.
      or exists (
        select 1 from public.trial_parties tp
        where tp.trial_id = trial_statements.trial_id
          and tp.person_id = (select auth.uid())
          and tp.part in ('accused', 'reporter', 'witness')
      )
    )
  );

-- 2 ------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.unpublished_series_in(p_series uuid, p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_series s
    where s.id = p_series and s.church_id = p_church and not s.is_published
  );
$$;

revoke all on function private.unpublished_series_in(uuid, uuid) from public, anon;
grant execute on function private.unpublished_series_in(uuid, uuid) to authenticated, service_role;

drop policy if exists lesson_guide_shares_write on public.lesson_guide_shares;
create policy lesson_guide_shares_write on public.lesson_guide_shares
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and public.manages_church(church_id)
    and private.unpublished_series_in(lesson_guide_shares.series_id, lesson_guide_shares.church_id)
    and (
      guide_id is null
      or exists (
        select 1
        from public.profiles as guide
        where guide.id = lesson_guide_shares.guide_id
          and guide.church_id = lesson_guide_shares.church_id
          and guide.role = 'dm'
          and guide.is_approved
          and guide.suspended_at is null
      )
    )
  );

commit;
