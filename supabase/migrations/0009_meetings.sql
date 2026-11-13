-- Meetings: a time the two of them agreed on.
--
-- The one piece of the relationship that happens off the app. Everything else
-- here — conversation, library, prayer — supports a person meeting another
-- person, so the app's job is to remember when and where and then get out of
-- the way.
--
-- EITHER SIDE MAY PROPOSE, EITHER SIDE MAY CANCEL. Not a Guide-only feature: an
-- Explorer with a Thursday free should be able to say so without waiting to be
-- asked. Both are in the same pairing and the policy treats them the same.
--
-- WHAT A DIRECTOR SEES. That a meeting exists in their church, and when. Never
-- the notes, because a note is something one of the two wrote for the other,
-- and a Director reading it turns a private arrangement into a supervised one.
-- That is enforced by a view rather than by hoping the screen omits the column.

begin;

create type meeting_mode   as enum ('online', 'in_person');
create type meeting_status as enum ('proposed', 'confirmed', 'cancelled', 'done');

create table if not exists public.meetings (
  id         uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings (id) on delete cascade,
  church_id  uuid not null references public.churches (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 200),
  starts_at  timestamptz not null,
  mode       meeting_mode   not null default 'online',
  -- A place for in person, or a joining address for online. One field, because
  -- asking somebody to pick a category before typing where to meet is friction
  -- with nothing behind it.
  location   text check (location is null or length(location) <= 500),
  notes      text check (notes is null or length(notes) <= 2000),
  status     meeting_status not null default 'proposed',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists meetings_pairing_idx on public.meetings (pairing_id, starts_at desc);
create index if not exists meetings_church_idx  on public.meetings (church_id, starts_at desc);

alter table public.meetings enable row level security;

drop policy if exists meetings_read   on public.meetings;
drop policy if exists meetings_create on public.meetings;
drop policy if exists meetings_edit   on public.meetings;
drop policy if exists meetings_drop   on public.meetings;

-- The two people in it. in_pairing() is SECURITY DEFINER, so reading pairings
-- from inside this policy does not re-enter the pairings policy.
create policy meetings_read on public.meetings
  for select to authenticated using (public.in_pairing(pairing_id));

create policy meetings_create on public.meetings
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.in_pairing(pairing_id)
    and church_id = public.my_church_id()
  );

create policy meetings_edit on public.meetings
  for update to authenticated
  using (public.in_pairing(pairing_id))
  with check (public.in_pairing(pairing_id));

create policy meetings_drop on public.meetings
  for delete to authenticated using (public.in_pairing(pairing_id));

-- What a Director may know: that a meeting is happening, and when. No notes,
-- no location, no title — the three fields that carry what was said.
--
-- A function rather than a policy, for the same reason the prayer wall is one:
-- a policy grants whole ROWS, and a row here carries the notes. "Leaders see
-- the count but not the content" has to be true of the result, not of the
-- screen that renders it.
create or replace function public.church_meeting_summary()
returns table (starts_at timestamptz, mode meeting_mode, status meeting_status)
language sql stable security definer set search_path to 'public' as $$
  select m.starts_at, m.mode, m.status
  from meetings m
  where m.church_id = public.my_church_id()
    and public.manages_church(m.church_id)
  order by m.starts_at desc;
$$;

revoke all on function public.church_meeting_summary() from anon;
grant execute on function public.church_meeting_summary() to authenticated;

commit;
