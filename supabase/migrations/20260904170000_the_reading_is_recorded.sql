-- An Explorer marks a study read, and their leaders can see how far they have got.
--
-- THE ASK, in the owner's words.
--
-- WHAT DID NOT EXIST. `lesson_assignments` records that a Guide handed a whole
-- SERIES to a pairing, and carries one `completed_at` for the series. Nothing
-- anywhere recorded a single lesson being read, so there was no numerator for a
-- progress bar and no way to answer "has this person actually opened anything?"
-- The demo half of the app has had a bar since the beginning; the live half,
-- the one real people use, had none.
--
-- THE HONEST NUMERATOR, AND WHY IT IS A BUTTON. The obvious implementation is
-- to mark a lesson read when it appears on screen. That would be a lie here,
-- and a particularly bad one: `SeriesBody` renders EVERY lesson of an open
-- series expanded at once, so opening a six-lesson series would instantly
-- record six lessons read. A Director looking at that bar would be reading a
-- measurement of one tap. So the Explorer says so themselves, per lesson, and
-- the bar means what it appears to mean.
--
-- WHO MAY WRITE ONE. Only the person it is about. Not the Guide, not a
-- Director, not an Executive Director -- if a leader could tick lessons off on
-- somebody else's behalf, the number stops being evidence of anything. This is
-- the whole point of the feature, so it is a policy rather than a convention.
--
-- WHO MAY READ ONE. The Explorer, the Guide walking with them, and the
-- Directors and Executive Directors of that Explorer's church. Note the church
-- is the READER'S church, not the church that wrote the lesson: the sample
-- studies are seeded material that no local church authored, and scoping by the
-- lesson's church would have hidden exactly the sample progress that was asked
-- for.
--
-- UNMARKING IS ALLOWED, for the person themselves only. Somebody who taps the
-- wrong row should be able to put it back rather than live with a number they
-- know is wrong; a progress bar nobody can correct is a progress bar people
-- learn to ignore.

begin;

create table if not exists public.lesson_reads (
  lesson_id uuid not null references public.lessons  (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

comment on table public.lesson_reads is
  'One row per person per lesson they have marked as read. Written only by the person it is about.';

-- Reading somebody''s progress asks the same question from three screens, so it
-- is asked in one place. SECURITY DEFINER because it looks at `profiles` to
-- find the member''s church, and the caller is not entitled to read that row
-- directly; it returns only a boolean about one named member.
create or replace function public.may_see_reading(member uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select member = (select auth.uid())
      or public.is_paired_with(member)
      or exists (
           select 1 from public.profiles p
           where p.id = member and public.manages_church(p.church_id)
         );
$$;

comment on function public.may_see_reading(uuid) is
  'The member themselves, the Guide walking with them, and the Directors of their church.';

revoke all on function public.may_see_reading(uuid) from public, anon;
grant execute on function public.may_see_reading(uuid) to authenticated;

create index if not exists lesson_reads_user_idx on public.lesson_reads (user_id);

alter table public.lesson_reads enable row level security;

drop policy if exists lr_read  on public.lesson_reads;
drop policy if exists lr_write on public.lesson_reads;
drop policy if exists lr_drop  on public.lesson_reads;

create policy lr_read on public.lesson_reads
  for select to authenticated
  using (public.may_see_reading(user_id));

-- NOT `using (...)` -- an insert has no existing row. The check is what stops a
-- Director recording reading on somebody else's behalf.
create policy lr_write on public.lesson_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy lr_drop on public.lesson_reads
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No update policy, deliberately. There is nothing in the row to change: a read
-- either happened or was taken back, and both are covered above.

grant select, insert, delete on public.lesson_reads to authenticated;

commit;
