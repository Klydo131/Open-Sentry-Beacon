-- Two things a Guide could not do, and both were gaps rather than decisions.
--
-- 1. ASK TO WALK WITH SOMEBODY. A Guide could recommend a NEW person for an
--    invitation (migration 0016), and could do nothing at all about an Explorer
--    who is already in the church and waiting for a Guide. The only route was
--    to catch a Director in person and ask. So the one screen that shows who is
--    unpaired belongs to the Director, and the people who actually have room to
--    carry somebody had no way to say so.
--
--    A REQUEST, NEVER A PAIRING. This table records that a Guide asked. It does
--    not create the pairing and it cannot: a Director decides who walks with
--    whom, and the cap of five is enforced on `pairings` where it always was.
--    Anything else would let a Guide pair themselves by writing a row.
--
-- 2. TALK TO THE OTHER GUIDES. Guides carry the whole thing and had nobody to
--    ask. Every conversation surface in this app is one Guide with one Explorer,
--    which is right for that relationship and leaves a Guide with a hard week
--    entirely alone.
--
--    A ROOM, NOT PRIVATE MESSAGES, and this is a safeguarding decision rather
--    than a shortcut. Guide-to-Guide direct messages would be a new private
--    channel with no oversight, in an app whose whole design is that private
--    conversation happens in exactly one place and is reportable. The Guides'
--    room is read by every Guide and by leadership, which makes it accountable
--    by construction. If one-to-one is wanted later it should be built the way
--    pairings were, with reporting attached, not by loosening this.
--
-- NOBODY IS ADDED TO EITHER BY BEING MENTIONED. Both are scoped to one church
-- and to roles, in the database, so a hand-made request cannot reach another
-- congregation's room or another Guide's requests.

begin;

-- ---------------------------------------------------------------------------
-- 1. A Guide asks to walk with somebody
-- ---------------------------------------------------------------------------
create table if not exists public.pairing_requests (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  guide_id    uuid not null references public.profiles (id) on delete cascade,
  ds_id       uuid not null references public.profiles (id) on delete cascade,
  note        text not null default '' check (length(note) <= 500),
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'declined')),
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- One open ask per Guide per person. Asking twice is not more asking, and a
  -- Director reading the same request four times learns nothing the first one
  -- did not tell them.
  unique (guide_id, ds_id, status)
);

create index if not exists pairing_requests_church_idx
  on public.pairing_requests (church_id, status, created_at desc);

alter table public.pairing_requests enable row level security;

drop policy if exists pairing_requests_read on public.pairing_requests;
create policy pairing_requests_read on public.pairing_requests
  for select to authenticated
  using (
    guide_id = (select auth.uid())
    or public.leads_church(church_id)
  );

-- A Guide asks, as themselves, in their own church, and only about somebody
-- who is actually an Explorer there. The Explorer is never told: being asked
-- for and not chosen is not a thing anybody should have to read about
-- themselves.
drop policy if exists pairing_requests_write on public.pairing_requests;
create policy pairing_requests_write on public.pairing_requests
  for insert to authenticated
  with check (
    guide_id = (select auth.uid())
    and church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved and me.suspended_at is null
        and me.role = 'dm'
    )
    and exists (
      select 1 from public.profiles them
      where them.id = ds_id
        and them.church_id = public.my_church_id()
        and them.role = 'ds'
        and them.is_approved
    )
  );

-- Leadership decides. A Guide may withdraw their own ask, which is why the
-- delete policy is wider than the update one.
drop policy if exists pairing_requests_decide on public.pairing_requests;
create policy pairing_requests_decide on public.pairing_requests
  for update to authenticated
  using (public.leads_church(church_id))
  with check (public.leads_church(church_id));

drop policy if exists pairing_requests_drop on public.pairing_requests;
create policy pairing_requests_drop on public.pairing_requests
  for delete to authenticated
  using (guide_id = (select auth.uid()) or public.leads_church(church_id));

-- ---------------------------------------------------------------------------
-- 2. The Guides' room
-- ---------------------------------------------------------------------------
create table if not exists public.guide_room_messages (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists guide_room_church_idx
  on public.guide_room_messages (church_id, created_at desc);

alter table public.guide_room_messages enable row level security;

-- WHO IS IN THE ROOM: Guides and leadership of this church. Explorers are not,
-- and that is the point of it existing at all.
create or replace function public.in_guide_room(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.church_id = c
      and p.is_approved
      and p.suspended_at is null
      and p.role in ('dm', 'admin', 'executive')
  );
$$;

revoke all on function public.in_guide_room(uuid) from public, anon;
grant execute on function public.in_guide_room(uuid) to authenticated;

drop policy if exists guide_room_read on public.guide_room_messages;
create policy guide_room_read on public.guide_room_messages
  for select to authenticated
  using (public.in_guide_room(church_id));

drop policy if exists guide_room_write on public.guide_room_messages;
create policy guide_room_write on public.guide_room_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and church_id = public.my_church_id()
    and public.in_guide_room(church_id)
  );

-- Take back your own words; leadership can take back anybody's. A room the
-- whole guild reads needs an off switch that does not depend on the author
-- being available, for the same reason the blogs and the notices do.
drop policy if exists guide_room_drop on public.guide_room_messages;
create policy guide_room_drop on public.guide_room_messages
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.leads_church(church_id));

commit;
