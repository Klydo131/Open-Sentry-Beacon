-- A conversation can say it your way.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 14 NOVEMBER 2026: the chat read as plain beside the apps young
-- adults already use. Two things here need the database; the rest (an emoji
-- picker, stickers, a look for your own side) is in the app and needs nothing.
--
--   1. MORE REACTIONS, STILL FROM A LIST. The six of 1 October stay first;
--      twenty-four more sit behind "More". The column is still not free text:
--      the check and react_to() carry the same list as lib/talk/reactions.ts,
--      and tests/a-conversation-can-reply-react-and-speak.mjs fails if they
--      differ. Everything else about a reaction is unchanged: only the two
--      people in the pairing, one per person per thing, thirty a minute, and
--      taking one back empties the row.
--
--   2. A MESSAGE CAN ARRIVE WITH AN EFFECT. One short word from a fixed five,
--      checked here, which the other person's screen plays once. It is a
--      column of its own rather than a mark hidden in the words, so a report
--      copied for safeguarding shows exactly what was written.
--
-- SENDING MAY WRITE FIVE COLUMNS NOW, AND STILL NO OTHERS: the four of
-- 1 October and `effect`.
--
-- SAFE TO RUN TWICE, and it changes nothing that is already stored.
-- ---------------------------------------------------------------------------

begin;

-- 1. REACTIONS ---------------------------------------------------------------

alter table public.message_reactions
  drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions
  add constraint message_reactions_emoji_check check (emoji is null or emoji in (
    '🙏', '❤️', '👍', '😂', '😮', '😢', '🙌', '🎉', '👏', '🔥', '💯', '✨', '🤗', '😊', '😍', '🥹', '😅', '🤔', '😴', '💪', '🫶', '👀', '✅', '📖', '🕊️', '🌅', '🎵', '💛', '😇', '🥳'
  ));

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
  if p_emoji is not null and p_emoji not in (
    '🙏', '❤️', '👍', '😂', '😮', '😢', '🙌', '🎉', '👏', '🔥', '💯', '✨', '🤗', '😊', '😍', '🥹', '😅', '🤔', '😴', '💪', '🫶', '👀', '✅', '📖', '🕊️', '🌅', '🎵', '💛', '😇', '🥳'
  ) then
    raise exception 'That is not one of the reactions the app offers.';
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


-- The public wrapper and its grants are unchanged from 20261001120000; they
-- are stated again so this file stands on its own.
revoke all on function private.react_to(uuid, uuid, text) from public, anon;
grant execute on function private.react_to(uuid, uuid, text) to authenticated;

-- 2. AN EFFECT ON A MESSAGE --------------------------------------------------

alter table public.messages add column if not exists effect text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.messages'::regclass and conname = 'messages_effect_is_known'
  ) then
    alter table public.messages
      add constraint messages_effect_is_known
      check (effect is null or effect in ('confetti', 'stars', 'balloons', 'fireworks', 'hearts'));
  end if;
end $$;

comment on column public.messages.effect is
  'What the message was sent with, played once on the other screen. One of a fixed five, or null.';

revoke insert on public.messages from authenticated;
grant  insert (pairing_id, sender_id, body, reply_to, effect) on public.messages to authenticated;

commit;
