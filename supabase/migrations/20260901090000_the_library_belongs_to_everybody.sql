-- The library nobody could add to, and the record that makes it safe to open.
--
-- FIRST, THE BUG, because it explains the screenshot. Adding a resource showed
-- "You do not have permission to do that. If that seems wrong, ask your
-- Director." Nothing was wrong with anybody's permission. Proved against the
-- live database and rolled back:
--
--   insert into materials (...) returning id   ->  refused, "new row violates
--                                                   row-level security policy"
--   the same insert with no returning clause   ->  allowed
--
-- The app saves the row and asks for its id back in one statement, so the
-- database applies the READ rule to the row it is about to hand back.
-- `materials_read` calls `can_read_material(id)`, which looks the material up
-- BY ID on a snapshot taken before the row existed. It cannot find it, so it
-- refuses to return to the author the very row it just accepted from them.
--
-- This is the blog bug, in a second place. It was diagnosed wrongly twice
-- there, and the fix is the same: answer the author's own case FROM THE ROW
-- rather than by looking it up. `added_by = auth.uid()` needs no lookup and is
-- true for a row nothing else can see yet.
--
-- SECOND, WHO MAY ADD. The library was Guides and leadership only, on the
-- reasoning that it is "what the church offers, not a place anybody can post
-- into". The owner has decided otherwise, and the decision is theirs: a Guide
-- and an Explorer share links with each other freely, without asking anybody.
--
-- THIRD, WHAT MAKES THAT SAFE. Freedom to share is not freedom from oversight.
--
--   * Every add and every share is recorded: who, what, with whom, when.
--   * A Director reads the record for the GUIDES AND EXPLORERS of a church
--     they lead. An Executive Director reads it for DIRECTORS, and not for
--     Guides or Explorers. Each rank watches the rank below it and no further
--     down, which is the same shape the security audit room already has.
--   * Rows older than 30 days are deleted. A record kept forever is a different
--     product from a record kept to answer "what happened last month", and the
--     second is what a church needs.
--   * A Director can block a Guide or an Explorer from sharing, and an
--     Executive Director can block a Director. Blocking is enforced here, in
--     the write rules, not by hiding a button.
--
-- WHAT IS NOT RECORDED: nothing from a conversation. This is a list of links
-- and who they went to. The private thread between two people stays private,
-- as it does everywhere else in this app.

begin;

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
create table if not exists public.library_blocks (
  person_id  uuid primary key references public.profiles(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  blocked_by uuid references public.profiles(id) on delete set null,
  reason     text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now()
);

alter table public.library_blocks enable row level security;
revoke all on table public.library_blocks from public, anon, authenticated;

-- The person themselves is never told through a policy; they are told by the
-- screen, in a sentence, which is a kinder way to find out than a button that
-- silently fails.
create or replace function public.library_blocked(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$ select exists (select 1 from public.library_blocks b where b.person_id = p_person); $$;

revoke all on function public.library_blocked(uuid) from public, anon;
grant execute on function public.library_blocked(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The record
-- ---------------------------------------------------------------------------
create table if not exists public.library_activity (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text not null,
  actor_role   text not null check (actor_role in ('dm', 'ds', 'admin', 'executive')),
  action       text not null check (action in ('added', 'shared')),
  title        text not null,
  address      text,
  -- Who it went to, by name. A share is between two people and the point of
  -- the record is that a Director can see both ends of it.
  with_name    text,
  occurred_at  timestamptz not null default now()
);

create index if not exists library_activity_church_time_idx
  on public.library_activity (church_id, occurred_at desc);

alter table public.library_activity enable row level security;
revoke all on table public.library_activity from public, anon, authenticated;

-- Thirty days, and the pruning happens on write so nothing has to be scheduled.
-- A cron job is one more thing to set up, forget, and discover was never
-- running on the day somebody asks what the record says.
create or replace function private.prune_library_activity()
returns void
language sql
security definer
set search_path to public, pg_temp
as $$ delete from public.library_activity where occurred_at < now() - interval '30 days'; $$;

create or replace function private.record_library_add()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = new.added_by;
  if actor.id is null or actor.church_id is null then return new; end if;

  insert into public.library_activity
    (church_id, actor_id, actor_name, actor_role, action, title, address, occurred_at)
  values
    (actor.church_id, actor.id, coalesce(actor.full_name, 'A member'), actor.role::text,
     'added', new.title, new.external_url, new.created_at);

  perform private.prune_library_activity();
  return new;
end;
$fn$;

drop trigger if exists materials_library_activity on public.materials;
create trigger materials_library_activity
  after insert on public.materials
  for each row execute function private.record_library_add();

create or replace function private.record_library_share()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  actor    public.profiles%rowtype;
  item     public.materials%rowtype;
  other_id uuid;
  other    public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = new.shared_by;
  select * into item  from public.materials where id = new.material_id;
  if actor.id is null or actor.church_id is null then return new; end if;

  -- The other person in the pairing, whichever end the sharer is.
  select case when p.dm_id = new.shared_by then p.ds_id else p.dm_id end
    into other_id
    from public.pairings p where p.id = new.pairing_id;
  select * into other from public.profiles where id = other_id;

  insert into public.library_activity
    (church_id, actor_id, actor_name, actor_role, action, title, address, with_name, occurred_at)
  values
    (actor.church_id, actor.id, coalesce(actor.full_name, 'A member'), actor.role::text,
     'shared', coalesce(item.title, 'A resource'), item.external_url,
     coalesce(other.full_name, 'the other person'), new.created_at);

  perform private.prune_library_activity();
  return new;
end;
$fn$;

drop trigger if exists shares_library_activity on public.material_shares;
create trigger shares_library_activity
  after insert on public.material_shares
  for each row execute function private.record_library_share();

-- ---------------------------------------------------------------------------
-- Reading the record: each rank sees the rank below it, and no further down
-- ---------------------------------------------------------------------------
create or replace function private.library_activity_feed(p_limit integer default 100)
returns table (
  id uuid,
  actor_name text,
  actor_role text,
  action text,
  title text,
  address text,
  with_name text,
  blocked boolean,
  actor_id uuid,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  me public.profiles%rowtype;
  row_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  select profile.* into me from public.profiles as profile
   where profile.id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may read the library record.' using errcode = '42501';
  end if;

  perform private.prune_library_activity();

  return query
  select
    event.id,
    event.actor_name,
    event.actor_role,
    event.action,
    event.title,
    event.address,
    event.with_name,
    public.library_blocked(event.actor_id),
    event.actor_id,
    event.occurred_at
  from public.library_activity event
  where public.leads_church(event.church_id)
    and (
      (me.role = 'admin'     and event.actor_role in ('dm', 'ds'))
      or (me.role = 'executive' and event.actor_role = 'admin')
    )
  order by event.occurred_at desc
  limit row_limit;
end;
$fn$;

create or replace function public.library_activity_feed(p_limit integer default 100)
returns table (
  id uuid,
  actor_name text,
  actor_role text,
  action text,
  title text,
  address text,
  with_name text,
  blocked boolean,
  actor_id uuid,
  occurred_at timestamptz
)
language sql
set search_path to public, private, pg_temp
as $$ select * from private.library_activity_feed(p_limit); $$;

-- ---------------------------------------------------------------------------
-- Blocking, by the same rank rule
-- ---------------------------------------------------------------------------
create or replace function private.set_library_block(p_person uuid, p_blocked boolean, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  me     public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select profile.* into me from public.profiles as profile where profile.id = (select auth.uid());
  select * into target from public.profiles where id = p_person;
  if target.id is null or not public.leads_church(target.church_id) then
    raise exception 'That person is not in a church you lead.' using errcode = '42501';
  end if;
  if me.id is null or not me.is_approved then
    raise exception 'Only church leadership may do that.' using errcode = '42501';
  end if;

  -- A Director reaches Guides and Explorers. An Executive Director reaches
  -- Directors. Nobody reaches sideways or upward, and nobody reaches
  -- themselves: an account that can switch off its own oversight has none.
  if not (
    (me.role = 'admin' and target.role::text in ('dm', 'ds'))
    or (me.role = 'executive' and target.role::text = 'admin')
  ) then
    raise exception 'You cannot change that person''s library access.' using errcode = '42501';
  end if;
  if target.id = me.id then
    raise exception 'You cannot block yourself.' using errcode = '42501';
  end if;

  if p_blocked then
    insert into public.library_blocks (person_id, church_id, blocked_by, reason)
    values (target.id, target.church_id, me.id, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (person_id) do update
      set blocked_by = excluded.blocked_by,
          reason     = excluded.reason,
          created_at = now();
  else
    delete from public.library_blocks where person_id = target.id;
  end if;
  return true;
end;
$fn$;

create or replace function public.set_library_block(p_person uuid, p_blocked boolean, p_reason text default null)
returns boolean
language sql
set search_path to public, private, pg_temp
as $$ select private.set_library_block(p_person, p_blocked, p_reason); $$;

-- ---------------------------------------------------------------------------
-- The write rules, rebuilt
-- ---------------------------------------------------------------------------
drop policy if exists materials_read   on public.materials;
drop policy if exists materials_create on public.materials;

-- THE FIX. The first arm reads the row in front of it and needs no lookup, so
-- it is true for a row nothing else can see yet, which is exactly the case the
-- insert's returning clause creates.
create policy materials_read on public.materials
  for select to authenticated
  using (added_by = (select auth.uid()) or public.can_read_material(id));

-- Everybody approved in the church, Explorers included, unless blocked.
create policy materials_create on public.materials
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and church_id = public.my_church_id()
    and public.auth_role() in ('dm', 'ds', 'admin', 'executive')
    and not public.library_blocked((select auth.uid()))
  );

drop policy if exists shares_create on public.material_shares;

-- EITHER END OF A PAIRING MAY SHARE. It was the Guide only, which made the
-- library a thing done to an Explorer rather than between two people.
create policy shares_create on public.material_shares
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and exists (
      select 1 from public.pairings p
      where p.id = pairing_id
        and (p.dm_id = (select auth.uid()) or p.ds_id = (select auth.uid()))
    )
    and not public.library_blocked((select auth.uid()))
  );

revoke all on function private.prune_library_activity() from public, anon, authenticated;
revoke all on function private.record_library_add() from public, anon, authenticated;
revoke all on function private.record_library_share() from public, anon, authenticated;
revoke all on function private.library_activity_feed(integer) from public, anon;
revoke all on function private.set_library_block(uuid, boolean, text) from public, anon;
revoke all on function public.library_activity_feed(integer) from public, anon;
revoke all on function public.set_library_block(uuid, boolean, text) from public, anon;
grant execute on function private.library_activity_feed(integer) to authenticated;
grant execute on function private.set_library_block(uuid, boolean, text) to authenticated;
grant execute on function public.library_activity_feed(integer) to authenticated;
grant execute on function public.set_library_block(uuid, boolean, text) to authenticated;

commit;
