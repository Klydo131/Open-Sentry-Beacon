-- A suspension closes the live connection and the file store too.
--
-- ---------------------------------------------------------------------------
-- WHAT 20260923164500 LEFT OPEN, found while checking its own claim. That
-- migration refuses a suspended account on every request to the data API, and
-- taught the five helpers most policies are built on to ask about suspension.
-- But the live connection (Realtime) and the file store (Storage) do not go
-- through the data API's door. They evaluate row security directly -- and most
-- read rules on the tables Realtime broadcasts are built on OTHER helpers:
-- in_pairing, in_trial, may_handle_report, in_report, can_read_material and
-- more, which check approval and not suspension. in_trial, for one, asks
-- may_sit_on_trial, which checks `is_approved` and nothing else.
--
-- So a Director suspended while the Cases room was open would have gone on
-- receiving new report messages and hearing statements over the socket they
-- already had, until their access token lapsed -- up to an hour -- and could
-- have fetched report evidence from the file store for as long.
-- 20260909100000 put those tables on the wire on the reasoning that Realtime
-- applies the same read rules as a SELECT. It does; the rules never asked.
--
-- MEASURED, in transactions that were discarded, reading every broadcast
-- table a signed-in person may read, plus the file store, as one Director:
--
--     not suspended, before this         397 rows in 40 places
--     not suspended, after this          the same 397, place for place
--     suspended, before this              47 rows in 8 places -- reports
--                                         among them
--     suspended, after this                0
--
-- WHY ONE RESTRICTIVE RULE RATHER THAN TEACHING THIRTY HELPERS. A restrictive
-- policy is ANDed with every permissive one on its table, so this is one line
-- per table that holds whatever the other rules say, including rules written
-- next year by somebody who has never heard of suspension. Teaching each
-- helper would be thirty edits, each one a chance to change who can see what
-- for people who are NOT suspended; this cannot, because for them it is true.
--
-- WHAT IT COSTS. `(select private.i_am_not_suspended())` is evaluated once per
-- statement, not once per row -- the subquery has nothing to correlate with,
-- so the planner runs it as an init plan -- and it is one primary-key lookup.
--
-- SCOPE, deliberately. Every table in the realtime publication at the time
-- this runs (which a fresh database built from these migrations shares), and
-- storage.objects. Tables that are not broadcast are already covered by the
-- data API's check, which is the only way to reach them.
--
-- A TABLE PUT ON THE WIRE LATER needs the same line.
-- tests/a-suspension-is-immediate.mjs refuses a later migration that adds a
-- table to the publication without it.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

/** True unless the caller is signed in AND suspended. Signed out is true: the
 *  anonymous role has its own, far narrower rules, and this one is not for it. */
create or replace function private.i_am_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.suspended_at is not null
  );
$$;

revoke all on function private.i_am_not_suspended() from public, anon;
grant execute on function private.i_am_not_suspended() to authenticated, service_role;

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('drop policy if exists a_suspended_account_sees_nothing on %I.%I', t.schemaname, t.tablename);
    execute format(
      'create policy a_suspended_account_sees_nothing on %I.%I as restrictive for select to authenticated '
      'using ((select private.i_am_not_suspended()))',
      t.schemaname, t.tablename);
  end loop;
end
$$;

-- The file store: reading AND writing, so a suspended account can neither
-- fetch report evidence nor keep uploading to a pairing.
drop policy if exists a_suspended_account_sees_nothing on storage.objects;
create policy a_suspended_account_sees_nothing on storage.objects
  as restrictive for all to authenticated
  using ((select private.i_am_not_suspended()))
  with check ((select private.i_am_not_suspended()));

commit;
