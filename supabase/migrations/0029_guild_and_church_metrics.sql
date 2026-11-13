-- What a Director can actually measure about their guilds, and what an
-- Executive Director can measure about the whole church.
--
-- EVERY WORD HERE IS DEFINED, because "doing well" is not a measurement. A
-- dashboard that shows a green badge without saying what earned it teaches a
-- leader to trust a colour. These are the rules, and they are in the function
-- rather than in a comment in the app so that the number and its meaning can
-- never drift apart:
--
--   last_activity_at  the most recent message sent BY a member of the guild.
--                     Messages are the thing a guild does; a group where
--                     nobody has written anything is not meeting.
--
--   state             empty     no members at all
--                     active    somebody wrote within 14 days
--                     quiet     the last message was 15-45 days ago
--                     stagnant  nothing for 45 days, or nothing ever
--
--   health            thriving  active, every Explorer has a Guide, nobody
--                               suspended
--                     steady    active or quiet, and nobody suspended
--                     watch     somebody is suspended, or an Explorer in this
--                               guild has no Guide -- either is a person
--                               falling through, and that is the whole point
--                               of looking
--                     stagnant  as above
--
-- 'watch' beats 'thriving' deliberately. A guild with twenty happy members and
-- one Explorer nobody is walking with should not read as healthy, because the
-- one is the reason to open the screen.
--
-- WHY guild_names IS COPIED ONTO THE DISCIPLINE LOG. Removing somebody deletes
-- their profile, and their guild membership goes with it -- so "how many people
-- has this guild lost" cannot be asked afterwards unless the guild names are
-- written down at the moment of the act. Same lesson as 0028, one field
-- further on.

begin;

alter table public.discipline_log
  add column if not exists guild_names text[] not null default '{}';

-- The three acts, recording which guilds the person belonged to.
create or replace function public.suspend_member(p_target uuid, p_reason text default null)
returns text
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  verdict text;
  target  public.profiles%rowtype;
  actor   public.profiles%rowtype;
  guilds  text[];
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  select * into target from public.profiles where id = p_target;
  select * into actor  from public.profiles where id = (select auth.uid());
  select coalesce(array_agg(g.name order by g.name), '{}')
    into guilds
    from public.guild_members m join public.guilds g on g.id = m.guild_id
   where m.person_id = p_target;

  update public.profiles
     set suspended_at = now(), suspended_by = actor.id,
         suspended_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_target;

  update auth.users
     set banned_until = now() + interval '100 years', updated_at = now()
   where id = p_target;

  delete from auth.sessions       where user_id = p_target;
  delete from auth.refresh_tokens where user_id = p_target::text;

  update public.pairings set status = 'archived'
   where (dm_id = p_target or ds_id = p_target) and status = 'active';

  insert into public.discipline_log (church_id, person_id, person_name, person_role,
                                     action, reason, by_id, by_name, guild_names)
  values (target.church_id, target.id, coalesce(target.full_name, 'Someone'), target.role::text,
          'suspended', nullif(btrim(coalesce(p_reason, '')), ''),
          actor.id, coalesce(actor.full_name, 'A leader'), guilds);

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'approval', 'A member was suspended',
         coalesce(target.full_name, 'Someone') || ' was suspended by '
         || coalesce(actor.full_name, 'a leader') || '.'
  from public.profiles p
  where p.church_id = target.church_id
    and p.is_approved and p.role in ('admin', 'executive')
    and p.id <> actor.id;

  return 'ok';
end;
$fn$;

create or replace function public.remove_member_by_leader(p_target uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  verdict text;
  target  public.profiles%rowtype;
  actor   public.profiles%rowtype;
  guilds  text[];
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  select * into target from public.profiles where id = p_target;
  select * into actor  from public.profiles where id = (select auth.uid());
  select coalesce(array_agg(g.name order by g.name), '{}')
    into guilds
    from public.guild_members m join public.guilds g on g.id = m.guild_id
   where m.person_id = p_target;

  insert into public.discipline_log (church_id, person_id, person_name, person_role,
                                     action, by_id, by_name, guild_names)
  values (target.church_id, null, coalesce(target.full_name, 'Someone'), target.role::text,
          'removed', actor.id, coalesce(actor.full_name, 'A leader'), guilds);

  delete from public.messages       where sender_id = p_target;
  delete from public.journey_events where changed_by = p_target;
  delete from public.pairings       where dm_id = p_target or ds_id = p_target or created_by = p_target;
  delete from auth.users            where id = p_target;
  return 'ok';
end;
$fn$;

-- ------------------------------------------------------------ guild metrics --

create or replace function public.guild_metrics()
returns table (
  id                 uuid,
  name               text,
  members            bigint,
  guides             bigint,
  explorers          bigint,
  unpaired_explorers bigint,
  suspended          bigint,
  removed_ever       bigint,
  messages_30d       bigint,
  last_activity_at   timestamptz,
  state              text,
  health             text
)
language sql stable security definer set search_path to 'public'
as $fn$
  with mine as (
    select g.* from public.guilds g where public.leads_church(g.church_id)
  ),
  agg as (
    select
      g.id, g.name, g.church_id,
      (select count(*) from public.guild_members m where m.guild_id = g.id) as members,
      (select count(*) from public.guild_members m join public.profiles p on p.id = m.person_id
        where m.guild_id = g.id and p.role = 'dm') as guides,
      (select count(*) from public.guild_members m join public.profiles p on p.id = m.person_id
        where m.guild_id = g.id and p.role = 'ds') as explorers,
      (select count(*) from public.guild_members m join public.profiles p on p.id = m.person_id
        where m.guild_id = g.id and p.role = 'ds'
          and not exists (select 1 from public.pairings pr
                           where pr.ds_id = p.id and pr.status = 'active')) as unpaired_explorers,
      (select count(*) from public.guild_members m join public.profiles p on p.id = m.person_id
        where m.guild_id = g.id and p.suspended_at is not null) as suspended,
      (select count(*) from public.discipline_log d
        where d.church_id = g.church_id and d.action = 'removed'
          and g.name = any(d.guild_names)) as removed_ever,
      (select count(*) from public.messages ms
        where ms.created_at > now() - interval '30 days'
          and ms.sender_id in (select m.person_id from public.guild_members m
                                where m.guild_id = g.id)) as messages_30d,
      (select max(ms.created_at) from public.messages ms
        where ms.sender_id in (select m.person_id from public.guild_members m
                                where m.guild_id = g.id)) as last_activity_at
    from mine g
  )
  select
    a.id, a.name, a.members, a.guides, a.explorers,
    a.unpaired_explorers, a.suspended, a.removed_ever,
    a.messages_30d, a.last_activity_at,
    case
      when a.members = 0 then 'empty'
      when a.last_activity_at > now() - interval '14 days' then 'active'
      when a.last_activity_at > now() - interval '45 days' then 'quiet'
      else 'stagnant'
    end,
    case
      when a.members = 0 then 'stagnant'
      when a.suspended > 0 or a.unpaired_explorers > 0 then 'watch'
      when a.last_activity_at > now() - interval '14 days' then 'thriving'
      when a.last_activity_at > now() - interval '45 days' then 'steady'
      else 'stagnant'
    end
  from agg a
  order by a.name;
$fn$;

-- ----------------------------------------------------------- the whole church --
--
-- One row: what is going on here. Available to Directors and Executive
-- Directors alike -- a Director who cannot see their own church's totals cannot
-- do the job. The difference in practice is reach: an Executive oversees more
-- than one church, so they get a row for each.

create or replace function public.church_pulse()
returns table (
  church_id        uuid,
  church_name      text,
  directors        bigint,
  guides           bigint,
  explorers        bigint,
  awaiting_approval bigint,
  active_pairings  bigint,
  unpaired_explorers bigint,
  guilds_total     bigint,
  guilds_active    bigint,
  guilds_stagnant  bigint,
  suspended_now    bigint,
  removed_ever     bigint,
  open_reports     bigint,
  open_trials      bigint,
  messages_7d      bigint,
  messages_30d     bigint
)
language sql stable security definer set search_path to 'public'
as $fn$
  select
    c.id, c.name,
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'admin'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'dm'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'ds'),
    (select count(*) from public.profiles p where p.church_id = c.id and not p.is_approved),
    (select count(*) from public.pairings pr where pr.status = 'active'
       and exists (select 1 from public.profiles p where p.id = pr.ds_id and p.church_id = c.id)),
    (select count(*) from public.profiles p
      where p.church_id = c.id and p.role = 'ds'
        and not exists (select 1 from public.pairings pr
                         where pr.ds_id = p.id and pr.status = 'active')),
    (select count(*) from public.guilds g where g.church_id = c.id),
    (select count(*) from public.guild_metrics() gm where gm.state = 'active'),
    (select count(*) from public.guild_metrics() gm where gm.state = 'stagnant'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.suspended_at is not null),
    (select count(*) from public.discipline_log d where d.church_id = c.id and d.action = 'removed'),
    (select count(*) from public.reports r where r.church_id = c.id and r.status = 'open'),
    (select count(*) from public.trials t where t.church_id = c.id and t.status = 'open'),
    (select count(*) from public.messages ms where ms.created_at > now() - interval '7 days'
       and exists (select 1 from public.profiles p where p.id = ms.sender_id and p.church_id = c.id)),
    (select count(*) from public.messages ms where ms.created_at > now() - interval '30 days'
       and exists (select 1 from public.profiles p where p.id = ms.sender_id and p.church_id = c.id))
  from public.churches c
  where public.leads_church(c.id)
  order by c.name;
$fn$;

/** The discipline record itself, for the leader who wants the detail not the count. */
create or replace function public.discipline_history()
returns table (
  id          uuid,
  person_name text,
  person_role text,
  action      text,
  reason      text,
  by_name     text,
  guild_names text[],
  at          timestamptz
)
language sql stable security definer set search_path to 'public'
as $fn$
  select d.id, d.person_name, d.person_role, d.action, d.reason, d.by_name, d.guild_names, d.at
  from public.discipline_log d
  where public.leads_church(d.church_id)
  order by d.at desc;
$fn$;

revoke all on function public.guild_metrics()       from public, anon;
revoke all on function public.church_pulse()        from public, anon;
revoke all on function public.discipline_history()  from public, anon;
grant execute on function public.guild_metrics()      to authenticated;
grant execute on function public.church_pulse()       to authenticated;
grant execute on function public.discipline_history() to authenticated;

commit;
