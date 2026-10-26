-- Every table says who may reach it, and nobody may empty one.
--
-- ---------------------------------------------------------------------------
-- WHY. On 30 October 2026 Supabase stops opening new tables to the data API
-- by default (changelog: "Tables not exposed to Data and GraphQL API
-- automatically"). Hope Beacon's tables were opened to signed-in people by
-- that default and never by name, so on a project created after that date a
-- fresh install would build every table closed, and the app would answer
-- "permission denied" everywhere. Each church now runs its own project, so
-- every new church would have met it. Asked for on 26 October 2026, after the
-- week's security releases: "deep research and update our security".
--
-- WHAT THIS DOES, on an existing project and a new one alike:
--
--   1. Grants each table, BY NAME, exactly what signed-in people reach it
--      with today, read from the live database on 26 October 2026. Row-level
--      security still decides which rows; this decides whether the table can
--      be asked at all. A table not named here (the court room's locked
--      tables, giving, app_settings) stays closed and is reached only
--      through its checked functions.
--   2. Takes TRUNCATE, TRIGGER, REFERENCES and (on Postgres 17) MAINTAIN
--      from signed-in people and visitors on every table. The data API never
--      uses them; TRUNCATE empties a table without asking its row rules, and
--      MAINTAIN (vacuum, lock, reindex) came with the old open default.
--   3. Makes "closed" the default for any table created from now on, on
--      every project old or new, so a future table is reachable only when a
--      migration grants it by name (tests/every-table-says-who-may-reach-it.mjs).
--
-- Safe to run more than once, and changes nothing a signed-in person can do
-- through the app today.
-- ---------------------------------------------------------------------------

begin;

-- 1. By name.
grant select, insert, update, delete on public.activity_record       to authenticated;
grant select, insert, update, delete on public.announcements         to authenticated;
grant select, insert, update, delete on public.blog_audience         to authenticated;
grant select, insert, update, delete on public.blog_posts            to authenticated;
grant select, insert, update, delete on public.church_apps           to authenticated;
grant select, insert, update, delete on public.church_executives     to authenticated;
grant select, insert, update, delete on public.churches              to authenticated;
grant select                         on public.court_exhibits        to authenticated;
grant select                         on public.court_record          to authenticated;
grant select, insert, update, delete on public.discipline_log        to authenticated;
grant select, insert, update, delete on public.feedback              to authenticated;
grant select, insert, update, delete on public.follow_ups            to authenticated;
grant select, insert                 on public.guide_room_messages   to authenticated;
grant select, insert, update, delete on public.guild_members         to authenticated;
grant select                         on public.guild_wall_pulse      to authenticated;
grant select, insert, update, delete on public.guilds                to authenticated;
grant select, insert, update, delete on public.invites               to authenticated;
grant select, insert, update, delete on public.journey_events        to authenticated;
grant select, insert, delete         on public.lesson_assignments    to authenticated;
grant select, insert, update, delete on public.lesson_files          to authenticated;
grant select, insert, delete         on public.lesson_guide_shares   to authenticated;
grant select, insert, update, delete on public.lesson_reads          to authenticated;
grant select, insert, update, delete on public.lesson_series         to authenticated;
grant select, insert, update, delete on public.lessons               to authenticated;
grant select, insert, update, delete on public.material_hides        to authenticated;
grant select, insert, update, delete on public.material_shares       to authenticated;
grant select, delete                 on public.materials             to authenticated;
grant select, insert, delete         on public.meetings              to authenticated;
grant select                         on public.message_reactions     to authenticated;
grant select, delete                 on public.messages              to authenticated;
grant select, insert, delete         on public.notifications         to authenticated;
grant select, insert, update, delete on public.office_plans          to authenticated;
grant select, update, delete         on public.pairing_media         to authenticated;
grant select, insert, update, delete on public.pairing_requests      to authenticated;
grant select, insert, delete         on public.pairings              to authenticated;
grant select, insert, update, delete on public.pocket_apps           to authenticated;
grant select, delete                 on public.post_media            to authenticated;
grant select, insert, delete         on public.prayer_encouragements to authenticated;
grant select, delete                 on public.prayer_requests       to authenticated;
grant select, insert, update, delete on public.profile_changes       to authenticated;
grant select, insert, delete         on public.profiles              to authenticated;
grant select, insert, update, delete on public.push_subscriptions    to authenticated;
grant select, insert, update, delete on public.recommendations       to authenticated;
grant select, insert, update, delete on public.report_files          to authenticated;
grant select, insert, update, delete on public.report_messages       to authenticated;
grant select, insert, update, delete on public.reports               to authenticated;
grant select, insert, update, delete on public.seeker_notes          to authenticated;
grant select, insert, update, delete on public.study_blobs           to authenticated;
grant select, insert, update, delete on public.study_docs            to authenticated;
grant select, insert, update, delete on public.trial_parties         to authenticated;
grant select                         on public.trial_statements      to authenticated;
grant select, insert, update, delete on public.trials                to authenticated;

-- 2. Nobody empties, triggers on or references a table through the data API.
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
do $maintain$
begin
  -- MAINTAIN exists from Postgres 17; an older project has nothing to take.
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from authenticated, anon';
  end if;
end
$maintain$;

-- 3. Closed by default from now on.
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on tables from anon;

commit;
