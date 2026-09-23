-- BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.
--
-- Applied to the live database as `the_screen_keeps_up_with_prayer_encouragements` and never committed,
-- so prayer encouragements were never on the realtime publication of a fresh
-- install.
--
-- Everything below the rule is the applied text, byte for byte: its md5 was
-- checked against supabase_migrations.schema_migrations before it was
-- committed. It is already in the live database, which records migrations by
-- the time they ran, so this file changes nothing there. It exists so that a
-- fresh database built from this repository is the same database.
-- ---------------------------------------------------------------------------
-- Prayer encouragements update while the Guide and Explorer are looking at
-- the same private thread. This restates the full watched-table list because
-- tests/the-screen-keeps-up.mjs validates the newest realtime migration as the
-- complete publication contract.

do $$
declare
  t text;
  watched text[] := array[
    'announcements',
    'blog_posts',
    'prayer_requests',
    'prayer_encouragements',
    'materials',
    'material_shares',
    'lesson_series',
    'lessons',
    'lesson_files',
    'lesson_assignments',
    'meetings',
    'profiles',
    'pairings',
    'pairing_requests',
    'recommendations',
    'notifications',
    'guild_activity_posts',
    'guild_activity_amens',
    'guide_room_messages',
    'invites',
    'follow_ups',
    'journey_events',
    'lesson_reads'
  ];
begin
  foreach t in array watched loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    execute format('alter table public.%I replica identity full', t);
  end loop;
end
$$;