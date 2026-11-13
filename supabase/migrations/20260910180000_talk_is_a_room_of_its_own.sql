-- The conversations a person has, and how many are waiting.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS.
--
-- Reported: the chat should be a place you go, not a card you scroll past.
-- People want the conversation in front of them without scrolling past other
-- features, Explorers most of all, and for Guides the chat is their main
-- connection to their Explorers.
--
-- A standalone chat surface needs two things the app could not answer:
--
--   1. WHICH CONVERSATIONS DO I HAVE. An Explorer has one; a Guide has up to
--      five, and needs them in one place with the waiting ones on top.
--   2. HOW MANY ARE WAITING. Without a count there is no badge, and without a
--      badge a chat you have to open to check is a chat you forget.
--
-- WHY A FUNCTION RATHER THAN A QUERY. The obvious client version is , which downloads every
-- word of every conversation to display a number. It works at this church's
-- size and stops working quietly. One round trip, no bodies except the one line
-- the list actually shows.
--
-- IT DISCLOSES NOTHING NEW. Every row it returns is a pairing this caller is
-- already in and messages they can already read -- `in_pairing` is the same test
-- `messages_read` applies. The preview is the last line of a conversation they
-- are a party to.

create or replace function private.my_threads()
returns table (
  pairing_id   uuid,
  other_id     uuid,
  other_name   text,
  unread       bigint,
  last_at      timestamptz,
  last_preview text,
  last_is_mine boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  me uuid := (select auth.uid());
begin
  return query
  with mine as (
    select p.id,
           case when p.dm_id = me then p.ds_id else p.dm_id end as other
    from public.pairings p
    where p.status = 'active' and (p.dm_id = me or p.ds_id = me)
  ),
  last_line as (
    select distinct on (m.pairing_id)
           m.pairing_id, m.body, m.sender_id, m.created_at, m.deleted_at
    from public.messages m
    join mine on mine.id = m.pairing_id
    order by m.pairing_id, m.created_at desc
  )
  select
    mine.id,
    mine.other,
    coalesce(who.full_name, 'A member'),
    (select count(*) from public.messages u
      where u.pairing_id = mine.id and u.sender_id <> me and u.read_at is null),
    l.created_at,
    -- ONE LINE, AND NEVER THE WORDS OF A MESSAGE THAT WAS TAKEN BACK. A deleted
    -- message empties its own row, so the preview would be blank rather than
    -- wrong -- but blank reads as "no messages yet", which is a different and
    -- worse lie than saying what happened.
    case
      when l.deleted_at is not null then 'Message deleted'
      when length(l.body) > 80 then left(l.body, 80) || '…'
      else l.body
    end,
    l.sender_id = me
  from mine
  join public.profiles who on who.id = mine.other
  left join last_line l on l.pairing_id = mine.id
  order by (select count(*) from public.messages u
             where u.pairing_id = mine.id and u.sender_id <> me and u.read_at is null) desc,
           l.created_at desc nulls last;
end;
$$;

create or replace function public.my_threads()
returns table (
  pairing_id uuid, other_id uuid, other_name text,
  unread bigint, last_at timestamptz, last_preview text, last_is_mine boolean)
language sql
stable
set search_path to 'public', 'private', 'pg_temp'
as $$ select * from private.my_threads(); $$;

revoke all on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;
