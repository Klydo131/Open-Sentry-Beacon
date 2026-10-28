-- Feedback is reviewed by a person, then handed on: fixed by the reviewer,
-- given to a developer, or given to an AI tool. The sender sees what happened.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 28 October 2026: "Make a feedback system where AI tools can
-- receive it, human checks it the feedback, then human can either fix it
-- manually through code or give the feedback to other developers or the one
-- who reviewed and recieved the feedback can use AI tools". The owner chose:
--   * who reviews: Directors and the Executive Director, who already read the
--     Feedback inbox (manages_church). Nobody new can see feedback.
--   * three ways out, all built in the app from the reviewer's write-up, never
--     from the member's own words (lib/feedback/hand-on.ts);
--   * the sender sees a status on their own feedback.
--
-- TWO TABLES, BECAUSE THE SENDER MAY READ THEIR OWN ROW. Row security decides
-- who reads a ROW, not which columns of it. The sender already reads their
-- own `feedback` row (20260904100100), so anything put on that row is theirs
-- to read. So:
--   * `feedback` gains what the sender is meant to see: a status, a short reply
--     and the version that fixed it;
--   * `feedback_review` holds what only reviewers see: the write-up for
--     developers and AI tools, what done looks like, who it was given to, and
--     a private note. Readable and writable by manages_church only.
--
-- WHAT WAS SAID CANNOT BE REWRITTEN. The existing update rule lets a reviewer
-- update the whole row, which included the member's message. A trigger now
-- refuses any change to what was sent (message, category, contact, page,
-- build, author, church, when): a reviewer changes the status, never the
-- record of what somebody told their church.
--
-- `handled_at` STAYS TRUE. It is what the inbox's index and older copies of
-- the app read. It now follows the status: set when feedback is done or will
-- not be done, cleared when it is open again. An older app that still writes
-- handled_at directly moves the status with it.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

alter table public.feedback
  add column if not exists status text not null default 'new',
  add column if not exists reply text,
  add column if not exists fixed_in text,
  add column if not exists status_at timestamptz;

alter table public.feedback drop constraint if exists feedback_status_known;
alter table public.feedback add constraint feedback_status_known
  check (status in ('new', 'reviewing', 'in_hand', 'done', 'wont_do'));
alter table public.feedback drop constraint if exists feedback_reply_short;
alter table public.feedback add constraint feedback_reply_short
  check (reply is null or length(reply) <= 1000);
alter table public.feedback drop constraint if exists feedback_fixed_in_short;
alter table public.feedback add constraint feedback_fixed_in_short
  check (fixed_in is null or length(fixed_in) <= 100);

-- What was already marked dealt with is done.
update public.feedback set status = 'done', status_at = handled_at
  where handled_at is not null and status = 'new';

create table if not exists public.feedback_review (
  feedback_id uuid primary key references public.feedback (id) on delete cascade,
  church_id   uuid not null references public.churches (id) on delete cascade,
  summary     text not null default '' check (length(summary) <= 4000),
  done_when   text not null default '' check (length(done_when) <= 1000),
  route       text check (route is null or route in ('me', 'developer', 'ai')),
  given_to    text not null default '' check (length(given_to) <= 120),
  note        text not null default '' check (length(note) <= 2000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.feedback_review enable row level security;

drop policy if exists feedback_review_read  on public.feedback_review;
drop policy if exists feedback_review_write on public.feedback_review;
drop policy if exists feedback_review_edit  on public.feedback_review;

create policy feedback_review_read on public.feedback_review
  for select to authenticated
  using (public.manages_church(church_id));

-- The review belongs to feedback from the same church, so a Director cannot
-- file a review against another church's feedback by naming its id.
create policy feedback_review_write on public.feedback_review
  for insert to authenticated
  with check (
    public.manages_church(church_id)
    and exists (select 1 from public.feedback f where f.id = feedback_id and f.church_id = feedback_review.church_id)
  );

create policy feedback_review_edit on public.feedback_review
  for update to authenticated
  using (public.manages_church(church_id))
  with check (
    public.manages_church(church_id)
    and exists (select 1 from public.feedback f where f.id = feedback_id and f.church_id = feedback_review.church_id)
  );

-- A suspended account sees nothing here either, as on every table the live
-- connection carries (20260923173000_a_suspension_reaches_the_socket_too).
drop policy if exists a_suspended_account_sees_nothing on public.feedback_review;
create policy a_suspended_account_sees_nothing on public.feedback_review
  as restrictive for all to authenticated
  using ((select private.i_am_not_suspended()))
  with check ((select private.i_am_not_suspended()));

-- No delete rule: a review is part of what happened to the feedback.
revoke all on public.feedback_review from anon;
grant select, insert, update on public.feedback_review to authenticated;

-- Who reviewed, and when, are the database's to say.
create or replace function private.feedback_review_stamp()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.reviewed_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists feedback_review_stamp on public.feedback_review;
create trigger feedback_review_stamp before insert or update on public.feedback_review
  for each row execute function private.feedback_review_stamp();

-- The record of what was said stays as it was said; the status follows the
-- reviewer, and handled_at follows the status.
create or replace function private.feedback_keeps_its_words()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.message is distinct from old.message
    or new.category is distinct from old.category
    or new.contact is distinct from old.contact
    or new.page is distinct from old.page
    or new.build is distinct from old.build
    or new.author_id is distinct from old.author_id
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
    new.status_at := now();
    if new.status in ('done', 'wont_do') then
      new.handled_at := coalesce(new.handled_at, now());
      new.handled_by := coalesce(new.handled_by, (select auth.uid()));
    else
      new.handled_at := null;
      new.handled_by := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists feedback_keeps_its_words on public.feedback;
create trigger feedback_keeps_its_words before update on public.feedback
  for each row execute function private.feedback_keeps_its_words();

-- A new message always starts as Received, whatever a client sends.
create or replace function private.feedback_starts_new()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.status := 'new';
  new.reply := null;
  new.fixed_in := null;
  new.status_at := null;
  new.handled_at := null;
  new.handled_by := null;
  return new;
end;
$$;
drop trigger if exists feedback_starts_new on public.feedback;
create trigger feedback_starts_new before insert on public.feedback
  for each row execute function private.feedback_starts_new();

-- Another reviewer's screen hears a review change, as it hears the feedback.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_review'
    ) then
    alter publication supabase_realtime add table public.feedback_review;
  end if;
end
$$;
alter table public.feedback_review replica identity full;

-- Trigger functions only: nobody calls them.
revoke all on function private.feedback_review_stamp()    from public, anon, authenticated;
revoke all on function private.feedback_keeps_its_words() from public, anon, authenticated;
revoke all on function private.feedback_starts_new()      from public, anon, authenticated;

commit;
