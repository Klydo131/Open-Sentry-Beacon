-- A conversation can reply, react and speak.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 1 OCTOBER 2026, with a screenshot of the chat: "Can we improve
-- the chat more to be modern looking and functional as well ... most people
-- are digital natives. All users should feel familiar and welcoming." Chosen
-- from the options put to the owner: reactions, replying to a message, and
-- voice messages. Three things every messaging app people already use does,
-- each built here on the one rule that has always governed this table:
--
--   ONLY THE TWO PEOPLE IN THE PAIRING. No Director branch, no leadership
--   view. A reaction is part of the conversation and is read by exactly who
--   reads the conversation.
--
-- WHAT THIS FILE DOES, in order:
--   1. A reply points at an earlier message IN THE SAME CONVERSATION, held by
--      the database rather than trusted from the browser.
--   2. Sending a message may write the four columns the app writes, and no
--      others. Found while adding the fourth: the browser could insert any
--      column at all, so a message could arrive already marked "edited" or
--      "deleted". Nothing in the app did; nothing should be able to.
--   3. Reactions: one per person per message or picture, from a fixed six,
--      written only through react_to() and read under the pairing's rule.
--      Taking one back is an UPDATE, never a delete (see 4), and nobody can
--      change reactions faster than thirty times a minute.
--   4. Published to the realtime feed, so a reaction appears without a
--      refresh, and only to the two people in the conversation.
--   5. The private file store accepts audio/webm, the format Chrome and
--      Android record a voice message in. Safari records audio/mp4 and Firefox
--      audio/ogg, which it already accepted.
--   6. A file's storage path is the shape the app writes and nothing else,
--      its title is short and plain, and its time is the database's. Found by
--      the security review of this change: the browser wrote every column, and
--      a path is used to build a URL in the OTHER person's browser.
--   7. Nobody can send more than ten files a minute.
--
-- NEEDS POSTGRES 15 OR LATER for `on delete set null (reply_to)` -- the column
-- list stops the database nulling pairing_id, which cannot be null, when the
-- message being replied to goes. Supabase projects run 15 or 17.
-- ---------------------------------------------------------------------------

begin;

-- 1. REPLIES -----------------------------------------------------------------
--
-- A composite key, so the database itself refuses a reply that points into a
-- different conversation. The alternative -- trusting the id the browser sent
-- -- would let somebody quote a message from a pairing they are not in, by id,
-- and have it rendered inside one they are in.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.messages'::regclass and conname = 'messages_id_pairing_key'
  ) then
    alter table public.messages
      add constraint messages_id_pairing_key unique (id, pairing_id);
  end if;
end $$;

alter table public.messages add column if not exists reply_to uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.messages'::regclass and conname = 'messages_reply_in_same_pairing'
  ) then
    -- A message is normally never deleted -- taking one back empties its body
    -- and keeps the row -- so this only fires when a whole pairing goes, and
    -- then the reply goes with it anyway. `set null (reply_to)` is the safe
    -- answer for any other route there might one day be.
    alter table public.messages
      add constraint messages_reply_in_same_pairing
      foreign key (reply_to, pairing_id)
      references public.messages (id, pairing_id)
      on delete set null (reply_to);
  end if;
end $$;

comment on column public.messages.reply_to is
  'The earlier message, in the same conversation, that this one answers. '
  'Held to the same pairing by messages_reply_in_same_pairing.';

-- 2. SENDING WRITES WHAT THE APP WRITES ------------------------------------
--
-- lib/live/data.ts sendMessage() inserts pairing_id, sender_id, body and now
-- reply_to. id and created_at take their defaults. edited_at, deleted_at and
-- deleted_by are set only by edit_message() and delete_message(), which run as
-- their owner and are not affected by this grant. read_at is set by the other
-- person through the UPDATE (read_at) grant, never on the way in.
revoke insert on public.messages from authenticated;
grant  insert (pairing_id, sender_id, body, reply_to) on public.messages to authenticated;

-- 3. REACTIONS ---------------------------------------------------------------
--
-- On a message or on a picture or file in the conversation: exactly one of the
-- two. Each carries the pairing, so the read rule is one comparison and the
-- realtime feed can apply it, and the composite keys hold the pairing to the
-- thing being reacted to.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pairing_media'::regclass and conname = 'pairing_media_id_pairing_key'
  ) then
    alter table public.pairing_media
      add constraint pairing_media_id_pairing_key unique (id, pairing_id);
  end if;
end $$;

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings (id) on delete cascade,
  message_id uuid,
  media_id   uuid,
  person_id  uuid not null references public.profiles (id) on delete cascade,
  -- THE SIX, and only these. lib/talk/reactions.ts carries the same list for
  -- the screen and tests/a-conversation-can-reply-react-and-speak.mjs fails if
  -- the two differ. A free-text emoji column is a free-text column.
  --
  -- NULL IS A REACTION TAKEN BACK. The row stays and its emoji empties,
  -- because a DELETE on the realtime feed goes to every subscriber in every
  -- church (section 4), and an UPDATE goes only to the two people here.
  emoji      text check (emoji is null or emoji in ('🙏', '❤️', '👍', '😂', '😮', '😢')),
  created_at timestamptz not null default now(),
  constraint message_reactions_one_target check (num_nonnulls(message_id, media_id) = 1),
  constraint message_reactions_message_in_pairing
    foreign key (message_id, pairing_id)
    references public.messages (id, pairing_id) on delete cascade,
  constraint message_reactions_media_in_pairing
    foreign key (media_id, pairing_id)
    references public.pairing_media (id, pairing_id) on delete cascade
);

-- One reaction per person per thing. Choosing another replaces it.
create unique index if not exists message_reactions_one_per_message
  on public.message_reactions (message_id, person_id) where message_id is not null;
create unique index if not exists message_reactions_one_per_media
  on public.message_reactions (media_id, person_id) where media_id is not null;
create index if not exists message_reactions_pairing_idx
  on public.message_reactions (pairing_id);

comment on table public.message_reactions is
  'A reaction to a message or attachment in a pairing. Read by the two people in '
  'the pairing only; written only through public.react_to().';

alter table public.message_reactions enable row level security;

drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

-- A SUSPENDED ACCOUNT SEES NOTHING, on this table as on every other one the
-- realtime feed carries (20260923173000_a_suspension_reaches_the_socket_too).
-- my_pairing_ids() already refuses them; this is the same rule every published
-- table wears, and supabase/tests/fresh-install-holds.sql checks it is here.
drop policy if exists a_suspended_account_sees_nothing on public.message_reactions;
create policy a_suspended_account_sees_nothing on public.message_reactions
  as restrictive for select to authenticated
  using ((select private.i_am_not_suspended()));

-- READ, AND NOTHING ELSE, FROM A BROWSER. There is no insert, update or delete
-- policy and no grant for them: every change goes through react_to(), which
-- checks the caller, the conversation and the emoji in one place.
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

-- THE PACE OF REACTING. One row per change, kept for a minute. A reaction is
-- one tap, so a script can tap thousands of times a minute, and every change
-- wakes the other person's screen. Thirty a minute is far more than a person
-- reacts and far fewer than a flood. Private: no browser can read or write it.
create table if not exists private.reaction_pace (
  person_id uuid not null,
  at        timestamptz not null default now()
);
create index if not exists reaction_pace_person_idx on private.reaction_pace (person_id, at desc);
alter table private.reaction_pace enable row level security;
revoke all on private.reaction_pace from public, anon, authenticated;

/**
 * React to a message or attachment, change the reaction, or take it back.
 *
 * Exactly one of p_message and p_media. A null p_emoji takes your reaction
 * back. Only somebody in the conversation, approved and not suspended (both
 * are in my_pairing_ids()), and never on a message that was taken back --
 * there is nothing left there to react to.
 *
 * MEMBERSHIP IS ASKED FIRST, and "no such message" and "not your conversation"
 * are one answer. The first version said "taken back" before it asked whose
 * the message was, so anybody signed in could learn whether any message id
 * existed and had been withdrawn.
 */
create or replace function private.react_to(p_message uuid, p_media uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_me      uuid := (select auth.uid());
  v_pairing uuid;
  v_deleted timestamptz;
  v_recent  integer;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if num_nonnulls(p_message, p_media) <> 1 then
    raise exception 'React to one thing at a time.';
  end if;
  if p_emoji is not null and p_emoji not in ('🙏', '❤️', '👍', '😂', '😮', '😢') then
    raise exception 'That reaction is not one of the six.';
  end if;

  if p_message is not null then
    select m.pairing_id, m.deleted_at into v_pairing, v_deleted
      from public.messages m
     where m.id = p_message
       and m.pairing_id in (select private.my_pairing_ids());
  else
    select pm.pairing_id into v_pairing
      from public.pairing_media pm
     where pm.id = p_media
       and pm.pairing_id in (select private.my_pairing_ids());
  end if;

  if v_pairing is null then
    raise exception 'That conversation is not yours.' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'That message was taken back.';
  end if;

  delete from private.reaction_pace
   where person_id = v_me and at < now() - interval '1 minute';
  select count(*) into v_recent from private.reaction_pace where person_id = v_me;
  if v_recent >= 30 then
    raise exception 'You are reacting faster than the app allows. Wait a moment and try again.'
      using errcode = '53400';
  end if;
  insert into private.reaction_pace (person_id) values (v_me);

  -- TAKING IT BACK EMPTIES THE ROW; it never deletes it (see the emoji column).
  if p_emoji is null then
    update public.message_reactions
       set emoji = null, created_at = now()
     where person_id = v_me
       and emoji is not null
       and (message_id = p_message or media_id = p_media);
    return;
  end if;

  if p_message is not null then
    insert into public.message_reactions (pairing_id, message_id, person_id, emoji)
    values (v_pairing, p_message, v_me, p_emoji)
    on conflict (message_id, person_id) where message_id is not null
    do update set emoji = excluded.emoji, created_at = now();
  else
    insert into public.message_reactions (pairing_id, media_id, person_id, emoji)
    values (v_pairing, p_media, v_me, p_emoji)
    on conflict (media_id, person_id) where media_id is not null
    do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$$;

create or replace function public.react_to(p_message uuid, p_media uuid, p_emoji text)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.react_to(p_message, p_media, p_emoji); $$;

revoke all on function private.react_to(uuid, uuid, text) from public, anon;
grant execute on function private.react_to(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.react_to(uuid, uuid, text) from public, anon;
grant execute on function public.react_to(uuid, uuid, text) to authenticated;

-- 4. THE REALTIME FEED -------------------------------------------------------
--
-- The full row, so the read rule -- which decides on pairing_id, not the key
-- -- has something to test on every change.
--
-- WHAT THE FEED DOES NOT DO, and why section 3 never deletes. Supabase applies
-- the read rule to inserts and updates only. A DELETE is sent to every
-- subscriber of the table, in every church, trimmed to the row's key. The
-- first version of this file said the full row would let the rule be applied
-- to a delete; it does not, and the security review of this change caught the
-- claim. So a reaction taken back is an UPDATE, which only the two people in
-- the conversation hear about. A reaction row is deleted only when the message,
-- the file or the whole pairing goes.
do $$
declare
  t text;
  tables text[] := array['message_reactions'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 5. A VOICE MESSAGE FROM CHROME OR ANDROID ---------------------------------
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'audio/webm')
 where id = 'pairing-media'
   and allowed_mime_types is not null
   and not ('audio/webm' = any (allowed_mime_types));

-- 6. A FILE'S ROW SAYS WHAT THE APP WROTE ----------------------------------
--
-- THE PATH BUILDS A URL IN THE OTHER PERSON'S BROWSER. When a picture is drawn,
-- the recipient's app asks the file store to sign `<path>`, carrying the
-- recipient's sign-in, and the storage library puts the path into the URL as
-- it is. A path of `../../auth/v1/logout` would have signed the recipient out
-- of every device each time they opened the chat. The app has only ever
-- written `<pairing_id>/<uuid>` (lib/live/data.ts sendPairingFile); now that
-- is the only shape the database accepts. lib/live/storage-path.ts refuses an
-- unsafe path in the browser too, for rows written before this.
--
-- NOT VALID: new rows are held to it, and rows already there are not
-- re-checked. The release steps count any old row that would fail before this
-- runs (docs/CHAT-RESEARCH.md).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pairing_media'::regclass and conname = 'pairing_media_path_shape'
  ) then
    alter table public.pairing_media
      add constraint pairing_media_path_shape check (
        path ~ ('^' || pairing_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      ) not valid;
  end if;

  -- A TITLE IS A NAME, NOT A PAGE. Two hundred characters, and none of the
  -- invisible characters that reverse the text after them -- the trick that
  -- shows `photo<U+202E>gnp.js` as "photosj.png".
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pairing_media'::regclass and conname = 'pairing_media_title_plain'
  ) then
    alter table public.pairing_media
      add constraint pairing_media_title_plain check (
        char_length(title) between 1 and 200
        and title !~ '[\u202A-\u202E\u2066-\u2069]'
      ) not valid;
  end if;
end $$;

-- THE SAME LESSON AS SECTION 2. sendPairingFile() writes these six columns.
-- id and created_at take their defaults: a browser that could set created_at
-- could place a file anywhere in the timeline, and slip under the pace limit
-- in section 7, which counts by it.
revoke insert on public.pairing_media from authenticated;
grant  insert (pairing_id, owner_id, title, mime, size, path) on public.pairing_media to authenticated;

-- 7. TEN FILES A MINUTE ------------------------------------------------------
--
-- The pace rule every other place a person writes into a conversation already
-- has (20260910200000_nobody_can_flood_a_room), with one change: the ceiling
-- can be passed, because forty ten-megabyte files a minute is not a limit.
-- With no second argument it is forty, exactly as before, so the three
-- existing triggers behave as they did.
create or replace function private.hold_the_pace()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  me      uuid := (select auth.uid());
  written integer;
  ceiling integer := coalesce(nullif(tg_argv[1], '')::integer, 40);
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

drop trigger if exists hold_the_pace on public.pairing_media;
create trigger hold_the_pace
before insert on public.pairing_media
for each row execute function private.hold_the_pace('owner_id', '10');

create index if not exists pairing_media_owner_recent_idx
  on public.pairing_media (owner_id, created_at desc);

commit;
