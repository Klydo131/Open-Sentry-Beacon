-- Editing and deleting a message, and the record that survives both.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED FOR, AND THE HOLE IT WAS ABOUT TO BE BUILT ON TOP OF.
-- ---------------------------------------------------------------------------
--
-- Asked for.
--
-- Before any of that, a live fault, found while looking for where edit would
-- go. `messages_mark` is an UPDATE policy that exists so the RECIPIENT can
-- stamp `read_at`:
--
--     for update to authenticated
--     using (in_pairing(pairing_id)) with check (in_pairing(pairing_id))
--
-- RLS is row level. That policy says nothing about WHICH COLUMNS may change and
-- nothing about being the author, so it also permitted this, verified against
-- the live database rather than reasoned about:
--
--     UPDATE by the other person affected 1 row(s)
--
-- EITHER PERSON IN A PAIRING COULD SILENTLY REWRITE THE OTHER'S WORDS. No
-- trace, no attribution, nothing on screen to show it had happened. In an app
-- where the conversation IS the safeguarding record and some Explorers are
-- children, that is the whole record being untrustworthy. Nobody appears to
-- have used it; that is luck, not a control.
--
-- Deleting, by contrast, was simply impossible: no DELETE policy, so a delete
-- matched no rows and silently did nothing.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND WHY DELETING DOES NOT DESTROY ANYTHING.
-- ---------------------------------------------------------------------------
--
-- This app already has a rule for this, written after the Guild Room shipped
-- without it: every place one person can be hurt by another has a way to report
-- it, somebody whose job it is to look, and A RECORD THAT OUTLIVES THE PERSON
-- IT DESCRIBES. `report_guild_post` copies the post's words into the report
-- precisely because the first thing a reported person does is delete.
--
-- So a delete here is not a delete. The words are MOVED, not destroyed:
--
--   * `message_revisions` keeps what was said, with why it stopped being said.
--     RLS on, NO POLICY, no grant -- unreadable from any browser, by anybody,
--     including the two people in the conversation. Leadership reads it through
--     a definer function when a report is being looked at, and nowhere else.
--   * `messages.body` is emptied, so the row a browser can read no longer
--     carries the words. This is the Guild wall lesson applied: realtime and
--     RLS are ROW level, so hiding a column means taking it out of the row.
--   * `deleted_at` and `deleted_by` stay on the row, because the note asked for
--     -- "X deleted a message" -- is the point of the feature.
--
-- An edit keeps the previous wording the same way. Editing is not a way to
-- rewrite what you said after being challenged on it; it is a way to fix a typo
-- while the record of both versions stays.

-- ---------------------------------------------------------------------------
-- THE COLUMNS
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

-- A live message still has to say something. A deleted one has to say nothing:
-- the check would otherwise refuse the empty body that removes the words from
-- the row, and the words would have to stay where the browser can read them.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    (deleted_at is null     and length(body) between 1 and 4000)
    or
    (deleted_at is not null and length(body) = 0)
  );

-- ---------------------------------------------------------------------------
-- WHAT WAS SAID, KEPT WHERE NO BROWSER CAN REACH IT
-- ---------------------------------------------------------------------------

create table if not exists public.message_revisions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  pairing_id  uuid not null references public.pairings (id) on delete cascade,
  author_id   uuid not null references public.profiles (id),
  body        text not null,
  reason      text not null check (reason in ('edited', 'deleted')),
  recorded_at timestamptz not null default now()
);

create index if not exists message_revisions_message_idx
  on public.message_revisions (message_id, recorded_at desc);
create index if not exists message_revisions_pairing_idx
  on public.message_revisions (pairing_id, recorded_at desc);

comment on table public.message_revisions is
  'What a message said before it was edited or deleted. RLS on with no policy: '
  'unreadable from a browser by anybody, including the two people in the '
  'conversation. Read by leadership through a definer function when a report is '
  'being looked at.';

alter table public.message_revisions enable row level security;
-- NO POLICY AND NO GRANT, deliberately. See the comment above. This is the same
-- pattern as security_audit_events: a record kept about people, that the people
-- it is about cannot reach.

-- ---------------------------------------------------------------------------
-- CLOSING THE HOLE
-- ---------------------------------------------------------------------------
--
-- RLS cannot say "only this column". Column privileges can, and they compose:
-- the policy still decides WHICH ROWS, the grant decides WHICH COLUMNS. After
-- this, the only thing a browser may change on a message is the read receipt,
-- which is the only thing the app ever changed.
--
-- Editing and deleting go through the definer functions below instead, which
-- can check that the caller is the author -- something a policy of this shape
-- was never going to do.

revoke update on public.messages from authenticated;
grant  update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- EDIT
-- ---------------------------------------------------------------------------

create or replace function private.edit_message(p_message uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.messages%rowtype;
  v_new text := btrim(coalesce(p_body, ''));
begin
  select * into v_msg from public.messages where id = p_message;
  if v_msg.id is null then
    raise exception 'That message no longer exists.';
  end if;

  -- THE AUTHOR, AND ONLY THE AUTHOR. The other person in the pairing could do
  -- this until today; that is the fault this function exists to end.
  if v_msg.sender_id <> (select auth.uid()) then
    raise exception 'You can only change your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;
  if length(v_new) not between 1 and 4000 then
    raise exception 'A message has to say something, and fit in 4000 characters.';
  end if;
  -- Nothing to record and nothing to change. Saving an unchanged message should
  -- not litter the record with a revision that says the same as the row.
  if v_new = v_msg.body then
    return;
  end if;

  insert into public.message_revisions (message_id, pairing_id, author_id, body, reason)
  values (v_msg.id, v_msg.pairing_id, v_msg.sender_id, v_msg.body, 'edited');

  update public.messages
     set body = v_new, edited_at = now()
   where id = v_msg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- DELETE
-- ---------------------------------------------------------------------------

create or replace function private.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.messages%rowtype;
begin
  select * into v_msg from public.messages where id = p_message;
  if v_msg.id is null then
    raise exception 'That message no longer exists.';
  end if;
  if v_msg.sender_id <> (select auth.uid()) then
    raise exception 'You can only take back your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    return;                                   -- already gone; pressing twice is fine
  end if;

  insert into public.message_revisions (message_id, pairing_id, author_id, body, reason)
  values (v_msg.id, v_msg.pairing_id, v_msg.sender_id, v_msg.body, 'deleted');

  -- The words leave the row. The fact of it, and who did it, stay -- that note
  -- is the thing that was asked for, and it is also what stops a deletion
  -- looking like a message that was never sent.
  update public.messages
     set body = '', deleted_at = now(), deleted_by = (select auth.uid())
   where id = v_msg.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT LEADERSHIP CAN READ, AND WHEN
-- ---------------------------------------------------------------------------
--
-- Not the conversation. This returns what was edited or deleted in a pairing,
-- for somebody who leads that church, which is the same bar the rest of
-- safeguarding uses. It exists so that "they deleted it before you looked" is
-- not an answer anybody has to accept.

create or replace function private.message_history_for_leader(p_pairing uuid)
returns table (
  message_id  uuid,
  author_id   uuid,
  body        text,
  reason      text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_church uuid;
begin
  select p.church_id into v_church from public.pairings p where p.id = p_pairing;
  if v_church is null then
    raise exception 'No such pairing.';
  end if;
  if not public.leads_church(v_church) then
    raise exception 'Only church leadership may read a message history.'
      using errcode = '42501';
  end if;

  return query
  select r.message_id, r.author_id, r.body, r.reason, r.recorded_at
  from public.message_revisions r
  where r.pairing_id = p_pairing
  order by r.recorded_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- THE PUBLIC DOORS
-- ---------------------------------------------------------------------------

create or replace function public.edit_message(p_message uuid, p_body text)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.edit_message(p_message, p_body); $$;

create or replace function public.delete_message(p_message uuid)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.delete_message(p_message); $$;

create or replace function public.message_history_for_leader(p_pairing uuid)
returns table (
  message_id uuid, author_id uuid, body text, reason text, recorded_at timestamptz
)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select * from private.message_history_for_leader(p_pairing); $$;

revoke all on function public.edit_message(uuid, text)          from public, anon;
revoke all on function public.delete_message(uuid)              from public, anon;
revoke all on function public.message_history_for_leader(uuid)  from public, anon;
grant execute on function public.edit_message(uuid, text)         to authenticated;
grant execute on function public.delete_message(uuid)             to authenticated;
grant execute on function public.message_history_for_leader(uuid) to authenticated;
