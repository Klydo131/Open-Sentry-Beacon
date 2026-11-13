-- You can take a resource off YOUR shelf without taking it off everybody's.
--
-- THE ASK.
--
-- Adding was already open to everybody -- migration 20260901090000 widened it
-- to Explorers. Removing was not, and could not simply be widened, because the
-- library is one shared shelf: a Guide pressing Remove on a link the church
-- added would take it off sixteen other people's shelves, and the person who
-- pressed it would have no idea they had done that.
--
-- This is the same answer the lesson studies got, for the same reason. A shared
-- resource somebody else added is hidden for you alone. One you added yourself
-- is really deleted, because it is yours.
--
-- A TABLE HERE, NOT A COLUMN, and the difference from lesson_series is worth a
-- sentence. A study is copied when you change it, so the copy already needs a
-- row and the hide could ride along on it. A link has nothing to copy -- there
-- is no private version of a URL -- so the only fact to record is "not on my
-- shelf", and a row per person per link is exactly that fact and nothing else.

create table if not exists public.material_hides (
  material_id uuid not null references public.materials (id) on delete cascade,
  user_id     uuid not null references public.profiles  (id) on delete cascade,
  hidden_at   timestamptz not null default now(),
  primary key (material_id, user_id)
);

comment on table public.material_hides is
  'One row per person per resource they have taken off their own shelf. The resource itself is untouched.';

alter table public.material_hides enable row level security;

drop policy if exists mh_read  on public.material_hides;
drop policy if exists mh_write on public.material_hides;
drop policy if exists mh_drop  on public.material_hides;

-- YOUR OWN ROWS AND NOBODY ELSE'S, in all three directions. Who has hidden what
-- is not a thing the church needs to know, and a list of which links a person
-- quietly took off their shelf would be a small surveillance feature nobody
-- asked for.
create policy mh_read on public.material_hides
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy mh_write on public.material_hides
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Undo. Putting a resource back is the same act as never having hidden it.
create policy mh_drop on public.material_hides
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.material_hides to authenticated;
