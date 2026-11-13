-- A Guide may walk with at most five Explorers at once.
--
-- WHY A LIMIT AT ALL. Nothing stopped a Director pairing one willing Guide with
-- everybody who arrived. That does not fail loudly -- it fails as a Guide with
-- fourteen conversations who answers four of them, and as ten Explorers who
-- each believe somebody is walking with them. The cap makes the shortage
-- visible at the moment of pairing, which is the only moment anybody can do
-- something about it.
--
-- WHY A TRIGGER AND NOT A CHECK IN THE APP. The screen will also count, so a
-- Director sees a full Guide greyed out rather than being refused after
-- pressing the button. But the screen is not the boundary: createPairing()
-- inserts straight into the table, and anything holding a session can do the
-- same. A rule that only the button obeys is a rule that only the button obeys.
--
-- WHY NOT A UNIQUE INDEX OR A CHECK CONSTRAINT. Neither can count sibling rows.
-- A CHECK sees only the row being written; a unique index cannot express "at
-- most five". Counting across rows of the same table needs a trigger.
--
-- ARCHIVED PAIRINGS DO NOT COUNT. Only 'active' ones do, so disconnecting an
-- Explorer immediately frees a place -- which is what makes the cap workable
-- rather than a wall a church hits once and never gets past.
--
-- THE UPDATE PATH IS GUARDED TOO. Un-archiving is an UPDATE, not an INSERT, so
-- a trigger on INSERT alone could be walked straight around by archiving a
-- pairing and bringing it back once five others existed.
--
-- The owner said. It is one number in one function, changed by
-- a single create-or-replace, and nothing else reads a literal 5.

begin;

create or replace function public.guide_pairing_limit()
returns integer
language sql immutable
as $$ select 5; $$;

comment on function public.guide_pairing_limit is
  'How many active Explorers one Guide may walk with. Change here and the '
  'trigger, the error message and the app all follow.';

create or replace function public.enforce_guide_pairing_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  held  integer;
  cap   integer := public.guide_pairing_limit();
  who   text;
begin
  -- Only rows that are (or are becoming) active can consume a place.
  if new.status <> 'active' then return new; end if;

  -- On UPDATE, a row that was already active and is staying with the same
  -- Guide is not taking a new place -- it is the place it already had.
  if tg_op = 'UPDATE'
     and old.status = 'active'
     and old.dm_id = new.dm_id then
    return new;
  end if;

  select count(*) into held
  from public.pairings p
  where p.dm_id = new.dm_id
    and p.status = 'active'
    and p.id <> new.id;

  if held >= cap then
    select coalesce(full_name, 'This Guide') into who from public.profiles where id = new.dm_id;
    raise exception
      '% is already walking with % Explorers, which is the most one Guide can carry. Disconnect one first, or choose another Guide.',
      who, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_guide_pairing_limit on public.pairings;
create trigger enforce_guide_pairing_limit
  before insert or update on public.pairings
  for each row execute function public.enforce_guide_pairing_limit();

-- The app asks for this so it can grey out a Guide who is full, and say how
-- many places are left on the ones who are not.
create or replace function public.guide_capacity()
returns table (
  guide_id   uuid,
  guide_name text,
  held       bigint,
  cap        integer,
  places_left integer
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.id,
    coalesce(p.full_name, 'Someone'),
    (select count(*) from public.pairings pr
      where pr.dm_id = p.id and pr.status = 'active'),
    public.guide_pairing_limit(),
    greatest(0, public.guide_pairing_limit()
                - (select count(*) from public.pairings pr
                    where pr.dm_id = p.id and pr.status = 'active')::integer)
  from public.profiles p
  where p.role = 'dm'
    and p.is_approved
    and public.leads_church(p.church_id)
  order by coalesce(p.full_name, '');
$$;

revoke all on function public.guide_pairing_limit() from anon;
revoke all on function public.guide_capacity()      from public, anon;
grant execute on function public.guide_pairing_limit() to authenticated;
grant execute on function public.guide_capacity()      to authenticated;

commit;
