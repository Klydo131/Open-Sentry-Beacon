-- Live updates everywhere, not just in a conversation.
--
-- WHAT WAS WRONG. One table was published for realtime: `messages`. So a
-- conversation updated itself and every other screen in the app did not. Post a
-- notice, approve somebody, add a study, share a resource, answer a prayer --
-- and the person looking at that screen saw the old version until they pulled
-- to refresh. In a demonstration, in front of a room, that reads as the app
-- being broken, and there is no way to explain it that sounds like anything
-- else.
--
-- The app half of this was already written and only ever pointed at one table.
-- The database half is here: a table that is not in the publication cannot
-- produce an event, so no amount of client code would have helped.
--
-- RLS STILL DECIDES WHO SEES WHAT. Publishing a table does not publish its
-- rows. Realtime evaluates the same policies as a SELECT, per subscriber, so a
-- Guide is told about a change to a row they could already have read and about
-- nothing else. That is why every table below has RLS on -- checked, not
-- assumed, in tests/the-screen-keeps-up.mjs.
--
-- REPLICA IDENTITY FULL, AND WHY IT IS NOT OPTIONAL HERE. Postgres logs only
-- the primary key of a changed row by default. Every policy in this project
-- decides by `church_id`, `author_id` or a pairing -- none of which is the
-- primary key -- so on an UPDATE or a DELETE, Realtime would have no column to
-- test the policy against and would drop the event rather than risk leaking it.
-- FULL logs the whole row so the policy can be evaluated. It costs write-ahead
-- log volume, which for a congregation of this size is not a number worth
-- worrying about.
--
-- WHAT IS DELIBERATELY LEFT OUT. discipline_log, reports, trials,
-- trial_statements, trial_parties, security_audit_events, seeker_notes and
-- profile_changes. Not because RLS would fail on them -- it would hold -- but
-- because no screen needs them to update live, and the safeguarding record is
-- the last place to widen a surface for a convenience nobody asked for.

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
    'journey_events'        -- where somebody has reached
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
