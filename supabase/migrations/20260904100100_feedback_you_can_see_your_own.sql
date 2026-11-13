-- You can read your own feedback back.
--
-- FOUND BY PROBING THE PREVIOUS MIGRATION, not by reading it. The read policy
-- was leadership-only, which is right about other people's messages and has a
-- consequence that is easy to miss: `insert ... returning` needs SELECT on the
-- row it returns, so a member sending feedback through any client that asks for
-- the row back is refused by the READ policy while the WRITE policy is happy.
--
-- The app's own sink does a plain insert and was never affected. The next
-- person to add `.select()` to that call would have been, and the failure would
-- have read as "feedback is broken" with a write policy that plainly allows it.
--
-- Letting somebody see their own message is also just correct: it is theirs,
-- they wrote it, and a future "here is what you have sent" screen should not
-- need a new rule. Anonymous messages have no author to match, so they stay
-- visible to leadership alone, which is the point of sending one anonymously.
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback
  for select to authenticated
  using (
    public.manages_church(church_id)
    or author_id = (select auth.uid())
  );
