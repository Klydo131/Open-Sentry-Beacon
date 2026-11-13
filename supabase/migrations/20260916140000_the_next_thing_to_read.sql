-- The next thing to read, said by name.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS. Twenty-one lessons are published in this church and two have
-- been read. Nothing is broken in the library: the pairings are made, nobody is
-- unpaired, nine materials are shared. What was missing is the sentence telling
-- an Explorer what to do when they open the app today. My Journey opened on four
-- folders and none of them opened with a next step, so twenty-one lessons sat
-- behind a folder called Study and waited to be gone looking for.
--
-- WHAT THIS ANSWERS, AND WHAT IT DELIBERATELY DOES NOT. It returns the next
-- unread study by name, and how many of the church's studies this person has
-- read. It does NOT return their journey stage. The stage is a note the church
-- keeps about a person and a seeker never sees it -- lib/types.ts says so, it is
-- a safeguarding decision rather than an oversight, and revealing it is a
-- product change for the owner to make rather than a side effect of adding a
-- progress number.
--
-- SO THERE ARE TWO TRUTHS AND THEY STAY SEPARATE. The journey bar already shows
-- what the GUIDE has decided about somebody. This adds what the EXPLORER has
-- actually done. Before it, an Explorer could read every study in the church and
-- watch nothing move until their Guide changed their mind about them.
--
-- ORDERING IS THE SHELF'S OWN. Series by when they were created, lessons by
-- `position` within a series -- the order a Guide arranged them in, not
-- alphabetical and not newest-first. "Next" means next on the shelf.
-- ---------------------------------------------------------------------------

create or replace function public.my_study_progress()
returns table (
  read_count   bigint,
  total_count  bigint,
  next_id        uuid,
  next_title     text,
  next_series    text,
  -- The SERIES it lives in, because that is what the shelf opens. A lesson is
  -- inside an accordion, so "one tap to the thing" means opening the right
  -- series rather than handing the screen an id it cannot act on.
  next_series_id uuid
)
language sql stable security definer set search_path to 'public'
as $$
  with mine as (
    select l.id, l.title, s.title as series_title, s.id as series_id,
           s.created_at as series_at, l.position
      from public.lessons l
      join public.lesson_series s on s.id = l.series_id
      -- PUBLISHED AND NOT HIDDEN, which is what an Explorer can open at all. A
      -- "next" that pointed at a draft would be an instruction to open a door
      -- that is locked.
     where s.is_published
       and not coalesce(s.is_hidden, false)
       and s.church_id = (
         select church_id from public.profiles where id = (select auth.uid())
       )
  ),
  unread as (
    select m.* from mine m
     where not exists (
       select 1 from public.lesson_reads r
        where r.lesson_id = m.id and r.user_id = (select auth.uid())
     )
     order by m.series_at, m.position, m.title
     limit 1
  )
  select
    (select count(*) from mine m
      where exists (select 1 from public.lesson_reads r
                     where r.lesson_id = m.id and r.user_id = (select auth.uid()))),
    (select count(*) from mine),
    (select id from unread),
    (select title from unread),
    (select series_title from unread),
    (select series_id from unread);
$$;

revoke all on function public.my_study_progress() from public, anon;
grant execute on function public.my_study_progress() to authenticated;
