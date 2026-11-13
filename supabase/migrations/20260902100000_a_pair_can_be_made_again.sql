-- Two people who were unpaired can be paired again.
--
-- THE BUG, REPORTED FROM A PHONE. A Director disconnected two people, tried to
-- pair them again, and got:
--
--   duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"
--
-- `pairings_ds_id_dm_id_key` was UNIQUE (ds_id, dm_id) with no condition on it,
-- and disconnecting does not delete the row — it sets status to 'archived',
-- deliberately, so the history of who walked with whom survives. Those two
-- facts together mean the archived row keeps that pair's slot FOREVER: the two
-- people can never be paired again, by anybody, for the life of the church.
--
-- Every disconnect this church had ever done was in that state: seven archived
-- pairings, seven pairs that could not be remade. It is not a rare edge case
-- either — "disconnect and pair them again" is the obvious way to fix a pairing
-- somebody made by mistake, which is exactly when a Director reaches for it.
--
-- THE RULE THAT WAS MEANT: the same two people must not be paired twice AT
-- ONCE. That is what the partial index says. The archived rows fall outside it
-- and the history is untouched.

alter table public.pairings drop constraint if exists pairings_ds_id_dm_id_key;

create unique index if not exists pairings_active_pair_once
  on public.pairings (ds_id, dm_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- AND THE OTHER HALF, WHICH WAS FOUND WHILE FIXING THIS ONE.
--
-- Nothing ever said an Explorer has ONE Guide. The only trigger on this table
-- caps a Guide at five Explorers — the other side of the relationship — so
-- pairing an Explorer who already had a Guide was simply allowed, and four of
-- them had two Guides at once.
--
-- It is not a tidiness problem. `myPairing` reads the Explorer's active pairing
-- with `.maybeSingle()`, which RAISES when it finds two rows, so those four
-- Explorers were not quietly double-paired: their My Guide screen was failing
-- outright, which is the whole app as far as an Explorer is concerned.
--
-- A TRIGGER, NOT A UNIQUE INDEX, and the reason matters. A partial unique index
-- on (ds_id) where active is the natural shape, and it CANNOT BE CREATED while
-- four Explorers are already in breach — Postgres refuses to build it. Choosing
-- which of somebody's two Guides to drop is a decision about real people that
-- belongs to a Director, not to a migration running at night. The trigger stops
-- it happening again without touching what is already there, and the four can
-- be resolved on a screen by a person.
create or replace function public.one_guide_per_explorer()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.pairings p
    where p.ds_id = new.ds_id
      and p.status = 'active'
      and p.id is distinct from new.id
  ) then
    raise exception 'That Explorer already has a Guide. Disconnect the current one first.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists one_guide_per_explorer on public.pairings;
create trigger one_guide_per_explorer
  before insert or update of ds_id, status on public.pairings
  for each row execute function public.one_guide_per_explorer();
