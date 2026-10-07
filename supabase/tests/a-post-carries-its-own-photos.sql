-- A post carries its own photos and clip, and they reach exactly who may read it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261007160000_a_post_can_carry_photos_and_a_clip),
-- signed in as invented people:
--
--   * a writer adds photos and one clip to their own post, up to ten files,
--     in the path shape the app writes, in types the bucket takes;
--   * nobody else adds to it, not even a Director, and nobody adds across
--     churches or in somebody else's name;
--   * a photo reaches exactly the people who may read its post: the church
--     for a church post, the people a Guide walks with for theirs, the writer
--     alone for a draft; a notice's photo reaches its church;
--   * the stored files obey the same rules, and a file with no row is
--     unreadable;
--   * one person keeps at most 40 files and 200 MB;
--   * nobody changes a row; a Director can take anything down.
--
-- The owner, 7 October 2026: "writing blog post should be easy with added
-- features like photos and videos".
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon;

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


-- FIXTURES -------------------------------------------------------------------
-- Church 1: a Guide (a), an Explorer walking with a (b), a Director (c), an
-- Explorer not walking with a (e), a suspended member (s). Church 2: a Guide (d).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test'),
  ('00000000-0000-0000-0000-000000000005', 's@example.test');
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Chapel'),
  ('00000000-0000-0000-0000-0000000000c2', 'Other Chapel');
update public.profiles set is_approved = true, full_name = 'Person ' || right(id::text, 1),
  church_id = case when right(id::text, 1) = 'd' then '00000000-0000-0000-0000-0000000000c2'::uuid
                   else '00000000-0000-0000-0000-0000000000c1'::uuid end,
  role = case right(id::text, 1) when 'a' then 'dm'::user_role when 'd' then 'dm'::user_role
                                 when 'c' then 'admin'::user_role else 'ds'::user_role end;
update public.profiles set suspended_at = now() where id = '00000000-0000-0000-0000-000000000005';
insert into public.pairings (id, dm_id, ds_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.blog_posts (id, author_id, church_id, title, body, visibility, audience) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'For the church', 'Hello', 'published', 'church'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'A draft', 'Not yet', 'private', 'church'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000c2', 'Elsewhere', 'Hi', 'published', 'church'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'For my Explorers', 'Hi', 'published', 'all');
insert into public.announcements (id, church_id, author_id, title) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'Sabbath lunch'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'Over there');

-- Paths, in the shape the app writes.
\set C1 '00000000-0000-0000-0000-0000000000c1'
\set A '00000000-0000-0000-0000-00000000000a'


-- ADDING A ROW ---------------------------------------------------------------
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, alt, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg', 'A table laid for lunch', 0)$q$, 'ok', 'a adds a photo to their own post');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'video', 'video/mp4', 30000000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/22222222-2222-4222-8222-222222222222.mp4', 1)$q$, 'ok', 'and a short clip');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'video', 'video/mp4', 30000000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/33333333-3333-4333-8333-333333333333.mp4', 2)$q$, '23505', 'but not a second clip on the same post');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/44444444-4444-4444-8444-444444444444.jpg', 0)$q$, '23505', 'nor two files in the same place (ten places, so ten files at most)');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/55555555-5555-4555-8555-555555555555.jpg', 10)$q$, '23514', 'nor an eleventh place');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'video/mp4', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/66666666-6666-4666-8666-666666666666.mp4', 3)$q$, '23514', 'a photo must be a picture type');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '../../auth/v1/logout', 3)$q$, '23514', 'a path the app would never write is refused');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/gif', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/77777777-7777-4777-8777-777777777777.jpg', 3)$q$, '23514', 'a type the bucket does not take is refused');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, alt, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/88888888-8888-4888-8888-888888888888.jpg', E'gpj.\u202Eexe', 3)$q$, '23514', 'right-to-left tricks in the description are refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/99999999-9999-4999-8999-999999999999.jpg', 4)$q$, 'row-level security', 'b cannot add to a''s post');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 4)$q$, 'row-level security', 'nor can a Director: a post is its writer''s');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c2/00000000-0000-0000-0000-0000000000a3/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg', 0)$q$, 'row-level security', 'a cannot add to another church''s post');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg', 5)$q$, 'row-level security', 'nor put somebody else''s name on a file');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a2/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg', 0)$q$, 'ok', 'a adds a photo to their own draft');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a4/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg', 0)$q$, 'ok', 'and to the post for the people they walk with');
-- Notices.
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$insert into public.post_media (church_id, announcement_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c', 'image', 'image/png', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000b1/f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0.png', 0)$q$, 'ok', 'c, who pinned the notice, adds a photo to it');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, announcement_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/png', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000b1/f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1.png', 1)$q$, 'row-level security', 'a Guide cannot add to a notice somebody else pinned');
select pg_temp.as_person(:'A', $q$insert into public.post_media (church_id, post_id, announcement_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'image', 'image/png', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2.png', 6)$q$, '42501', 'a file belongs to a post or a notice, not both');
select pg_temp.as_person('00000000-0000-0000-0000-000000000005', $q$insert into public.post_media (church_id, post_id, owner_id, kind, mime, size, path, position) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', 'image', 'image/jpeg', 1000, '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3.jpg', 7)$q$, 'error', 'a suspended account adds nothing');
select pg_temp.as_person('', $q$set local role anon; select count(*) from public.post_media$q$, 'permission denied', 'somebody signed out sees nothing');

-- READING ROWS ---------------------------------------------------------------
create or replace function pg_temp.count_as(p_who text, p_where text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.post_media where ' || p_where into n;
  execute 'reset role';
  return n;
end $$;
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000b', $$post_id = '00000000-0000-0000-0000-0000000000a1'$$) = 2, 'b reads the church post''s photo and clip');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000e', $$post_id = '00000000-0000-0000-0000-0000000000a1'$$) = 2, 'so does e, who does not walk with a: it is for the whole church');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000d', $$post_id = '00000000-0000-0000-0000-0000000000a1'$$) = 0, 'd, in another church, reads none of it');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000b', $$post_id = '00000000-0000-0000-0000-0000000000a2'$$) = 0, 'a draft''s photo stays with its writer: b sees nothing');
select pg_temp.check(pg_temp.count_as(:'A', $$post_id = '00000000-0000-0000-0000-0000000000a2'$$) = 1, 'and its writer sees it');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000b', $$post_id = '00000000-0000-0000-0000-0000000000a4'$$) = 1, 'the post for the people a walks with: b, who walks with a, sees its photo');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000e', $$post_id = '00000000-0000-0000-0000-0000000000a4'$$) = 0, 'and e, who does not, does not');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000b', $$announcement_id = '00000000-0000-0000-0000-0000000000b1'$$) = 1, 'a notice''s photo reaches the whole church');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-00000000000d', $$announcement_id = '00000000-0000-0000-0000-0000000000b1'$$) = 0, 'and not another church');
select pg_temp.check(pg_temp.count_as('00000000-0000-0000-0000-000000000005', 'true') = 0, 'a suspended account reads nothing');

-- CHANGING AND REMOVING --------------------------------------------------------
select pg_temp.as_person(:'A', $q$update public.post_media set alt = 'changed'$q$, 'permission denied', 'nobody changes a row: remove it and add another');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b', $q$delete from public.post_media where post_id = '00000000-0000-0000-0000-0000000000a1'$q$, 'ok', 'b tries to remove a''s photo');
select pg_temp.check((select count(*) from public.post_media where post_id = '00000000-0000-0000-0000-0000000000a1') = 2, 'and nothing went');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$delete from public.post_media where path like '%22222222-2222%'$q$, 'ok', 'c, a Director, removes the clip');
select pg_temp.check((select count(*) from public.post_media where post_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'and it went: leadership can take anything down');

-- THE FILES ------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}'),
  ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a2/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}'),
  ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/12121212-1212-4121-8121-121212121212.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}');
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/13131313-1313-4131-8131-131313131313.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'ok', 'a uploads a photo into their post''s folder');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000b', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/14141414-1414-4141-8141-141414141414.jpg', '00000000-0000-0000-0000-00000000000b', '{"size": 1000}')$q$, 'row-level security', 'b cannot upload into a''s post');
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c2/00000000-0000-0000-0000-0000000000a3/15151515-1515-4151-8151-151515151515.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'row-level security', 'a cannot upload into another church''s folder');
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c2/00000000-0000-0000-0000-0000000000a1/16161616-1616-4161-8161-161616161616.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'row-level security', 'nor file their own post under another church''s name');
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', 'not-a-uuid/x.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'row-level security', 'a malformed path is refused, not thrown on');
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/17171717-1717-4171-8171-171717171717.exe', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'row-level security', 'and so is a name that is not a photo or a clip');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000b1/18181818-1818-4181-8181-181818181818.png', '00000000-0000-0000-0000-00000000000c', '{"size": 1000}')$q$, 'ok', 'c uploads a photo for their notice');

create or replace function pg_temp.files_as(p_who text, p_like text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from storage.objects where bucket_id = %L and name like %L', 'post-media', p_like) into n;
  execute 'reset role';
  return n;
end $$;
select pg_temp.check(pg_temp.files_as('00000000-0000-0000-0000-00000000000b', '%11111111-1111%') = 1, 'b can open the photo on the church post');
select pg_temp.check(pg_temp.files_as('00000000-0000-0000-0000-00000000000d', '%11111111-1111%') = 0, 'd, in another church, cannot');
select pg_temp.check(pg_temp.files_as('00000000-0000-0000-0000-00000000000b', '%dddddddd-dddd%') = 0, 'b cannot open the photo on a''s draft');
select pg_temp.check(pg_temp.files_as('00000000-0000-0000-0000-00000000000b', '%12121212-1212%') = 0, 'a file with no row is unreadable, even inside a post b can read');
select pg_temp.check(pg_temp.files_as(:'A', '%12121212-1212%') = 1, 'except to the person who uploaded it, so they can take it away');

select pg_temp.as_person('00000000-0000-0000-0000-00000000000b', $q$delete from storage.objects where name like '%11111111-1111%'$q$, 'ok', 'b tries to delete a''s file');
select pg_temp.check((select count(*) from storage.objects where name like '%11111111-1111%') = 1, 'and it is still there');
select pg_temp.as_person(:'A', $q$delete from storage.objects where name like '%12121212-1212%'$q$, 'ok', 'a deletes their own file');
select pg_temp.check((select count(*) from storage.objects where name like '%12121212-1212%') = 0, 'and it went');

-- HOW MUCH ONE PERSON MAY KEEP -------------------------------------------------
insert into storage.objects (bucket_id, name, owner, metadata)
select 'post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/' || gen_random_uuid() || '.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}'
  from generate_series(1, 40 - (select count(*) from storage.objects where owner = '00000000-0000-0000-0000-00000000000a' and bucket_id = 'post-media'));
select pg_temp.as_person(:'A', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000a1/19191919-1919-4191-8191-191919191919.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 1000}')$q$, 'row-level security', 'a 41st file is refused');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000b1/20202020-2020-4202-8202-202020202020.png', '00000000-0000-0000-0000-00000000000c', '{"size": 209715200}')$q$, 'ok', 'c uploads one very large file (the bucket would refuse it at 50 MB; this checks the total)');
select pg_temp.as_person('00000000-0000-0000-0000-00000000000c', $q$insert into storage.objects (bucket_id, name, owner, metadata) values ('post-media', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-0000000000b1/21212121-2121-4212-8212-212121212121.png', '00000000-0000-0000-0000-00000000000c', '{"size": 1000}')$q$, 'row-level security', 'and after 200 MB, nothing more');

-- A DELETED POST TAKES ITS ROWS -------------------------------------------------
delete from public.blog_posts where id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check((select count(*) from public.post_media where post_id = '00000000-0000-0000-0000-0000000000a2') = 0, 'deleting a post removes its file rows');
select pg_temp.check(pg_temp.files_as('00000000-0000-0000-0000-00000000000b', '%dddddddd-dddd%') = 0
                     and pg_temp.files_as('00000000-0000-0000-0000-00000000000c', '%dddddddd-dddd%') = 0,
  'and its leftover file can be opened by nobody but the person who uploaded it');
select pg_temp.check(exists (select 1 from private.files_to_erase where bucket = 'post-media' and path like '%dddddddd-dddd%'),
  'and it is on the list to be erased from storage tonight');


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
  if total < 45 then raise exception 'only % checks ran; expected at least 45', total; end if;
  if failed > 0 then raise exception '% of % post photo checks failed', failed, total; end if;
  raise notice 'a post carries its own photos: % checks hold', total;
end $$;

rollback;
