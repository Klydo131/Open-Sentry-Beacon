-- Guilds: named groups of Guides and Explorers, made by Directors.
--
-- A pairing is one Guide and one Explorer. That is the right shape for
-- discipleship and the wrong shape for everything a church does in groups --
-- a Bible-study cohort, a campus, a language, a Sabbath afternoon team. Until
-- now the only way to express "these fourteen people belong together" was to
-- remember it, so nobody could see it and nothing could be arranged around it.
--
-- A guild is that grouping, with a name the Director chooses. Naming matters
-- more than it looks: "Tuesday Group" and "Palawan Campus" mean something to
-- the people in them in a way that a generated label never would, and the
-- owner asked for it explicitly.
--
-- WHO CAN SEE WHOM, and this is the part worth reading twice.
--
--   Guild NAMES are readable by anyone in the church. A member being able to
--   see that "Palawan Campus" exists costs nothing.
--
--   Guild MEMBERSHIP is readable by leaders and Guides only. An Explorer must
--   not be handed a list of the other Explorers. This app puts seekers into
--   private one-to-one conversations on purpose; a group feature that quietly
--   turned that into a visible roster of everybody being discipled at this
--   church would undo it, and it would do so without anybody deciding to.
--   So an Explorer sees the guild they are in and not who else is in it.
--
-- Only Guides and Explorers can be put in a guild -- a guild is the people
-- being walked with and the people walking with them, not the church's
-- leadership. Directors run guilds; they are not members of them.

begin;

create table if not exists public.guilds (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text check (length(description) <= 500),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One "Tuesday Group" per church. Case-insensitive, because a second guild
-- differing only in capitals is a typo, not a new group.
create unique index if not exists guilds_church_name_idx
  on public.guilds (church_id, lower(btrim(name)));

create table if not exists public.guild_members (
  guild_id  uuid not null references public.guilds(id) on delete cascade,
  person_id uuid not null references public.profiles(id) on delete cascade,
  added_by  uuid references public.profiles(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (guild_id, person_id)
);

create index if not exists guild_members_person_idx on public.guild_members (person_id);

alter table public.guilds        enable row level security;
alter table public.guild_members enable row level security;

-- Names: anybody in the church.
drop policy if exists guilds_read on public.guilds;
create policy guilds_read on public.guilds
  for select using (
    exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and (me.church_id = guilds.church_id
             or exists (select 1 from public.church_executives ce
                        where ce.executive_id = me.id and ce.church_id = guilds.church_id))
    )
  );

-- Membership: leaders and Guides, plus your own row so an Explorer can be told
-- which guild they are in without being shown the others.
drop policy if exists guild_members_read on public.guild_members;
create policy guild_members_read on public.guild_members
  for select using (
    person_id = (select auth.uid())
    or exists (
      select 1
      from public.profiles me
      join public.guilds g on g.id = guild_members.guild_id
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive', 'dm')
        and (me.church_id = g.church_id
             or exists (select 1 from public.church_executives ce
                        where ce.executive_id = me.id and ce.church_id = g.church_id))
    )
  );

-- Everything that changes a guild goes through a function. A church_id taken
-- from the browser is a church_id somebody can lie about.

create or replace function public.leads_church(c uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.is_approved
      and me.role in ('admin', 'executive')
      and (me.church_id = c
           or exists (select 1 from public.church_executives ce
                      where ce.executive_id = me.id and ce.church_id = c))
  );
$$;

create or replace function public.create_guild(p_name text, p_description text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  me   public.profiles%rowtype;
  g_id uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only a Director or an Executive Director can make a guild.';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Give the guild a name.';
  end if;
  if exists (select 1 from public.guilds
              where church_id = me.church_id
                and lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'This church already has a guild called %.', btrim(p_name);
  end if;

  insert into public.guilds (church_id, name, description, created_by)
  values (me.church_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), me.id)
  returning id into g_id;

  return g_id;
end;
$$;

create or replace function public.rename_guild(p_guild uuid, p_name text)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare g public.guilds%rowtype;
begin
  select * into g from public.guilds where id = p_guild;
  if g.id is null then return 'That guild is not here.'; end if;
  if not public.leads_church(g.church_id) then
    return 'Only a Director of this church can rename a guild.';
  end if;
  if btrim(coalesce(p_name, '')) = '' then return 'Give the guild a name.'; end if;
  if exists (select 1 from public.guilds
              where church_id = g.church_id and id <> p_guild
                and lower(btrim(name)) = lower(btrim(p_name))) then
    return 'This church already has a guild by that name.';
  end if;

  update public.guilds set name = btrim(p_name) where id = p_guild;
  return 'ok';
end;
$$;

create or replace function public.delete_guild(p_guild uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare g public.guilds%rowtype;
begin
  select * into g from public.guilds where id = p_guild;
  if g.id is null then return 'That guild is not here.'; end if;
  if not public.leads_church(g.church_id) then
    return 'Only a Director of this church can delete a guild.';
  end if;
  -- Deleting the group does not touch the people in it.
  delete from public.guilds where id = p_guild;
  return 'ok';
end;
$$;

create or replace function public.add_to_guild(p_guild uuid, p_person uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  g      public.guilds%rowtype;
  person public.profiles%rowtype;
begin
  select * into g      from public.guilds   where id = p_guild;
  select * into person from public.profiles where id = p_person;

  if g.id is null then return 'That guild is not here.'; end if;
  if not public.leads_church(g.church_id) then
    return 'Only a Director of this church can change a guild.';
  end if;
  if person.id is null then return 'That person is not here.'; end if;
  if person.church_id is distinct from g.church_id then
    return 'That person is not in this church.';
  end if;
  if person.role not in ('dm', 'ds') then
    return 'A guild is made of Guides and Explorers.';
  end if;

  insert into public.guild_members (guild_id, person_id, added_by)
  values (p_guild, p_person, (select auth.uid()))
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body)
  values (p_person, 'approval', 'You have joined ' || g.name,
          'A Director added you to this guild.');

  return 'ok';
end;
$$;

create or replace function public.remove_from_guild(p_guild uuid, p_person uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare g public.guilds%rowtype;
begin
  select * into g from public.guilds where id = p_guild;
  if g.id is null then return 'That guild is not here.'; end if;
  if not public.leads_church(g.church_id) then
    return 'Only a Director of this church can change a guild.';
  end if;

  delete from public.guild_members where guild_id = p_guild and person_id = p_person;
  return 'ok';
end;
$$;

/** Every guild this person may see, with its roll where they are allowed one. */
create or replace function public.list_guilds()
returns table (
  id           uuid,
  name         text,
  description  text,
  member_count bigint,
  guides       bigint,
  explorers    bigint,
  members      jsonb,
  i_am_in_it   boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    g.id, g.name, g.description,
    (select count(*) from public.guild_members m where m.guild_id = g.id),
    (select count(*) from public.guild_members m
       join public.profiles p on p.id = m.person_id
      where m.guild_id = g.id and p.role = 'dm'),
    (select count(*) from public.guild_members m
       join public.profiles p on p.id = m.person_id
      where m.guild_id = g.id and p.role = 'ds'),
    -- The roll only for those allowed to read it. An Explorer gets an empty
    -- array here, not a filtered one, so there is nothing to infer from length.
    case when public.leads_church(g.church_id)
           or exists (select 1 from public.profiles me
                       where me.id = (select auth.uid()) and me.role = 'dm'
                         and me.church_id = g.church_id)
         then coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', p.id, 'name', coalesce(p.full_name, 'Someone'), 'role', p.role)
                  order by p.role, p.full_name)
           from public.guild_members m
           join public.profiles p on p.id = m.person_id
           where m.guild_id = g.id), '[]'::jsonb)
         else '[]'::jsonb
    end,
    exists (select 1 from public.guild_members m
             where m.guild_id = g.id and m.person_id = (select auth.uid()))
  from public.guilds g
  where exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.is_approved
      and (me.church_id = g.church_id
           or exists (select 1 from public.church_executives ce
                      where ce.executive_id = me.id and ce.church_id = g.church_id))
  )
  order by g.name;
$$;

revoke all on function public.leads_church(uuid)              from public, anon;
revoke all on function public.create_guild(text, text)        from public, anon;
revoke all on function public.rename_guild(uuid, text)        from public, anon;
revoke all on function public.delete_guild(uuid)              from public, anon;
revoke all on function public.add_to_guild(uuid, uuid)        from public, anon;
revoke all on function public.remove_from_guild(uuid, uuid)   from public, anon;
revoke all on function public.list_guilds()                   from public, anon;

grant execute on function public.leads_church(uuid)            to authenticated;
grant execute on function public.create_guild(text, text)      to authenticated;
grant execute on function public.rename_guild(uuid, text)      to authenticated;
grant execute on function public.delete_guild(uuid)            to authenticated;
grant execute on function public.add_to_guild(uuid, uuid)      to authenticated;
grant execute on function public.remove_from_guild(uuid, uuid) to authenticated;
grant execute on function public.list_guilds()                 to authenticated;

commit;
