-- A study page carries a version, so two devices cannot erase each other.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS PREVENTS, FOUND BEFORE IT SHIPPED. `study_docs` holds one merged
-- snapshot per page rather than an append-only log, which keeps a 500 MB free
-- tier safe from a study room that grows without a compaction job. The cost of
-- a snapshot is read-merge-write: two devices that read the same row and both
-- write will keep the second write and lose the first edit. Yjs merges cleanly
-- so nothing becomes corrupt -- a sentence somebody wrote simply is not there,
-- which for study notes is worse than an error.
--
-- The first attempt at a guard used `updated_at` as the token: read it, and
-- write only if it still matches. Measured against this database, that is not
-- safe. Postgres keeps timestamptz to the microsecond and JavaScript's
-- toISOString() stops at the millisecond, so the value a browser sends back is
-- a truncation of the value it was given:
--
--   matching on the microsecond value PostgREST returned   -> 1 row
--   matching on the same value truncated to milliseconds   -> 0 rows
--
-- A guard that matches nothing turns every save into a retry and then into a
-- refusal. And a timestamp chosen by the client is the wrong kind of token
-- anyway: a device with a skewed clock can stamp a row in the past, and two
-- devices can pick the same millisecond.
--
-- An integer has no precision to lose and no clock to be wrong about. The
-- writer increments it and conditions on the value it read; the loser of a race
-- reads again and merges onto what it finds.
-- ---------------------------------------------------------------------------

alter table public.study_docs
  add column if not exists version integer not null default 0;

-- `updated_at` stays, and its job narrows to the one it is good at: telling a
-- Guide that their Explorer has been working. It is no longer load-bearing for
-- correctness, so its precision no longer matters.
comment on column public.study_docs.version is
  'Optimistic concurrency token. A writer conditions on the value it read and '
  'increments it; a writer that matches zero rows lost a race and must re-read '
  'and merge rather than overwrite.';
