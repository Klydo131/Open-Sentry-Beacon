-- The Cases room and the safeguarding queue keep up too.
--
-- ---------------------------------------------------------------------------
-- THE OWNER'S DECISION, asked for in these words..
--
-- This reverses the rule that migration 20260908180000 restored, and the
-- history is worth leaving legible rather than tidying away: these tables were
-- published, dropped when the verify gate pointed out that a standing decision
-- said otherwise, and are published again now because the person whose
-- decision it is has made a different one. That is not churn, it is the rule
-- changing hands. The reasoning behind the old rule is preserved in
-- 20260908180000 so nobody has to reconstruct it.
--
-- WHY IT IS SAFE, checked against the live policies rather than assumed. Every
-- one of these tables has row level security on, with a read policy narrower
-- than "signed in":
--
--   reports, report_files   an approved admin or executive OF THAT CHURCH
--   trials                  in_trial(id)  -- only a party to that hearing
--   trial_statements        in_trial(trial_id)
--   trial_parties           in_trial(trial_id)
--   discipline_log          leads_church(church_id)
--
-- Realtime evaluates those same policies per subscriber, so an event reaches
-- only somebody who could already have read the row by asking for it. Nobody
-- gains sight of a report, a hearing or a discipline entry who did not have it
-- a moment ago; what changes is that they no longer have to reload to find out.
--
-- REPLICA IDENTITY FULL IS NOT OPTIONAL HERE. Every one of those policies
-- decides on a column that is not the primary key -- church_id, trial_id. On
-- the default replica identity an UPDATE or DELETE carries the key alone, the
-- policy has nothing to test, and the event is dropped. A half-published table
-- is worse than an unpublished one: it works for inserts and silently does not
-- for anything else.
--
-- STILL DELIBERATELY OFF THE WIRE, because they were not part of the request:
-- `security_audit_events` and `seeker_notes`. The security audit is a
-- Director's own review screen and a Guide's private notes are nobody else's
-- to watch change. Both still reload, and tests/every-room-keeps-up.mjs names
-- them so they do not read as forgotten.
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  t text;
  now_live text[] := array[
    'reports',            -- somebody reported something and it must not wait
    'report_files',       -- the evidence attached to it
    'trials',             -- the Cases room, opened and closed
    'trial_statements',   -- several people speaking into one hearing at once
    'trial_parties',      -- and who is party to it
    'discipline_log'      -- the record a leader watches while it is written
  ];
begin
  foreach t in array now_live loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    -- See above: without this the policies cannot be evaluated on an update.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end
$$;

commit;
