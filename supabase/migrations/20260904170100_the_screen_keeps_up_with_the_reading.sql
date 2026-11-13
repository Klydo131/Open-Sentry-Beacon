-- The progress bar keeps up too.
--
-- `lesson_reads` is new (20260904170000) and a table outside the
-- `supabase_realtime` publication is a table whose changes no screen ever
-- hears about. A Director watching an Explorer's bar would have seen it move
-- only on a manual reload, which for a number that changes while you are
-- looking at it is the same as not working.
--
-- THE WHOLE LIST IS RESTATED, not just the new row, and that is on purpose:
-- `tests/the-screen-keeps-up.mjs` reads the NEWEST migration matching
-- `the_screen_keeps_up` and holds it against every KEEP_UP_* set in
-- lib/live/keep-up.ts. A migration here that named only the new table would
-- make that test believe the other twenty had been dropped.
--
-- The loop below is unchanged and already idempotent, so the twenty tables
-- already published are skipped and only `lesson_reads` is added.

do $$
declare
  t text;
  -- The tables somebody is looking at while somebody else changes them.
  watched text[] := array[
    'announcements',        -- the church's notices
    'blog_posts',           -- what the church is writing
    'prayer_requests',      -- the prayer wall, and a Guide's own list
    'materials',            -- the library shelf
    'material_shares',      -- what has been shared with whom
    'lesson_series',        -- Lesson studies
    'lessons',
    'lesson_files',
    'lesson_assignments',
    'meetings',             -- appointments, and their Waiting/Confirmed state
    'profiles',             -- approvals, names, who is waiting
    'pairings',             -- who walks with whom
    'pairing_requests',
    'recommendations',      -- a name put forward
    'notifications',        -- the bell in the header
    'guild_activity_posts', -- the Guild Room
    'guild_activity_amens',
    'guide_room_messages',
    'invites',              -- the Invitations list during a launch
    'follow_ups',
    'journey_events',       -- where somebody has reached
    'lesson_reads'          -- how far through a study somebody has got
  ];
begin
  foreach t in array watched loop
    -- Idempotent: re-running this migration, or adding a table to the array
    -- later, must not fail on the ones already published.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    execute format('alter table public.%I replica identity full', t);
  end loop;
end
$$;
