-- A conversation can reply, react and speak: the rules, exercised as people.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as four invented people in two
-- conversations (20261001120000_a_conversation_can_reply_react_and_speak):
--
--   * a reply can only point at a message in the same conversation;
--   * a message cannot arrive already marked edited, deleted or read;
--   * reactions are one per person per thing, from the six, written only
--     through react_to(), read only by the two people, never by a suspended
--     account or a signed-out visitor, and never on a message taken back;
--   * taking a reaction back empties the row rather than deleting it, react_to
--     says the same thing for "no such message" and "not yours", and nobody
--     can change reactions more than thirty times a minute;
--   * a file's row holds the path shape the app writes, a short plain title
--     and the database's own time, and nobody sends more than ten a minute;
--   * reactions travel on the realtime feed with the full row.
--
-- EVERYTHING IS ROLLED BACK. The fixtures exist only inside one transaction,
-- so the fingerprint printed afterwards is the database as a church gets it.
-- Any FAIL raises at the end, which stops the install script and CI.
--
-- Written on 1 October 2026 against Postgres 16 with a stand-in for the
-- Supabase platform; CI runs it on the supabase/postgres image.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon;
-- FIXTURES ------------------------------------------------------------------- a/b walk together in pairing f1; c/d in f2. All fictional.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'guide-one@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'explorer-one@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'guide-two@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'explorer-two@example.test');
insert into public.churches (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Test Chapel');
update public.profiles set is_approved = true, church_id = '00000000-0000-0000-0000-0000000000c1',
  full_name = 'Person ' || right(id::text, 1),
  role = case when right(id::text, 1) in ('a', 'c') then 'dm'::user_role else 'ds'::user_role end;
insert into public.pairings (id, dm_id, ds_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d');
insert into public.messages (id, pairing_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'Hello from b', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000d', 'Hello from d', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'Taken back soon', now() - interval '50 minutes');
insert into public.pairing_media (id, pairing_id, owner_id, title, mime, size, path) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'photo.jpg', 'image/jpeg', 100, '00000000-0000-0000-0000-0000000000f1/00000000-0000-4000-8000-000000000a01');

-- A helper that runs one statement as somebody and reports the result.
create or replace function pg_temp.as_person(p_who text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (p_expect = 'error' or v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

-- REPLIES ---------------------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.messages (pairing_id, sender_id, body, reply_to) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Replying', '00000000-0000-0000-0000-000000000e01')$q$,
  'ok', 'a replies to b, in their own conversation');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.messages (pairing_id, sender_id, body, reply_to) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Sneaky', '00000000-0000-0000-0000-000000000e02')$q$,
  '23503', 'a cannot quote a message from somebody else''s conversation');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.messages (pairing_id, sender_id, body, deleted_at) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Fake', now())$q$,
  '42501', 'a cannot send a message already marked deleted');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.messages (pairing_id, sender_id, body, edited_at) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Fake', now())$q$,
  '42501', 'a cannot send a message already marked edited');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.messages (pairing_id, sender_id, body, read_at) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Fake', now())$q$,
  '42501', 'a cannot send a message already marked read');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c',
  $q$insert into public.messages (pairing_id, sender_id, body) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000c', 'Intruder')$q$,
  'error', 'c still cannot send into a and b''s conversation');

-- REACTIONS -------------------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '🙏')$q$, 'ok', 'a reacts 🙏 to b''s message');
select pg_temp.check((select count(*) = 1 and min(emoji) = '🙏' from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01'), 'one reaction is stored');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '❤️')$q$, 'ok', 'a changes it to ❤️');
select pg_temp.check((select count(*) = 1 and min(emoji) = '❤️' from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01'), 'still one reaction, now ❤️');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '👍')$q$, 'ok', 'b reacts too');
select pg_temp.check((select count(*) = 2 from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01'), 'two people, two reactions');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to(null, '00000000-0000-0000-0000-000000000a01', '😂')$q$, 'ok', 'a reacts to a photo');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e02', null, '🙏')$q$, 'not yours', 'a cannot react inside somebody else''s conversation');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '🔥')$q$, 'not one of the six', 'a reaction outside the six is refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000a01', '🙏')$q$, 'one thing', 'reacting to two things at once is refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$insert into public.message_reactions (pairing_id, message_id, person_id, emoji) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-00000000000b', '😢')$q$,
  '42501', 'nobody can write a reaction straight into the table (or as somebody else)');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$update public.message_reactions set emoji = '😢'$q$, '42501', 'nor change one directly');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$delete from public.message_reactions$q$, '42501', 'nor delete one directly');

-- Reading: the two people, nobody else.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.message_reactions) = 0, 'c sees none of a and b''s reactions');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.message_reactions) = 3, 'b sees all three in their conversation');
reset role;

-- Taking a reaction back, and a taken-back message.
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, null)$q$, 'ok', 'a takes their reaction away');
select pg_temp.check((select count(*) = 1 from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01' and emoji is not null), 'only b''s is left');
-- AN UPDATE, NOT A DELETE: the realtime feed sends a delete to everybody.
select pg_temp.check((select count(*) = 1 from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01' and person_id = '00000000-0000-0000-0000-00000000000a' and emoji is null), 'taking it back empties a''s row and keeps it');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '🙏')$q$, 'ok', 'a reacts again');
select pg_temp.check((select count(*) = 1 and min(emoji) = '🙏' from public.message_reactions where message_id = '00000000-0000-0000-0000-000000000e01' and person_id = '00000000-0000-0000-0000-00000000000a'), 'into the same row');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$select public.delete_message('00000000-0000-0000-0000-000000000e03')$q$, 'ok', 'b takes a message back');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e03', null, '🙏')$q$, 'taken back', 'nobody can react to a message that was taken back');
-- ONE ANSWER for "not yours" and "no such thing", so react_to cannot be used
-- to learn which message ids exist, or which were taken back.
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e03', null, '🙏')$q$, 'not yours', 'c asking about a and b''s taken-back message hears only "not yours"');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c',
  $q$select public.react_to('00000000-0000-0000-0000-00000000dead', null, '🙏')$q$, 'not yours', 'and a message that never existed gets the same answer');

-- THE PACE OF REACTING. now() is fixed inside one transaction, so every change
-- here counts as "this minute"; a's earlier changes count too.
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$do $x$ begin for i in 1..40 loop perform public.react_to('00000000-0000-0000-0000-000000000e01', null, case when i % 2 = 0 then '🙏' else null end); end loop; end $x$$q$,
  'faster', 'forty reaction changes in a minute are refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '😮')$q$, 'ok', 'and the pace is a''s alone: b can still react');
select pg_temp.check(not has_table_privilege('authenticated', 'private.reaction_pace', 'select')
  and not has_table_privilege('authenticated', 'private.reaction_pace', 'insert')
  and not has_table_privilege('authenticated', 'private.reaction_pace', 'delete'), 'no browser can read or reset the pace');

-- A suspended person.
update public.profiles set suspended_at = now() where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$select public.react_to('00000000-0000-0000-0000-000000000e01', null, '😮')$q$, 'not yours', 'a suspended person cannot react');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.message_reactions) = 0, 'and sees no reactions');
reset role;
update public.profiles set suspended_at = null where id = '00000000-0000-0000-0000-00000000000b';

-- A FILE'S ROW. b is in conversation f1.
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'notes.pdf', 'application/pdf', 10, '00000000-0000-0000-0000-0000000000f1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')$q$,
  'ok', 'b sends a file the way the app does');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'x.png', 'image/png', 10, '00000000-0000-0000-0000-0000000000f1/../../../../auth/v1/logout')$q$,
  '23514', 'a path that climbs out of the file store is refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'x.png', 'image/png', 10, '00000000-0000-0000-0000-0000000000f2/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4e')$q$,
  '23514', 'so is a path in another conversation''s folder');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'photo' || chr(8238) || 'gnp.js', 'image/png', 10, '00000000-0000-0000-0000-0000000000f1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4f')$q$,
  '23514', 'a title that hides a reversed name is refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', repeat('a', 201), 'image/png', 10, '00000000-0000-0000-0000-0000000000f1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c50')$q$,
  '23514', 'and so is a title over two hundred characters');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path, created_at) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'old.png', 'image/png', 10, '00000000-0000-0000-0000-0000000000f1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c51', now() - interval '1 year')$q$,
  '42501', 'nobody can backdate a file into the timeline');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b',
  $q$do $x$ begin for i in 1..12 loop insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', 'p.png', 'image/png', 10, '00000000-0000-0000-0000-0000000000f1/' || gen_random_uuid()); end loop; end $x$$q$,
  'faster', 'twelve files in a minute are refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000a',
  $q$do $x$ begin for i in 1..12 loop insert into public.messages (pairing_id, sender_id, body) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'quick ' || i); end loop; end $x$$q$,
  'ok', 'while twelve messages still go: messages keep their ceiling of forty');

-- Removing the photo removes its reactions.
delete from public.pairing_media where id = '00000000-0000-0000-0000-000000000a01';
select pg_temp.check((select count(*) = 0 from public.message_reactions where media_id = '00000000-0000-0000-0000-000000000a01'), 'removing a photo removes its reactions');

-- Anonymous: nothing at all.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  begin
    perform count(*) from public.message_reactions;
    insert into results values (false, 'the signed-out role cannot read reactions');
  exception when insufficient_privilege then insert into results values (true, 'the signed-out role cannot read reactions');
  end;
  begin
    perform public.react_to('00000000-0000-0000-0000-000000000e01', null, '🙏');
    insert into results values (false, 'the signed-out role cannot call react_to');
  exception when insufficient_privilege then insert into results values (true, 'the signed-out role cannot call react_to');
  end;
end $$;
reset role;

-- The realtime feed and its row.
select pg_temp.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reactions'), 'reactions are on the realtime feed');
select pg_temp.check((select relreplident = 'f' from pg_class where oid = 'public.message_reactions'::regclass), 'with the full row');

-- THE VERDICT ------------------------------------------------------------------
\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 44 then raise exception 'only % checks ran; expected at least 44', total; end if;
  if failed > 0 then raise exception '% of % conversation checks failed', failed, total; end if;
  raise notice 'a conversation can reply, react and speak: % checks hold', total;
end $$;

rollback;
