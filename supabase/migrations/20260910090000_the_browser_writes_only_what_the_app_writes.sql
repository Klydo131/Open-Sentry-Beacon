-- The browser may write only the columns the app actually writes.
--
-- ---------------------------------------------------------------------------
-- FOUND BY AUDIT, AFTER THE SAME FAULT WAS FOUND IN THE CONVERSATION.
-- ---------------------------------------------------------------------------
--
-- Yesterday `messages_mark` turned out to be an UPDATE policy written for read
-- receipts that also let either person rewrite the other's words, because RLS is
-- ROW level and says nothing about columns. That is not a one-off; it is a
-- shape. This migration is the result of looking for every other instance of it.
--
-- The test applied to each: what does the app ACTUALLY write to this table, and
-- what does the policy PERMIT? Every gap below was confirmed against the live
-- database, not read off the schema.
--
-- PRAYER REQUESTS -- the one that matters.
--
--   policy: (ds_id = auth.uid() OR is_paired_with(ds_id))
--
-- It exists so a Guide can move the status to "praying". It also permitted,
-- proved by running it as a real Guide against a real request:
--
--   * REWRITING THE EXPLORER'S OWN WORDS. Somebody writes "please pray for my
--     mother" and their Guide can silently make it say something else.
--   * FLIPPING share_with_church TO TRUE, which publishes a private request to
--     the whole congregation. The app offers no such button, and RLS is the
--     boundary rather than the app.
--
-- lib/live/data.ts already states the rule this restores, one line above the
-- function that could not enforce it:
--
--     "Either side may move the status; only the author owns the words."
--
-- MEETINGS. Both people manage a meeting, which is the design. But after the
-- insert the app only ever writes `status`, while the policy permitted either
-- party to silently rewrite the time, the place and the JOINING LINK of a
-- meeting the other had already confirmed. docs/HANDBOOK.md calls a meeting
-- link "text one member types and another taps, which is the exact shape of an
-- attack"; swapping one after confirmation is that attack with the warning
-- removed.
--
-- NOTIFICATIONS and LESSON ASSIGNMENTS. The same shape with far less at stake:
-- the app writes `read_at` and `completed_at`, the policies permitted the whole
-- row. Fixed here because leaving a known instance of a fault "because it is
-- small" is how the next person learns the rule is optional.
--
-- WHY COLUMN GRANTS RATHER THAN BETTER POLICIES. RLS cannot express "only this
-- column"; column privileges can, and the two compose -- the policy still
-- decides WHICH ROWS, the grant decides WHICH COLUMNS. Anything narrower would
-- mean a definer function per field, which is the right answer for editing a
-- message and far too much machinery for a read receipt.

-- ---------------------------------------------------------------------------
-- PRAYER REQUESTS: the status moves, the words do not
-- ---------------------------------------------------------------------------
revoke update on public.prayer_requests from authenticated;
grant  update (status) on public.prayer_requests to authenticated;

-- ---------------------------------------------------------------------------
-- MEETINGS: confirm and cancel, not rewrite
-- ---------------------------------------------------------------------------
revoke update on public.meetings from authenticated;
grant  update (status) on public.meetings to authenticated;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS: the read receipt only
-- ---------------------------------------------------------------------------
revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- LESSON ASSIGNMENTS: ticking it off only
-- ---------------------------------------------------------------------------
revoke update on public.lesson_assignments from authenticated;
grant  update (completed_at) on public.lesson_assignments to authenticated;

-- ---------------------------------------------------------------------------
-- TWO TABLES ADDED YESTERDAY THAT KEPT A GRANT THEY NEVER NEEDED
-- ---------------------------------------------------------------------------
--
-- Supabase grants the browser roles full privileges on a new table in `public`
-- by default. Both of these are written ONLY by triggers and definer functions
-- running as the owner, and neither is exploitable today -- RLS with no write
-- policy refuses every write regardless of the grant. That is the safety net
-- holding, not the design being right, and a later policy added for some other
-- reason would land on top of a grant nobody meant to give.
--
-- message_revisions loses SELECT as well: it holds what a deleted message said,
-- and RLS is the only thing keeping it unreadable. Two locks, not one.
revoke all on public.message_revisions from authenticated, anon;
revoke insert, update, delete on public.guild_wall_pulse from authenticated, anon;
