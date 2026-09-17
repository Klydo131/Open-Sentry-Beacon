-- A new member's pocket is not empty on the first day.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "please make faithlife as the default (can be removed or add by
-- users too) web app in the pocket app please."
--
-- WHY A TRIGGER AND NOT A LINE IN THE SCREEN, which is the whole design and the
-- only part worth arguing about. A default that the app puts back is not a
-- default, it is a nag: somebody who removes a tile has said what they want,
-- and code that seeds "when the pocket is empty" argues with them every time
-- they open the room. There is no way to write that rule on the screen without
-- also needing a record of what has already been given, which is a second
-- source of truth for a bookmark.
--
-- Given once, when the account is made, it needs no record at all. After that
-- the rows belong entirely to the person: they can remove it, add it back, add
-- ten more, and nothing anywhere will ever reach in again.
--
-- WHY IT CANNOT BREAK AN ACCOUNT BEING CREATED. A pocket is a convenience and
-- a profile is not. The handler swallows its own failures, so the worst case is
-- somebody starting with an empty pocket rather than somebody unable to join.
-- ---------------------------------------------------------------------------

create or replace function public.give_a_starting_pocket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Faithlife: Bible study software the church already uses. One row, the same
  -- shape as anything a member adds themselves, with no flag marking it as
  -- special -- because it is not special once it is theirs.
  insert into public.pocket_apps (owner_id, url, label)
  values (new.id, 'https://faithlife.com', 'Faithlife');
  return new;
exception when others then
  -- An empty pocket is a small disappointment. A profile that could not be
  -- written is somebody who cannot use the app at all.
  return new;
end;
$$;

revoke all on function public.give_a_starting_pocket() from public, anon, authenticated;

drop trigger if exists profiles_start_with_a_pocket on public.profiles;
create trigger profiles_start_with_a_pocket
  after insert on public.profiles
  for each row execute function public.give_a_starting_pocket();

-- AND THE PEOPLE WHO ARE ALREADY HERE, once. Written so that running this
-- migration again adds nothing: anybody who has a Faithlife tile keeps exactly
-- the one they have, and anybody who removes it after today will not have it
-- put back, because this runs only when the migration does.
insert into public.pocket_apps (owner_id, url, label)
select p.id, 'https://faithlife.com', 'Faithlife'
from public.profiles p
where not exists (
  select 1 from public.pocket_apps a
  where a.owner_id = p.id
    and a.url ilike '%faithlife.com%'
);
