-- Editing and taking back in the Guides' room, and a delete that stops
-- destroying the thing it removes.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ALREADY HERE, AND WHY IT WAS THE WRONG SHAPE.
-- ---------------------------------------------------------------------------
--
-- Unlike the Explorer conversation, this room COULD already delete:
-- `guide_room_drop` permits the author or church leadership. Three things were
-- wrong with it, and only the first is the feature that was asked for.
--
--   1. NO EDITING AT ALL. There is no UPDATE policy, so a typo stood for good
--      or the whole message had to be destroyed and written again.
--
--   2. THE DELETE DESTROYED THE RECORD. A real `delete from`, so the words were
--      gone from the database entirely. This is the room where Guides say the
--      hard parts of carrying people out loud, and leadership is in it. If a
--      safeguarding question is ever asked about something said here. has to mean "removed from the screen", not "removed from
--      existence" -- the rule this project wrote after the Guild Room shipped
--      without it, and applied to the Explorer conversation yesterday.
--
--   3. IT LEFT A GAP. Nothing marked that anything had been there, so a thread
--      somebody had read changed shape between visits with no explanation. In a
--      room where leadership can remove somebody else's words, a silent gap is
--      the worst possible rendering: the author is not told, and the others
--      cannot tell the difference between a message that was removed and one
--      they misremember.
--
-- So the delete becomes a soft one, through a function, and the hard-delete
-- policy goes. Leadership keeps exactly the power it had -- it is simply
-- recorded now.

alter table public.guide_room_messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

-- A live message says something; a deleted one says nothing, because the words
-- move out of the row. Same shape as the conversation's constraint.
alter table public.guide_room_messages drop constraint if exists guide_room_messages_body_check;
alter table public.guide_room_messages add constraint guide_room_messages_body_check
  check (
    (deleted_at is null     and length(btrim(body)) between 1 and 4000)
    or
    (deleted_at is not null and length(body) = 0)
  );

-- ---------------------------------------------------------------------------
-- WHAT WAS SAID, KEPT WHERE NO BROWSER CAN REACH IT
-- ---------------------------------------------------------------------------
--
-- A separate table from `message_revisions` rather than a shared one. That
-- table's foreign keys are `messages(id)` and `pairings(id)`; making it serve
-- both rooms would mean nullable keys and a "which room is this" column, which
-- is how a record that must be exact becomes a record nobody can query
-- confidently. Two small honest tables beat one clever one.

create table if not exists public.guide_room_revisions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.guide_room_messages (id) on delete cascade,
  church_id   uuid not null references public.churches (id) on delete cascade,
  author_id   uuid references public.profiles (id),
  changed_by  uuid references public.profiles (id),
  body        text not null,
  reason      text not null check (reason in ('edited', 'deleted')),
  recorded_at timestamptz not null default now()
);

create index if not exists guide_room_revisions_message_idx
  on public.guide_room_revisions (message_id, recorded_at desc);
create index if not exists guide_room_revisions_church_idx
  on public.guide_room_revisions (church_id, recorded_at desc);

comment on table public.guide_room_revisions is
  'What a Guides room message said before it was edited or taken back, and who '
  'changed it. RLS on with no policy and no grant: unreadable from a browser by '
  'anybody, including the leadership who can remove a message. Read through a '
  'definer function when a safeguarding question is being answered.';

alter table public.guide_room_revisions enable row level security;
revoke all on public.guide_room_revisions from authenticated, anon;

-- `changed_by` EXISTS BECAUSE THIS ROOM IS NOT SYMMETRIC. In the Explorer
-- conversation only the author can remove anything, so the author IS the
-- remover. Here leadership can remove somebody else's message, and a record
-- that cannot distinguish "she withdrew it" from "a Director removed it" is
-- not much of a record.

-- ---------------------------------------------------------------------------
-- EDIT: THE AUTHOR, AND ONLY THE AUTHOR
-- ---------------------------------------------------------------------------
--
-- Leadership can REMOVE a message here, and deliberately cannot REWRITE one.
-- Removing something and putting different words in somebody's mouth are not
-- the same power, and only the first belongs to a moderator.

create or replace function private.edit_guide_room_message(p_message uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.guide_room_messages%rowtype;
  v_new text := btrim(coalesce(p_body, ''));
begin
  select * into v_msg from public.guide_room_messages where id = p_message;
  if v_msg.id is null then
    raise exception 'That message no longer exists.';
  end if;
  if v_msg.author_id is distinct from (select auth.uid()) then
    raise exception 'You can only change your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;
  if length(v_new) not between 1 and 4000 then
    raise exception 'A message has to say something, and fit in 4000 characters.';
  end if;
  if v_new = v_msg.body then
    return;
  end if;

  insert into public.guide_room_revisions
    (message_id, church_id, author_id, changed_by, body, reason)
  values (v_msg.id, v_msg.church_id, v_msg.author_id, (select auth.uid()), v_msg.body, 'edited');

  update public.guide_room_messages
     set body = v_new, edited_at = now()
   where id = v_msg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETE: THE AUTHOR, OR LEADERSHIP OF THAT CHURCH
-- ---------------------------------------------------------------------------
--
-- Exactly who `guide_room_drop` allowed. Nobody gains a power and nobody loses
-- one; the difference is that the words survive and the removal is attributed.

create or replace function private.delete_guide_room_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.guide_room_messages%rowtype;
begin
  select * into v_msg from public.guide_room_messages where id = p_message;
  if v_msg.id is null then
    raise exception 'That message no longer exists.';
  end if;
  if not (v_msg.author_id is not distinct from (select auth.uid())
          or public.leads_church(v_msg.church_id)) then
    raise exception 'You can only take back your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    return;
  end if;

  insert into public.guide_room_revisions
    (message_id, church_id, author_id, changed_by, body, reason)
  values (v_msg.id, v_msg.church_id, v_msg.author_id, (select auth.uid()), v_msg.body, 'deleted');

  update public.guide_room_messages
     set body = '', deleted_at = now(), deleted_by = (select auth.uid())
   where id = v_msg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT LEADERSHIP CAN READ
-- ---------------------------------------------------------------------------

create or replace function private.guide_room_history_for_leader(p_church uuid)
returns table (
  message_id  uuid,
  author_id   uuid,
  changed_by  uuid,
  body        text,
  reason      text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.leads_church(p_church) then
    raise exception 'Only church leadership may read the room history.'
      using errcode = '42501';
  end if;
  return query
  select r.message_id, r.author_id, r.changed_by, r.body, r.reason, r.recorded_at
  from public.guide_room_revisions r
  where r.church_id = p_church
  order by r.recorded_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- THE HARD DELETE GOES, AND THE BROWSER LOSES THE COLUMNS IT NEVER WROTE
-- ---------------------------------------------------------------------------
--
-- Dropping `guide_room_drop` is what makes the record durable: while a real
-- `delete from` is permitted, everything above can be bypassed by doing the
-- thing this replaces.
--
-- And the column grant, for the same reason as the four tables narrowed
-- earlier today: the app writes nothing to this table by UPDATE, so the browser
-- is granted no UPDATE at all. Editing goes through the function.

drop policy if exists guide_room_drop on public.guide_room_messages;
revoke update, delete on public.guide_room_messages from authenticated;

create or replace function public.edit_guide_room_message(p_message uuid, p_body text)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.edit_guide_room_message(p_message, p_body); $$;

create or replace function public.delete_guide_room_message(p_message uuid)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.delete_guide_room_message(p_message); $$;

create or replace function public.guide_room_history_for_leader(p_church uuid)
returns table (
  message_id uuid, author_id uuid, changed_by uuid,
  body text, reason text, recorded_at timestamptz)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select * from private.guide_room_history_for_leader(p_church); $$;

revoke all on function public.edit_guide_room_message(uuid, text)     from public, anon;
revoke all on function public.delete_guide_room_message(uuid)         from public, anon;
revoke all on function public.guide_room_history_for_leader(uuid)     from public, anon;
grant execute on function public.edit_guide_room_message(uuid, text)  to authenticated;
grant execute on function public.delete_guide_room_message(uuid)      to authenticated;
grant execute on function public.guide_room_history_for_leader(uuid)  to authenticated;
