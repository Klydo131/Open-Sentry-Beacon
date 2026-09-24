-- BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.
--
-- Applied to the live database as `pocket_owner_defaults_to_the_session` and never committed,
-- so a fresh install's pocket_apps.owner_id had no default.
--
-- Everything below the rule is the applied text, byte for byte: its md5 was
-- checked against supabase_migrations.schema_migrations before it was
-- committed. It is already in the live database, which records migrations by
-- the time they ran, so this file changes nothing there. It exists so that a
-- fresh database built from this repository is the same database.
--
-- NAMED FOR WHERE IT RAN, not for when. Live ran it between
-- a_notification_goes_where_it_is_about and who_may_take_a_seat, and this
-- filename puts it in that same place. Named first by its ledger time
-- (20260916033358), it sorted before the file that creates pocket_apps and a
-- fresh install stopped here.
-- ---------------------------------------------------------------------------
alter table public.pocket_apps
  alter column owner_id set default auth.uid();