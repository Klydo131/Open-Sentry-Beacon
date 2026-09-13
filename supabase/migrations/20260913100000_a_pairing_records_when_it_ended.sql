-- When a pairing ended, recorded rather than inferred.
--
-- WHAT A DIRECTOR COULD NOT SEE. Asked for directly: "EDs and Directors should
-- know when did the Guide and Explorer connected so we there would be a track
-- record." Half of that was already possible and simply never drawn --
-- `pairings.created_at` has always been in the browser, on every row, and the
-- roster showed two names and a stage and no date at all.
--
-- The other half did not exist. A pairing ends by `endPairing` setting
-- status = 'archived', and nothing anywhere wrote down WHEN. Fifty-three of
-- this church's pairings are archived and not one of them can say what day it
-- stopped.
--
-- AND `updated_at` IS NOT THAT DATE, WHICH IS THE TRAP THIS MIGRATION EXISTS TO
-- AVOID. It is written by stage changes only -- `advanceStage` and
-- `stepBackStage` set it explicitly, there is no trigger, and `endPairing` has
-- never touched it. lib/live/data.ts already warns about exactly this in
-- another context: "updated_at moves for reasons that are not a journey step
-- and the chart would quietly count them." Reading it as an end date would put
-- a confident wrong day in front of a Director making a pastoral judgement,
-- which is worse than showing nothing.
--
-- NOTHING IS BACKFILLED, AND THAT IS DELIBERATE. The information was never
-- captured, so there is no honest source to recover it from. The fifty-three
-- rows that are already archived keep a null here and the screen says the date
-- was not recorded. An invented date would be indistinguishable from a real one
-- forever after.

begin;

alter table public.pairings
  add column if not exists ended_at timestamptz;

comment on column public.pairings.ended_at is
  'When this pairing was archived. Null for active pairings, and null for rows '
  'archived before this column existed -- the date was never captured and is '
  'not recoverable. Never infer it from updated_at, which moves on stage '
  'changes.';

-- SET BY THE DATABASE, NOT BY THE BROWSER. `endPairing` could send a timestamp
-- along with the status, but then the record of when a relationship ended would
-- be whatever a client's clock said, and a browser may only write the columns it
-- is granted. A trigger means the date is the server's and arrives however the
-- row is archived -- from the app, from a script, or by hand in SQL.
create or replace function private.stamp_pairing_end()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Only on the transition INTO archived. Re-archiving an archived row must not
  -- move the date: the day it actually stopped is the day it stopped.
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.ended_at := now();
  end if;
  -- And a pairing made again is no longer ended. A pair CAN be reconnected --
  -- tests/a-pair-can-be-made-again.mjs is about exactly that -- so leaving a
  -- stale end date on a live pairing would make the roster contradict itself.
  if new.status <> 'archived' then
    new.ended_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_pairing_end on public.pairings;
create trigger stamp_pairing_end
  before update of status on public.pairings
  for each row execute function private.stamp_pairing_end();

commit;
