-- The safeguarding record does not travel over a socket.
--
-- ---------------------------------------------------------------------------
-- THIS IS A CORRECTION, and it is worth saying so plainly rather than dressing
-- it as a decision.
--
-- The first version of 20260908170000 published the safeguarding tables along
-- with everything else: reports and their files, trials and their statements
-- and parties, the discipline log, the security audit, and a Guide's private
-- notes. The reasoning was that realtime evaluates the same row level security
-- as a SELECT, so publishing a table adds a delivery path for people who
-- already have one and adds nothing for anybody else.
--
-- That reasoning is correct and it is not the rule this repository already had.
-- tests/the-screen-keeps-up.mjs has asserted since it was written that those
-- tables are NOT published, in as many words: the safeguarding record is the
-- last place to widen a surface for a convenience nobody asked for. and. are different questions, and the
-- earlier decision answered the second one. The verify gate caught the
-- contradiction before it shipped; it did not catch it before it was applied to
-- the live database, which is why this migration exists at all.
--
-- WHAT IT COSTS, named so nobody has to rediscover it. The Cases room, the
-- safeguarding queue and the security audit do not update on their own. Those
-- three screens still need a reload, and are listed as deliberate exemptions in
-- tests/every-room-keeps-up.mjs rather than left looking forgotten.
--
-- On a database built from these migrations in order, 20260908170000 never adds
-- these tables and this migration finds nothing to drop. It is written to be a
-- no-op there and a repair on the one database where the first version ran.
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  t text;
  keep_off text[] := array[
    'reports',
    'report_files',
    'trials',
    'trial_statements',
    'trial_parties',
    'discipline_log',
    'security_audit_events',
    'seeker_notes'
  ];
begin
  foreach t in array keep_off loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;

commit;
