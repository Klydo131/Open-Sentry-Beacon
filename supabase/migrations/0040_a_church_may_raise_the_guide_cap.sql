-- FIVE IS A CEILING, AND SOMETIMES A CHURCH HAS MORE EXPLORERS THAN GUIDES.
--
-- The cap was a hard-coded 5 with no way past it, so a church with thirty
-- Explorers and four Guides simply could not pair the last ten people. Those
-- Explorers sat in an app where nothing happened, which is the exact outcome
-- the cap exists to prevent.
--
-- WHAT DOES NOT CHANGE. Five is still the default and still the number the
-- design is built around: it is how many people one person can actually walk
-- with. Raising it is a decision a church makes knowingly, recorded on the
-- church so anybody can see what this congregation chose.
--
-- WHO MAY RAISE IT. Only leadership, and only for their own church. A Guide
-- cannot give themselves more people, which is the whole reason the number is
-- enforced in the database rather than on a screen.

alter table public.churches
  add column if not exists guide_cap integer not null default 5;

alter table public.churches drop constraint if exists churches_guide_cap_sane;
alter table public.churches
  add constraint churches_guide_cap_sane check (guide_cap between 1 and 25);

create or replace function public.guide_pairing_limit_for(p_church uuid)
returns integer language sql stable security definer set search_path to 'public'
as $$ select coalesce((select guide_cap from public.churches where id = p_church), 5); $$;

create or replace function public.enforce_guide_pairing_limit()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  held   integer;
  cap    integer;
  who    text;
  church uuid;
begin
  if new.status <> 'active' then return new; end if;

  if tg_op = 'UPDATE'
     and old.status = 'active'
     and old.dm_id = new.dm_id then
    return new;
  end if;

  -- The Guide's own church decides, not the Explorer's. They are the same in
  -- practice; taking it from the Guide is what makes the sentence true when
  -- they are not.
  select church_id into church from public.profiles where id = new.dm_id;
  cap := public.guide_pairing_limit_for(church);

  select count(*) into held
  from public.pairings p
  where p.dm_id = new.dm_id
    and p.status = 'active'
    and p.id <> new.id;

  if held >= cap then
    select coalesce(full_name, 'This Guide') into who from public.profiles where id = new.dm_id;
    raise exception
      '% is already walking with % Explorers, which is the most one Guide may carry in this church. Disconnect one, choose another Guide, or raise the limit in Church settings.',
      who, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Leadership sets it. SECURITY DEFINER with the check inside, so the rule is
-- one statement rather than a policy somebody could widen later.
create or replace function public.set_guide_cap(p_church uuid, p_cap integer)
returns integer language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.manages_church(p_church) then
    raise exception 'Only a Director or an Executive Director can change this'
      using errcode = '42501';
  end if;
  if p_cap < 1 or p_cap > 25 then
    raise exception 'A Guide may carry between 1 and 25 Explorers';
  end if;
  update public.churches set guide_cap = p_cap where id = p_church;
  return p_cap;
end;
$$;

revoke all on function public.set_guide_cap(uuid, integer) from anon;
revoke all on function public.guide_pairing_limit_for(uuid) from anon;
grant execute on function public.set_guide_cap(uuid, integer) to authenticated;
grant execute on function public.guide_pairing_limit_for(uuid) to authenticated;
