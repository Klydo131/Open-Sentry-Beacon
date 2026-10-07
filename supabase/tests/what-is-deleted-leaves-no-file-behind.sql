-- What is deleted leaves no file behind.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261007150000_what_is_deleted_leaves_no_file_behind):
--
--   * removing a member queues every file their rows pointed at for erasure:
--     photos and voice messages in their conversation (theirs and the other
--     person's, because the conversation goes), the resources and study
--     handouts they uploaded, and their profile picture;
--   * a replaced profile picture queues the old one and keeps the new one;
--   * a file whose row is still there is not queued;
--   * nobody signed in can read the list or mark anything erased; only the
--     service role, which the `erase` function holds, can.
--
-- The owner, 7 October 2026: "Make sure we have a system of in and out (exit)
-- of data when it's deleted." RA 10173 section 11(e): kept no longer than
-- necessary; section 16(e): erasure.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon, service_role;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

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
  perform set_config('request.jwt.claims', '', true);
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

-- FIXTURES: a Guide (g) walking with an Explorer (e), and a Director (d). All fictional.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'erase-guide@example.test'),
  ('00000000-0000-0000-0000-00000000aa02', 'erase-explorer@example.test'),
  ('00000000-0000-0000-0000-00000000aa03', 'erase-director@example.test');
insert into public.churches (id, name) values ('00000000-0000-0000-0000-00000000ac01', 'Test Chapel');
update public.profiles set is_approved = true, church_id = '00000000-0000-0000-0000-00000000ac01',
       full_name = 'Person ' || right(id::text, 2),
       role = case right(id::text, 2) when '01' then 'dm'::user_role when '02' then 'ds'::user_role else 'admin'::user_role end,
       photo_path = 'avatars/' || id::text || '/first.jpg'
 where id::text like '00000000-0000-0000-0000-00000000aa0_';
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa02', 'digital', 'connect');
insert into public.pairing_media (pairing_id, owner_id, title, mime, size, path) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa02', 'photo.jpg', 'image/jpeg', 100,
   '00000000-0000-0000-0000-00000000ab01/11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', 'voice.webm', 'audio/webm', 100,
   '00000000-0000-0000-0000-00000000ab01/22222222-2222-4222-8222-222222222222');
insert into public.materials (church_id, added_by, title, kind, file_path, file_name, file_type, file_size) values
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-00000000aa02', 'My notes', 'file',
   'library/00000000-0000-0000-0000-00000000aa02/notes.pdf', 'notes.pdf', 'application/pdf', 100);

-- A REPLACED PICTURE ---------------------------------------------------------------
update public.profiles set photo_path = 'avatars/00000000-0000-0000-0000-00000000aa01/second.jpg'
 where id = '00000000-0000-0000-0000-00000000aa01';
select pg_temp.check(exists (select 1 from private.files_to_erase where path = 'avatars/00000000-0000-0000-0000-00000000aa01/first.jpg'),
  'a replaced profile picture queues the old one');
select pg_temp.check(not exists (select 1 from private.files_to_erase where path like '%second.jpg'),
  'and keeps the new one');
select pg_temp.check(not exists (select 1 from private.files_to_erase where path like '%11111111-1111%'),
  'a file whose row is still there is not queued');

-- REMOVING THE EXPLORER, AS THE APP DOES -----------------------------------------------
delete from public.pairings where ds_id = '00000000-0000-0000-0000-00000000aa02';
delete from auth.users where id = '00000000-0000-0000-0000-00000000aa02';
select pg_temp.check(exists (select 1 from private.files_to_erase where path like '%11111111-1111%'),
  'removing a member queues the photo they sent in their conversation');
select pg_temp.check(exists (select 1 from private.files_to_erase where path like '%22222222-2222%'),
  'and the voice message the other person sent in it, because the conversation went with them');
select pg_temp.check(exists (select 1 from private.files_to_erase where path = 'library/00000000-0000-0000-0000-00000000aa02/notes.pdf'),
  'and the resource they uploaded');
select pg_temp.check(exists (select 1 from private.files_to_erase where path = 'avatars/00000000-0000-0000-0000-00000000aa02/first.jpg'),
  'and their profile picture');
select pg_temp.check((select count(*) from private.files_to_erase where bucket <> 'pairing-media') = 0,
  'every queued file names the bucket it is in');

-- WHO MAY TOUCH THE LIST ---------------------------------------------------------------
select pg_temp.as_person('00000000-0000-0000-0000-00000000aa03', $q$select * from public.files_waiting_to_be_erased(10)$q$,
  'permission denied', 'a Director cannot read the list');
select pg_temp.as_person('00000000-0000-0000-0000-00000000aa01', $q$select public.files_erased('pairing-media', array['avatars/00000000-0000-0000-0000-00000000aa01/first.jpg'])$q$,
  'permission denied', 'nobody signed in can mark a file erased');
select pg_temp.as_person('00000000-0000-0000-0000-00000000aa01', $q$select count(*) from private.files_to_erase$q$,
  'permission denied', 'nor read the list directly');
set local role service_role;
select pg_temp.check((select count(*) from public.files_waiting_to_be_erased(100)) = 5, 'the service role reads the five queued files');
select pg_temp.check(public.files_erased('pairing-media', array['avatars/00000000-0000-0000-0000-00000000aa01/first.jpg']) = 1,
  'and crosses one off once the storage service has removed it');
reset role;
select pg_temp.check((select count(*) from private.files_to_erase) = 4, 'leaving four');

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
  if total < 14 then raise exception 'only % checks ran; expected at least 14', total; end if;
  if failed > 0 then raise exception '% of % erasure checks failed', failed, total; end if;
  raise notice 'what is deleted leaves no file behind: % checks hold', total;
end $$;

rollback;
