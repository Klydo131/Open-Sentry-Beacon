-- The Guild Room wall keeps up, WITHOUT handing over who wrote what.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM, AND WHY THE OBVIOUS FIX IS THE ONE THING THAT MUST NOT HAPPEN.
-- ---------------------------------------------------------------------------
--
-- The Guild Room is the one screen where several people look at the same wall
-- at once, so it is the screen where a stale view is most obvious -- and it was
-- the last room in the app that still needed a manual refresh.
--
-- `guild_activity_posts` and `guild_activity_amens` are published to realtime
-- and have row level security on with NO read policy, so every event is
-- dropped. The obvious repair is a read policy on the posts. That repair would
-- be a safeguarding regression, and it is worth being exact about why.
--
-- The wall is PSEUDONYMOUS. `private.list_guild_activity` never returns
-- `author_id`; it computes a label:
--
--     'You'  ·  'A Guide'  ·  'A fellow Explorer'
--
-- and `guild_activity_amens.person_id` is exposed only as a count and a
-- "did I amen this" boolean. So a member reads the wall without learning which
-- of the people in their guild wrote which post, or who agreed with it.
--
-- Realtime delivers THE ROW, not the function's output. A read policy on either
-- table would put `author_id` and `person_id` on the wire, and any member could
-- map every post and every amen back to a person. That is a bigger change than
-- "the wall updates", and it is not the change that was asked for.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES INSTEAD: WATCH A SIGNAL THAT CARRIES NO IDENTITY.
-- ---------------------------------------------------------------------------
--
-- One row per guild saying only "this wall changed, and this is the nth time".
-- No author, no body, no post id, nothing about a person. The browser learns
-- that there is something new and re-asks `list_guild_activity`, which redacts
-- exactly as it always has. The raw row never leaves the database.
--
-- This is the same shape the Library record already uses -- watch the cause,
-- not the ledger -- and the reason the old headstone in lib/live/keep-up.ts
-- said there was nothing safe to watch is simply that this table did not exist
-- yet. It does now.
--
-- WHAT A MEMBER CAN LEARN FROM THE PULSE, STATED PLAINLY RATHER THAN GLOSSED.
-- That their guild's wall changed, and when. They can already read that wall,
-- and the feed already shows amen counts, so this reveals nothing the redacted
-- feed does not. It does not say who acted, and it is readable only by an
-- approved, unsuspended member of that guild -- the same test the feed itself
-- applies, reused rather than restated so the two cannot drift apart.

-- ---------------------------------------------------------------------------
-- THE PULSE
-- ---------------------------------------------------------------------------

create table if not exists public.guild_wall_pulse (
  guild_id   uuid primary key references public.guilds(id) on delete cascade,
  -- Monotonic so an update is always a real change. A timestamp alone can
  -- repeat within a transaction, and realtime would then carry an event that
  -- looks identical to the last one.
  revision   bigint      not null default 0,
  changed_at timestamptz not null default now()
);

comment on table public.guild_wall_pulse is
  'One row per guild: that its wall changed, never who changed it. Exists so '
  'the Guild Room can update live without a read policy on the posts, which '
  'would expose the author column the feed hides behind a label.';

-- Every guild that already exists gets a row, so the first post is an UPDATE
-- rather than an INSERT and subscribers see a consistent shape from day one.
insert into public.guild_wall_pulse (guild_id)
select id from public.guilds
on conflict (guild_id) do nothing;

-- A new guild starts with a pulse too, or its wall is deaf until the first post.
create or replace function private.guild_wall_pulse_seed()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.guild_wall_pulse (guild_id) values (new.id)
  on conflict (guild_id) do nothing;
  return null;
end;
$$;

drop trigger if exists guild_wall_pulse_seed on public.guilds;
create trigger guild_wall_pulse_seed
after insert on public.guilds
for each row execute function private.guild_wall_pulse_seed();

-- ---------------------------------------------------------------------------
-- WHAT BUMPS IT
-- ---------------------------------------------------------------------------

create or replace function private.bump_guild_wall(p_guild uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.guild_wall_pulse as pulse (guild_id, revision, changed_at)
  values (p_guild, 1, now())
  on conflict (guild_id) do update
    set revision = pulse.revision + 1, changed_at = now();
$$;

-- SECURITY DEFINER on the triggers as well as on bump_guild_wall. Every write
-- to these tables today happens inside a definer function, so the trigger would
-- run as the owner anyway -- but. is the kind of thing that changes, and
-- a trigger that silently stops writing because the caller changed is a wall
-- that silently stops updating.
create or replace function private.guild_wall_pulse_from_post()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform private.bump_guild_wall(coalesce(new.guild_id, old.guild_id));
  return null;
end;
$$;

drop trigger if exists guild_wall_pulse_posts on public.guild_activity_posts;
create trigger guild_wall_pulse_posts
after insert or update or delete on public.guild_activity_posts
for each row execute function private.guild_wall_pulse_from_post();

-- An amen changes the count the wall shows, so it has to move the wall too.
-- The guild is not on the amen row; it is reached through the post.
create or replace function private.guild_wall_pulse_from_amen()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_guild uuid;
begin
  select guild_id into v_guild
  from public.guild_activity_posts
  where id = coalesce(new.post_id, old.post_id);

  -- Null when the post itself is being deleted and its amens are cascading
  -- away underneath it. The post's own trigger has already bumped the pulse,
  -- so there is nothing to do and nothing to warn about.
  if v_guild is not null then
    perform private.bump_guild_wall(v_guild);
  end if;
  return null;
end;
$$;

drop trigger if exists guild_wall_pulse_amens on public.guild_activity_amens;
create trigger guild_wall_pulse_amens
after insert or delete on public.guild_activity_amens
for each row execute function private.guild_wall_pulse_from_amen();

-- ---------------------------------------------------------------------------
-- WHO MAY HEAR IT
-- ---------------------------------------------------------------------------
--
-- The same test the feed applies, called rather than copied. An approved,
-- unsuspended Guide or Explorer who is in that guild -- nobody else, including
-- church leadership, who do not read this wall through this route.

alter table public.guild_wall_pulse enable row level security;

drop policy if exists guild_wall_pulse_read on public.guild_wall_pulse;
create policy guild_wall_pulse_read
  on public.guild_wall_pulse
  for select
  to authenticated
  using (private.active_guild_member(guild_id));

-- No insert, update or delete policy on purpose. The triggers above are the
-- only writer, and they run as the owner. A member cannot forge a pulse, and
-- cannot silence one either.
grant select on public.guild_wall_pulse to authenticated;

-- ---------------------------------------------------------------------------
-- ON THE WIRE
-- ---------------------------------------------------------------------------
--
-- REPLICA IDENTITY FULL so an update carries the old row as well; without it
-- realtime is deaf to everything except inserts, which is the exact fault that
-- made four other rooms look wired and deliver nothing. The row it carries is
-- (guild_id, revision, changed_at) and contains no person.

alter table public.guild_wall_pulse replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and c.relname = 'guild_wall_pulse'
  ) then
    alter publication supabase_realtime add table public.guild_wall_pulse;
  end if;
end $$;

-- The two tables behind the wall STAY unpublished-in-effect: they keep RLS on
-- with no read policy, so even though they sit in the publication they deliver
-- nothing. That is deliberate and must remain true. Removing them from the
-- publication would be tidier and is left alone on purpose: it is a change to
-- what the database replicates, made for cosmetics, on the day the room's
-- behaviour is already changing.
