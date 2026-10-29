-- Feedback lets a deleted account go, and says itself who handled it, when.
--
-- ---------------------------------------------------------------------------
-- FOUND BY THE AUDIT OF 29 OCTOBER 2026, asked for by the owner: "Audit right
-- now, see if there are any exploits in the updates and fix it." Four faults
-- in 20261028130000_feedback_is_reviewed_and_handed_on, fixed here rather than
-- there because that file has been public since 28 October and a church may
-- have run it already.
--
-- 1. DELETING A MEMBER WHO HAD SENT FEEDBACK FAILED. `feedback.author_id`
--    lets go of a deleted account (on delete set null), which the database
--    does as an UPDATE. The trigger that keeps what was sent refused it, as a
--    change of author, so the whole deletion was refused: a Director removing
--    somebody, an account deleting itself, a church honouring a request to be
--    forgotten. Anybody who wanted to be impossible to remove had only to send
--    one piece of feedback. Proved against a database built from nothing
--    before this fix; supabase/tests/feedback-is-reviewed-and-handed-on.sql
--    now deletes such a member.
--
-- 2. DELETING A REVIEWER WOULD HAVE RE-SIGNED THEIR WRITE-UP.
--    `feedback_review.reviewed_by` lets go the same way, and the trigger that
--    stamps who wrote a review stamped the person doing the deleting. A write-
--    up is now re-stamped only when what it says changes.
--
-- 3. WHO HANDLED IT AND WHEN WERE A BROWSER'S TO SAY. A Director could close
--    feedback in another Director's name (handled_by), or set when its status
--    last moved (status_at, handled_at) to any time. They are the database's
--    now: the signed-in person and the moment the status moves.
--
-- 4. A WRITE-UP COULD BE MOVED onto other feedback, or into another church the
--    Director also leads. What it is about is fixed once written.
--
-- Nothing else changes: what was sent still cannot be rewritten, and new
-- feedback still starts as Received.
-- ---------------------------------------------------------------------------

begin;

create or replace function private.feedback_keeps_its_words()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  -- What was sent stays as it was sent. The one change allowed is the
  -- database letting go of an account that has been deleted: the database
  -- does that as the table's owner, never as somebody signed in, so a
  -- Director still cannot take the sender's name off their feedback.
  if new.message is distinct from old.message
    or new.category is distinct from old.category
    or new.contact is distinct from old.contact
    or new.page is distinct from old.page
    or new.build is distinct from old.build
    or (new.author_id is distinct from old.author_id
        and (new.author_id is not null or current_user = 'authenticated'))
    or new.church_id is distinct from old.church_id
    or new.client_id is distinct from old.client_id
    or new.created_at is distinct from old.created_at then
    raise exception 'What somebody sent cannot be changed; change its status instead.'
      using errcode = '42501';
  end if;

  -- An older copy of the app marks handled_at alone: carry the status with it.
  if new.status is not distinct from old.status
    and new.handled_at is distinct from old.handled_at then
    new.status := case when new.handled_at is null then 'reviewing' else 'done' end;
  end if;

  if new.status is distinct from old.status then
    -- When, and by whom, are the database's to say.
    new.status_at := now();
    if new.status in ('done', 'wont_do') then
      new.handled_at := now();
      new.handled_by := coalesce((select auth.uid()), new.handled_by);
    else
      new.handled_at := null;
      new.handled_by := null;
    end if;
  else
    new.status_at := old.status_at;
    new.handled_at := old.handled_at;
    -- Only the database clears who handled it, when that account is deleted.
    if new.handled_by is not null or current_user = 'authenticated' then
      new.handled_by := old.handled_by;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.feedback_review_stamp()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.reviewed_by := (select auth.uid());
    new.updated_at := now();
    return new;
  end if;

  if new.feedback_id is distinct from old.feedback_id
    or new.church_id is distinct from old.church_id then
    raise exception 'A write-up stays with the feedback it is about.'
      using errcode = '42501';
  end if;

  if new.summary is distinct from old.summary
    or new.done_when is distinct from old.done_when
    or new.route is distinct from old.route
    or new.given_to is distinct from old.given_to
    or new.note is distinct from old.note then
    new.reviewed_by := (select auth.uid());
    new.updated_at := now();
  else
    -- Nothing it says changed: whoever wrote it still did, unless their
    -- account is being deleted, which the database alone does.
    new.updated_at := old.updated_at;
    if new.reviewed_by is not null or current_user = 'authenticated' then
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.feedback_review_stamp()    from public, anon, authenticated;
revoke all on function private.feedback_keeps_its_words() from public, anon, authenticated;

commit;
