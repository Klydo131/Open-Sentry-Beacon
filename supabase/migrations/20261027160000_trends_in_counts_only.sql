-- Trends in counts only: one view of weekly numbers per church, with any number
-- under 5 hidden, and one role that can read that view and nothing else.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 27 October 2026: "We can use Rust for Data security and Python
-- for data analysis." The costed plan put Python on the owner's own computer,
-- reading counts that cannot name anyone, and the owner chose it. Python
-- cannot run inside the hosted database (PL/pgSQL is its only language) or in
-- Supabase's functions (TypeScript and WebAssembly), so the analysis is a
-- program on a computer, and this is what it may read. tools/trends/ is the
-- program.
--
-- THE PRIVACY RULE COMES FIRST, AND IT LIVES HERE. In a church of 63 people a
-- small number can name somebody: "2 Explorers stopped coming in October" may
-- point at two known children. So:
--
--   * COUNTS, NEVER ROWS. Every column is a church, a week or a number. No
--     name, no message, no id of a person.
--   * ANY COUNT FROM 1 TO 4 IS NULL, read as "fewer than 5". 0 stays 0: that
--     nothing happened names nobody.
--   * ONE ROLE, ONE VIEW. `beacon_trends` may use the `trends` schema and read
--     `trends.weekly`. It cannot read a table, call a private function, or be
--     reached through the data API: it is not one of the roles the API's
--     sign-in switches to, and `trends` is not a schema the API publishes.
--   * IT CANNOT SIGN IN UNTIL THE OWNER SAYS SO. The role is made without a
--     login. The owner gives it one, with a password that never goes in a file
--     here (tools/trends/README.md):
--       alter role beacon_trends with login password '<a long password>';
--     and takes it away again with `alter role beacon_trends nologin`.
--
-- HOW IT COUNTS. Weeks start on Monday at 00:00 UTC, from the week the church
-- was created to this week, and every week is listed, so a quiet week reads 0
-- rather than being missing. A conversation, a lesson and a meeting belong to
-- the church of the pair's Guide. The view runs with its owner's rights over
-- the tables (that is what lets it count rows the role cannot read) and is a
-- security barrier, so nothing the reader adds to a query runs before the
-- counting.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists trends;
revoke all on schema trends from public;

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'beacon_trends') then
    create role beacon_trends nologin noinherit;
  end if;
end
$role$;

create or replace view trends.weekly with (security_barrier = true) as
with weeks as (
  select c.id as church_id, c.name as church, w.week
    from public.churches as c,
         generate_series(date_trunc('week', c.created_at at time zone 'UTC'),
                         date_trunc('week', now() at time zone 'UTC'),
                         interval '1 week') as w(week)
),
guide_church as (
  select pr.id as pairing_id, g.church_id
    from public.pairings as pr
    join public.profiles as g on g.id = pr.dm_id
),
events as (
  select p.church_id, date_trunc('week', p.approved_at at time zone 'UTC') as week,
         'joined' as what, p.id::text as thing
    from public.profiles as p
   where p.approved_at is not null and p.church_id is not null
  union all
  select gc.church_id, date_trunc('week', pr.created_at at time zone 'UTC'), 'pairs_started', pr.id::text
    from public.pairings as pr join guide_church as gc on gc.pairing_id = pr.id
  union all
  select gc.church_id, date_trunc('week', m.created_at at time zone 'UTC'), 'messages', m.id::text
    from public.messages as m join guide_church as gc on gc.pairing_id = m.pairing_id
   where m.deleted_at is null
  union all
  select gc.church_id, date_trunc('week', m.created_at at time zone 'UTC'), 'pairs_talking', m.pairing_id::text
    from public.messages as m join guide_church as gc on gc.pairing_id = m.pairing_id
   where m.deleted_at is null
  union all
  select gc.church_id, date_trunc('week', la.completed_at at time zone 'UTC'), 'lessons_finished', la.id::text
    from public.lesson_assignments as la join guide_church as gc on gc.pairing_id = la.pairing_id
   where la.completed_at is not null
  union all
  select l.church_id, date_trunc('week', lr.read_at at time zone 'UTC'), 'lessons_read',
         lr.lesson_id::text || ':' || lr.user_id::text
    from public.lesson_reads as lr join public.lessons as l on l.id = lr.lesson_id
   where lr.read_at is not null
  union all
  select pq.church_id, date_trunc('week', pq.created_at at time zone 'UTC'), 'prayer_requests', pq.id::text
    from public.prayer_requests as pq
  union all
  select mt.church_id, date_trunc('week', mt.starts_at at time zone 'UTC'), 'meetings', mt.id::text
    from public.meetings as mt
  union all
  select r.church_id, date_trunc('week', r.created_at at time zone 'UTC'), 'reports_raised', r.id::text
    from public.reports as r
  union all
  select r.church_id, date_trunc('week', r.decided_at at time zone 'UTC'), 'reports_closed', r.id::text
    from public.reports as r
   where r.decided_at is not null
),
counted as (
  select w.church_id, w.church, w.week,
         count(distinct e.thing) filter (where e.what = 'joined')           as joined,
         count(distinct e.thing) filter (where e.what = 'pairs_started')    as pairs_started,
         count(distinct e.thing) filter (where e.what = 'pairs_talking')    as pairs_talking,
         count(distinct e.thing) filter (where e.what = 'messages')         as messages,
         count(distinct e.thing) filter (where e.what = 'lessons_finished') as lessons_finished,
         count(distinct e.thing) filter (where e.what = 'lessons_read')     as lessons_read,
         count(distinct e.thing) filter (where e.what = 'prayer_requests')  as prayer_requests,
         count(distinct e.thing) filter (where e.what = 'meetings')         as meetings,
         count(distinct e.thing) filter (where e.what = 'reports_raised')   as reports_raised,
         count(distinct e.thing) filter (where e.what = 'reports_closed')   as reports_closed
    from weeks as w
    left join events as e on e.church_id = w.church_id and e.week = w.week
   group by w.church_id, w.church, w.week
)
select church_id,
       church,
       week::date as week_starting,
       case when joined           between 1 and 4 then null else joined           end as people_joined,
       case when pairs_started    between 1 and 4 then null else pairs_started    end as pairs_started,
       case when pairs_talking    between 1 and 4 then null else pairs_talking    end as pairs_talking,
       case when messages         between 1 and 4 then null else messages         end as messages,
       case when lessons_finished between 1 and 4 then null else lessons_finished end as lessons_finished,
       case when lessons_read     between 1 and 4 then null else lessons_read     end as lessons_read,
       case when prayer_requests  between 1 and 4 then null else prayer_requests  end as prayer_requests,
       case when meetings         between 1 and 4 then null else meetings         end as meetings,
       case when reports_raised   between 1 and 4 then null else reports_raised   end as reports_raised,
       case when reports_closed   between 1 and 4 then null else reports_closed   end as reports_closed
  from counted;

comment on view trends.weekly is
  'Weekly counts per church for tools/trends. Counts from 1 to 4 are null ("fewer than 5"). Weeks start Monday 00:00 UTC. No person is named.';

revoke all on trends.weekly from public, anon, authenticated;
grant usage on schema trends to beacon_trends;
grant select on trends.weekly to beacon_trends;

commit;
