-- An appointment changes only through its answer.
--
-- The app proposes an appointment with an insert, and every answer after that
-- (confirm, decline, call off) goes through public.answer_meeting(), which
-- checks who may say what and records who said it. A change of time or place
-- is a new proposal plus calling the old one off (components/LiveMeetings.tsx).
-- Nothing in the app edits or deletes an appointment row directly, so the
-- table no longer accepts either from a signed-in browser. An appointment
-- still goes with its pairing or its church (on delete cascade).

begin;

drop policy if exists meetings_edit on public.meetings;
drop policy if exists meetings_drop on public.meetings;
revoke update, delete on public.meetings from authenticated;

commit;
