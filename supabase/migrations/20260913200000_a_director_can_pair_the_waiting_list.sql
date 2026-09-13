-- Propose pairings for everybody who is waiting, in one go.
--
-- WHY. Asked for by the owner: "if there are too many candidates and the ED or
-- Director have to input alot of Guides and Explorers inside the system of the
-- app, there must be a button for auto pair." The one-at-a-time form above it
-- is two fields and a button, and doing that forty times is why it does not get
-- done.
--
-- THIS PROPOSES. IT DOES NOT PAIR.
--
-- That distinction is the whole design and it is not timidity. A pairing is two
-- named people being told they will walk together for months; forty of them
-- created by one tap, with no list shown first, is not something a Director can
-- supervise. So this function WRITES NOTHING -- it is declared STABLE, which
-- means Postgres itself refuses to let it modify anything. It returns who it
-- would put with whom, the screen shows the list, and the Director confirms; at
-- that point the app creates them one at a time through the ordinary path, so
-- every existing trigger and policy applies to each and a failure on one cannot
-- take the others with it.
--
-- MINORS ARE DELIBERATELY LEFT OUT, and this is the part worth arguing with
-- rather than silently accepting. An Explorer under eighteen being assigned to
-- an adult by an algorithm, with nobody having thought about which adult, is
-- the one pairing in this app that should never happen without a person
-- deciding. `is_minor` already exists (migration 0033) and guardian consent is
-- already tracked; this simply refuses to guess. The screen says they are left
-- out rather than dropping them silently.
--
-- FAIREST-FIRST, ON BOTH SIDES. Explorers who have waited longest are placed
-- first, and each goes to the Guide carrying the fewest people. Without the
-- second rule a single Guide fills to the cap while colleagues carry nobody.
--
-- THE TALLY IS KEPT AS IT GOES, which is the bug this shape avoids: counting a
-- Guide's load fresh for each Explorer would propose the same Guide repeatedly
-- and blow straight through the cap the moment the Director confirmed.

begin;

create or replace function public.suggest_pairings()
returns table (
  dm_id        uuid,
  dm_name      text,
  ds_id        uuid,
  ds_name      text,
  dm_load_now  integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_church uuid;
  v_cap    integer;
  r_ds     record;
  r_dm     record;
  loads    jsonb := '{}'::jsonb;
begin
  -- WHO MAY ASK. A definer function carries the owner's rights, so the caller
  -- is checked here or not at all. Leadership of their own church and nobody
  -- else: `manages_church` is role AND church together.
  v_church := public.my_church_id();
  if v_church is null or not public.manages_church(v_church) then
    raise exception 'Only a Director or an Executive Director can do this.'
      using errcode = 'insufficient_privilege';
  end if;

  v_cap := public.guide_pairing_limit_for(v_church);

  for r_dm in
    select p.id,
           (select count(*) from pairings x
             where x.dm_id = p.id and x.status = 'active') as held
    from profiles p
    where p.church_id = v_church and p.role = 'dm' and p.is_approved
      and p.suspended_at is null
  loop
    loads := loads || jsonb_build_object(r_dm.id::text, r_dm.held);
  end loop;

  for r_ds in
    select p.id, coalesce(p.full_name, 'Someone') as full_name
    from profiles p
    where p.church_id = v_church and p.role = 'ds' and p.is_approved
      and p.suspended_at is null
      and not exists (
        select 1 from pairings x where x.ds_id = p.id and x.status = 'active'
      )
      and not public.is_minor(p.birthday)
    order by p.created_at asc
  loop
    -- The Guide carrying the fewest who is still under the cap. The id breaks
    -- the tie so the same input always gives the same proposal: a Director who
    -- presses the button twice should see the same list.
    select key::uuid as id, (value::text)::integer as held
      into r_dm
      from jsonb_each(loads)
     where (value::text)::integer < v_cap
     order by (value::text)::integer asc, key asc
     limit 1;

    exit when r_dm.id is null;   -- everybody is full; the rest keep waiting

    dm_id       := r_dm.id;
    ds_id       := r_ds.id;
    ds_name     := r_ds.full_name;
    dm_load_now := r_dm.held;
    select coalesce(full_name, 'Someone') into dm_name from profiles where id = r_dm.id;
    return next;

    loads := jsonb_set(loads, array[r_dm.id::text], to_jsonb(r_dm.held + 1));
  end loop;
end;
$$;

revoke all on function public.suggest_pairings() from anon;
grant execute on function public.suggest_pairings() to authenticated;

comment on function public.suggest_pairings() is
  'Proposes pairings for unpaired Explorers, fairest-first, respecting the '
  'church cap. WRITES NOTHING -- the caller confirms and creates them through '
  'the ordinary path. Minors are excluded on purpose and paired by hand.';

commit;
