-- Feedback that goes somewhere.
--
-- THE REPORT: 
--
-- Nothing was stuck. There was no feedback table, and `setFeedbackSink` is
-- never called anywhere in the app, so every message went to the DEFAULT sink
-- -- which honestly saves to the sender's own browser and says so. Each message
-- is sitting in `hope-beacon.feedback.local` on the phone of whoever wrote it,
-- has never crossed the network, and cannot be recovered centrally because it
-- was never centrally anywhere.
--
-- That design is right for the open-source default: a church cloning this has
-- no server on the first run, and a demo that silently drops feedback teaches
-- everybody that feedback is pointless. What was missing is the other half --
-- a real destination for a church that HAS a database, which this one does.
--
-- SO: a table, not an email. The built-in mailer sends about two messages an
-- hour for the whole project, so routing feedback through it would lose most of
-- it on any day worth hearing about. A row is durable, arrives instantly, and
-- can be read by the people who can act on it.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  -- WHO WROTE IT IS OPTIONAL, and nullable on purpose. Somebody reporting that
  -- a screen is confusing should not have to attach their name to it, and the
  -- contact field below is theirs to fill in or leave empty.
  author_id   uuid references public.profiles (id) on delete set null,
  category    text not null check (category in ('bug', 'idea', 'confusing', 'praise')),
  message     text not null check (length(btrim(message)) between 1 and 4000),
  contact     text check (contact is null or length(contact) <= 200),
  -- Which screen and which build, which is usually the whole of reproducing it.
  page        text check (page is null or length(page) <= 200),
  build       text check (build is null or length(build) <= 100),
  -- The client's own id, so a retry from a phone that lost signal cannot file
  -- the same message twice.
  client_id   text not null,
  created_at  timestamptz not null default now(),
  -- Marked when somebody has dealt with it, so a list of feedback is a queue
  -- rather than an ever-growing wall.
  handled_at  timestamptz,
  handled_by  uuid references public.profiles (id) on delete set null
);

create unique index if not exists feedback_one_per_client_id
  on public.feedback (church_id, client_id);

create index if not exists feedback_unhandled
  on public.feedback (church_id, created_at desc) where handled_at is null;

alter table public.feedback enable row level security;

drop policy if exists feedback_write   on public.feedback;
drop policy if exists feedback_read    on public.feedback;
drop policy if exists feedback_handle  on public.feedback;

-- ANYBODY IN THE CHURCH MAY SEND ONE. That is the whole point of a feedback
-- button, and the narrowest useful rule: it must be their own church, and if
-- they attach themselves it has to be as themselves.
create policy feedback_write on public.feedback
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and (author_id is null or author_id = (select auth.uid()))
  );

-- ONLY LEADERSHIP READS IT, including the messages sent anonymously. A member
-- being able to read what everybody else reported would make the honest
-- feedback stop immediately.
create policy feedback_read on public.feedback
  for select to authenticated
  using (public.manages_church(church_id));

create policy feedback_handle on public.feedback
  for update to authenticated
  using (public.manages_church(church_id))
  with check (public.manages_church(church_id));

-- NO DELETE POLICY, deliberately. Feedback a leader can quietly remove is
-- feedback nobody can rely on having been heard. Marking it handled is the
-- available action.

grant select, insert, update on public.feedback to authenticated;
