-- A floor under how fast one account can write.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MISSING. Nothing in this database limited how fast anybody could
-- write. An approved member could insert into `messages` as quickly as the
-- network allowed, and there are two separate costs to that:
--
--   HARASSMENT. This app's answer to one person hurting another is the report
--   route and a Director. That is the right answer to what somebody SAYS, and
--   no answer at all to somebody sending four hundred messages in a minute --
--   which is a thing a person can do to somebody they are paired with, and
--   which the Explorer on the other end experiences as the app being unusable.
--
--   AMPLIFICATION. One insert wakes every screen watching that table, and each
--   of those asks the database to recount what is waiting. One cheap write for
--   the writer becomes N pieces of work for the server, where N is however many
--   people have the app open. The client debounce shipped alongside this makes
--   N smaller; only a limit at the write makes it bounded.
--
-- WHY A TRIGGER AND NOT A POLICY. A policy can say who may insert, not how
-- often. This is the standard shape: count what that account has written in the
-- last minute, refuse past a ceiling.
--
-- THE CEILING IS DELIBERATELY GENEROUS. Forty a minute is two a second sustained
-- for sixty seconds. Nobody types that; a person in the most heated exchange
-- this app will ever carry sends a fraction of it. It is set to catch a script,
-- not a person, because a limit that occasionally catches a real member is a
-- limit that gets removed after the first complaint.
--
-- WHAT IT DOES NOT DO, SAID PLAINLY. It does not stop somebody sending forty
-- unkind messages a minute for an hour; that is what the report route and a
-- Director are for, and no counter substitutes for them. It bounds the machine,
-- not the behaviour.

create or replace function private.hold_the_pace()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  me      uuid := (select auth.uid());
  written integer;
  ceiling constant integer := 40;
begin
  -- SERVER-SIDE WRITES ARE NOT RATE LIMITED. A trigger, an edge function or a
  -- migration backfilling rows has no auth.uid() and is not the thing this
  -- exists to stop.
  if me is null then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - interval ''1 minute''',
    tg_table_name, tg_argv[0]
  ) into written using me;

  if written >= ceiling then
    raise exception 'You are sending faster than the app allows. Wait a moment and try again.'
      using errcode = '53400';
  end if;
  return new;
end;
$$;

-- THE THREE PLACES A PERSON CAN WRITE INTO A ROOM. Each names its own author
-- column, because they disagree: a conversation has a sender, a wall has an
-- author. Passing it as an argument keeps one function rather than three that
-- drift.
drop trigger if exists hold_the_pace on public.messages;
create trigger hold_the_pace
before insert on public.messages
for each row execute function private.hold_the_pace('sender_id');

drop trigger if exists hold_the_pace on public.guild_activity_posts;
create trigger hold_the_pace
before insert on public.guild_activity_posts
for each row execute function private.hold_the_pace('author_id');

drop trigger if exists hold_the_pace on public.guide_room_messages;
create trigger hold_the_pace
before insert on public.guide_room_messages
for each row execute function private.hold_the_pace('author_id');

-- The count above is per author over one minute. Without these it is a table
-- scan on every single message anybody sends, which would make the cure worse
-- than the disease.
create index if not exists messages_sender_recent_idx
  on public.messages (sender_id, created_at desc);
create index if not exists guild_posts_author_recent_idx
  on public.guild_activity_posts (author_id, created_at desc);
create index if not exists guide_room_author_recent_idx
  on public.guide_room_messages (author_id, created_at desc);
