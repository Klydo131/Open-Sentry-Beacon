-- An Explorer finds out that their Guide is praying for what they asked.
--
-- THE GAP. Asking for prayer is the most exposed thing somebody does in this
-- app, and until now the answer to it was silence. The request appeared on the
-- Guide's Care page with no control of any kind, so even a Guide who read it
-- and prayed that evening had no way to say so, and the person who asked saw
-- their own words sitting there exactly as they left them. From where they
-- stand that is indistinguishable from nobody having looked.
--
-- WHY THIS IS NOT THE THING THAT WAS DELETED. components/LivePrayer.tsx carries
-- a note explaining why "Mark praying" and "Mark answered" were REMOVED: they
-- asked a Guide to file somebody's mother's illness under a workflow state, and
-- prayer is not a ticket queue. That reasoning was right and still is. What was
-- wrong with those buttons is that the state they set was for the GUIDE'S list.
-- Nobody was told. This is the opposite: one tap, and the only thing it does is
-- tell the person who asked. The status is the mechanism, not the point.
--
-- 'praying' already exists in the enum and the update policy already lets a
-- Guide set it, so nothing here widens who may do what.

-- WHO, AND WHEN. Not needed to make the feature work — an Explorer has one
-- Guide, so "your Guide" is unambiguous. Recorded because a pairing can change
-- and the fact should not: somebody looking back at a hard week should be able
-- to see that it was answered at the time, by the person who was walking with
-- them then.
alter table public.prayer_requests
  add column if not exists praying_at timestamptz,
  add column if not exists praying_by uuid references public.profiles (id) on delete set null;

-- THE NOTIFICATION RIDES ON THE ROW, NOT ON THE SCREEN THAT CHANGED IT.
--
-- A client that updates the status and then calls notify_user is a client that
-- can forget the second call, and a second client added later that never knew
-- about it. Worse, it can be told to skip it. On the trigger, telling the
-- person is not a step somebody remembers — it is what changing the status
-- means.
create or replace function public.prayer_says_somebody_is_praying()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  who text;
begin
  -- Only the moment it BECOMES praying. Re-saving a row that is already
  -- praying must not send the message again.
  if new.status is distinct from 'praying' or old.status is not distinct from 'praying' then
    return new;
  end if;

  -- Stamp it once. `coalesce` so a later edit cannot move the date of a thing
  -- that already happened.
  new.praying_at := coalesce(new.praying_at, now());
  new.praying_by := coalesce(new.praying_by, auth.uid());

  -- An Explorer marking their OWN request needs no message about it.
  if new.ds_id = auth.uid() then
    return new;
  end if;

  select coalesce(nullif(btrim(split_part(full_name, ' ', 1)), ''), 'Your Guide')
    into who
  from profiles where id = auth.uid();

  -- NO PRAYER TEXT IN THE MESSAGE. This becomes a pop-up on a phone, and a
  -- phone shows pop-ups on a locked screen to whoever is holding it. The one
  -- thing a person confided privately is the one thing that must not appear
  -- there. The app has it; the notification does not need it.
  perform notify_user(
    new.ds_id,
    'prayer',
    coalesce(who, 'Your Guide') || ' is praying with you',
    'They have seen what you asked prayer for.'
  );

  return new;
end;
$$;

drop trigger if exists prayer_praying_tells_the_author on public.prayer_requests;
create trigger prayer_praying_tells_the_author
  before update on public.prayer_requests
  for each row execute function public.prayer_says_somebody_is_praying();

-- Same grant rule the rest of the definer functions live under (0012).
revoke all on function public.prayer_says_somebody_is_praying() from public;
revoke all on function public.prayer_says_somebody_is_praying() from anon;
