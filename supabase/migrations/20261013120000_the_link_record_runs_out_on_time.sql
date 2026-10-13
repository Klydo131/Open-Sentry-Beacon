-- The record of shared links runs out on time, not on the next share.
--
-- THE PROMISE. The privacy notice tells every member: "The record of shared
-- links: 30 days, then deleted automatically." private.prune_library_activity()
-- (20260901090000_the_library_belongs_to_everybody) does the deleting, and it
-- was called on write, so that nothing had to be scheduled.
--
-- WHY THAT WAS NOT ENOUGH. Pruning on write holds only while people keep
-- sharing. On the live church, read on 13 October 2026, 21 records were older
-- than 30 days and the oldest was 41, because no new link had arrived to prune
-- them. A promise to members cannot depend on somebody else's next action.
--
-- WHAT THIS DOES. Prunes once now, so the promise is true from the moment this
-- is applied, and then every day at a minute nobody else is using, as the
-- invitation passwords' expiry already does (20260929100000). Scheduling by
-- name replaces a job of the same name, so running this again adds nothing.
-- The prune on write stays: it costs nothing and covers a day's gap.

begin;

select private.prune_library_activity();

select cron.schedule(
  'link-record-runs-out',
  '43 3 * * *',
  'select private.prune_library_activity()'
);

commit;
