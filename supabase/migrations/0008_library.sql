-- The church library, and what a Guide shares from it.
--
-- LINKS, NOT FILES, AND ON PURPOSE. A resource here is a title and a URL. The
-- app also has an on-device library (lib/localMedia.ts) which keeps files in the
-- browser that added them and never uploads them — a real privacy property, and
-- one that cannot move a file between two people. A Guide who "shares" a local
-- file gives an Explorer a title and nothing to play.
--
-- So the thing that crosses devices is the thing that travels on its own: a
-- link. Uploading files to object storage is a later, deliberate decision with
-- a quota attached — video exhausts a free tier fast — and shipping it by
-- accident inside a sharing feature would be the wrong way to make it.
--
-- THE RECURSION THIS AVOIDS. The obvious shape is: materials readable if a row
-- in material_shares points at me, and material_shares readable if I am in the
-- pairing. Written as direct subqueries those two policies re-enter each other,
-- Postgres refuses the read outright with "infinite recursion detected in policy
-- for relation material_shares", and both screens die at once. That is not
-- hypothetical — it happened on the sibling deployment. Every cross-table test
-- below goes through a SECURITY DEFINER helper instead.

begin;

create type material_kind as enum ('link', 'video', 'audio', 'pdf', 'image');

create table if not exists public.materials (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  added_by     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  description  text check (description is null or length(description) <= 2000),
  kind         material_kind not null default 'link',
  external_url text not null check (external_url ~* '^https?://'),
  -- Published means "in the church library, visible to its Guides". A Guide's
  -- own unpublished item is a private bookmark until they choose otherwise.
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.material_shares (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  pairing_id  uuid not null references public.pairings (id) on delete cascade,
  shared_by   uuid not null references public.profiles (id) on delete cascade,
  note        text check (note is null or length(note) <= 1000),
  created_at  timestamptz not null default now(),
  unique (material_id, pairing_id)
);

create index if not exists materials_church_idx on public.materials (church_id, created_at desc);
create index if not exists shares_pairing_idx   on public.material_shares (pairing_id, created_at desc);

alter table public.materials       enable row level security;
alter table public.material_shares enable row level security;

-- Am I a party to this pairing? Definer, so reading pairings here does not
-- re-enter the pairings policy.
create or replace function public.in_pairing(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from pairings
    where id = p and (dm_id = auth.uid() or ds_id = auth.uid())
  );
$$;

-- May I see this resource? Mine, or my church's library, or something shared
-- into a pairing I am part of.
create or replace function public.can_read_material(m uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from materials x
    where x.id = m
      and (
        x.added_by = auth.uid()
        or (x.is_published and x.church_id = public.my_church_id() and public.auth_role() in ('dm','admin','executive'))
        or exists (
          select 1 from material_shares s
          where s.material_id = x.id and public.in_pairing(s.pairing_id)
        )
      )
  );
$$;

revoke all on function public.in_pairing(uuid)          from anon;
revoke all on function public.can_read_material(uuid)   from anon;
grant execute on function public.in_pairing(uuid)        to authenticated;
grant execute on function public.can_read_material(uuid) to authenticated;

drop policy if exists materials_read   on public.materials;
drop policy if exists materials_create on public.materials;
drop policy if exists materials_edit   on public.materials;
drop policy if exists materials_drop   on public.materials;

create policy materials_read on public.materials
  for select to authenticated using (public.can_read_material(id));

-- Guides and leaders add to the library. An Explorer does not: the library is
-- what the church offers, not a place anybody can post into.
create policy materials_create on public.materials
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and church_id = public.my_church_id()
    and public.auth_role() in ('dm','admin','executive')
  );

create policy materials_edit on public.materials
  for update to authenticated
  using (added_by = (select auth.uid()) or public.manages_church(church_id))
  with check (added_by = (select auth.uid()) or public.manages_church(church_id));

create policy materials_drop on public.materials
  for delete to authenticated
  using (added_by = (select auth.uid()) or public.manages_church(church_id));

drop policy if exists shares_read   on public.material_shares;
drop policy if exists shares_create on public.material_shares;
drop policy if exists shares_drop   on public.material_shares;

-- Both people in the pairing see what was shared into it. Nobody else does —
-- including a Director, who is shown that a Guide is active, never what they
-- sent to whom.
create policy shares_read on public.material_shares
  for select to authenticated using (public.in_pairing(pairing_id));

-- Only the Guide shares, only into their own pairing, only as themselves.
create policy shares_create on public.material_shares
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and exists (select 1 from public.pairings p where p.id = pairing_id and p.dm_id = (select auth.uid()))
  );

create policy shares_drop on public.material_shares
  for delete to authenticated
  using (shared_by = (select auth.uid()));

commit;
