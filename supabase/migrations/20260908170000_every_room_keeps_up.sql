-- Every room keeps up, not just the ones that got there first.
--
-- ---------------------------------------------------------------------------
-- REPORTED AS: (a bug report)
--
-- WHAT WAS ALREADY RIGHT, because it is worth ruling out before adding
-- anything. Migration 20260902020000 publishes twenty-four tables and sets
-- replica identity full on them. The browser client authenticates its realtime
-- socket and re-authenticates on every heartbeat, so a token refresh an hour
-- in does not silently kill the stream. Checked in the installed library
-- rather than assumed: @supabase/supabase-js 2.112.3 wires the custom
-- accessToken callback into the realtime client, and realtime-js calls setAuth
-- again each time a heartbeat is sent.
--
-- So neither the socket nor the publication was the fault. The fault was
-- coverage, in two halves, and this migration is the half that lives in the
-- database.
--
-- EIGHTEEN TABLES WERE NEVER PUBLISHED. A screen watching any of them receives
-- nothing however correctly it subscribes, because Postgres never writes the
-- change to the replication stream in the first place. That covers the whole
-- of Cases (trials, statements, parties), safeguarding (reports and their
-- files), the guilds and their membership, the library's record and its blocks,
-- feedback, the discipline log, a Guide's private notes, profile changes, and
-- -- the one people would notice fastest -- pairing_media, which is every file
-- sent in a conversation. A photograph arrived in a chat and the other side
-- learned about it by reloading.
--
-- AND `messages` HAS THE WRONG REPLICA IDENTITY. It is the oldest published
-- table and the only one still on `default`, which was never revisited when
-- the rest were set to `full`. Inserts and updates are unaffected, so the fault
-- is narrow: a DELETE carries only the primary key, so a subscriber filtering
-- on `pairing_id` never matches the row and a deleted message stays on screen.
-- Every other published table has been `full` since 20260902020000; this brings
-- the one that carries the most traffic into line with them.
--
-- WHAT IS DELIBERATELY LEFT OFF, and this is a correction rather than a
-- decision. The first version of this migration published the safeguarding
-- tables too -- reports, trials and their statements, the discipline log, the
-- security audit, a Guide's private notes -- on the reasoning that realtime
-- runs the same row level security as a SELECT, so it widens nothing.
--
-- That reasoning is true and it is not the rule this repository already had.
-- tests/the-screen-keeps-up.mjs asserts those tables are NOT published, in as
-- many words: the safeguarding record is the last place to widen a surface for
-- a convenience nobody asked for. The gate caught it. The decision stands, and
-- it costs the Cases room, the safeguarding queue and the security audit their
-- live updates -- three screens that still need a reload, which is the right
-- trade and is written down here so the next person does not re-argue it.
--
-- WHAT PUBLISHING DOES NOT DO. It does not widen who may read anything.
-- Realtime evaluates the same row level security policies as a SELECT, per
-- subscriber, so an event is delivered only to somebody who could already have
-- read that row by asking for it. Publishing a sensitive table -- the
-- discipline log, the security audit, a trial statement -- adds a delivery path
-- for people who already have one, and adds nothing for anybody else.
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  t text;
  -- The tables a screen watches and could not hear from.
  newly_watched text[] := array[
    'pairing_media',          -- files sent in a conversation
    'follow_ups',             -- already published; listed so the set reads whole
    'guilds',                 -- the Guild Room's own membership
    'guild_members',
    'feedback',               -- the inbox a Director works from
    'library_activity',       -- who shared what, and the record of it
    'library_blocks',
    'material_hides',         -- a shelf tidied on one device, seen on another
    'profile_changes',        -- a name or a photograph changing
    'churches',               -- the church's own name
    'blog_views'              -- the reader count under a post
  ];
begin
  foreach t in array newly_watched loop
    -- Idempotent, the same as the migration this extends: adding a table to
    -- the array later must not fail on the ones already published.
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

-- The oldest published table, brought into line with every other one. Without
-- this a deleted message carries only its id, so a subscription filtered by
-- pairing_id cannot tell whether the deletion was in this conversation.
alter table public.messages replica identity full;

commit;
