-- A photo is checked on the server: the database asks for it, once, for photos
-- only, and never for report evidence.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh (20261027170000_a_photo_is_checked_on_the_server):
--
--   QUIET       with no address set, a photo queues nothing: a church that has
--               not set it up is exactly as before.
--   ASKED       with the address set, a JPEG, PNG or WebP stored in
--               pairing-media or post-media queues one request to it, carrying
--               the key and naming the bucket and the file.
--   NOT ASKED   a PDF, a file in another bucket, and report evidence
--               (`reports/`) queue nothing.
--   AGAIN       a replaced photo (a new eTag) is checked again; the same file
--               touched without new bytes is not.
--
-- What the function then does with the bytes is proved by
-- tests/a-photo-is-checked-on-the-server.mjs. EVERYTHING HERE IS ROLLED BACK.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
create or replace function pg_temp.check(p_ok boolean, p_label text) returns void
language sql as $$ insert into results values (coalesce(p_ok, false), p_label) $$;

-- How many requests are queued to the test address.
create or replace function pg_temp.asked() returns bigint language sql as $$
  select count(*) from net.http_request_queue where url = 'https://photo-check.example.test/v1'
$$;

create or replace function pg_temp.store(p_bucket text, p_name text, p_mime text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, metadata)
  values (p_bucket, p_name, jsonb_build_object('mimetype', p_mime, 'eTag', '"' || md5(p_name) || '"', 'size', 100))
$$;

insert into storage.buckets (id, name) values ('photo-check-other', 'photo-check-other')
  on conflict (id) do nothing;

-- QUIET ---------------------------------------------------------------------------
delete from vault.secrets where name in ('notify_service_key', 'photo_check_function_url');
select pg_temp.store('pairing-media', 'photo-check-test/quiet.jpg', 'image/jpeg');
select pg_temp.check(pg_temp.asked() = 0, 'with no address set, a photo queues nothing');

select vault.create_secret('photo-check-test-key', 'notify_service_key');
select vault.create_secret('https://photo-check.example.test/v1', 'photo_check_function_url');

-- ASKED ---------------------------------------------------------------------------
select pg_temp.store('pairing-media', 'photo-check-test/a.jpg', 'image/jpeg');
select pg_temp.check(pg_temp.asked() = 1, 'a JPEG in a conversation''s bucket is checked');
select pg_temp.check(
  (select convert_from(body, 'UTF8')::jsonb = jsonb_build_object('bucket', 'pairing-media', 'name', 'photo-check-test/a.jpg')
          and headers ->> 'Authorization' = 'Bearer photo-check-test-key'
     from net.http_request_queue where url = 'https://photo-check.example.test/v1' order by id desc limit 1),
  'the request names the bucket and the file, and carries the key');
select pg_temp.store('post-media', 'photo-check-test/b.png', 'image/png');
select pg_temp.store('post-media', 'photo-check-test/c.webp', 'image/webp');
select pg_temp.check(pg_temp.asked() = 3, 'a PNG and a WebP on a post are checked too');

-- NOT ASKED -----------------------------------------------------------------------
select pg_temp.store('pairing-media', 'photo-check-test/d.pdf', 'application/pdf');
select pg_temp.store('pairing-media', 'reports/photo-check-test/e.jpg', 'image/jpeg');
select pg_temp.store('photo-check-other', 'photo-check-test/f.jpg', 'image/jpeg');
select pg_temp.check(pg_temp.asked() = 3, 'a PDF, report evidence and another bucket queue nothing');

-- AGAIN ---------------------------------------------------------------------------
update storage.objects set metadata = metadata || '{"eTag": "\"replaced\""}'
 where bucket_id = 'pairing-media' and name = 'photo-check-test/a.jpg';
select pg_temp.check(pg_temp.asked() = 4, 'a photo replaced with new bytes is checked again');
update storage.objects set metadata = metadata || '{"lastModified": "2026-10-27T00:00:00Z"}'
 where bucket_id = 'pairing-media' and name = 'photo-check-test/a.jpg';
select pg_temp.check(pg_temp.asked() = 4, 'the same bytes touched again are not');

select pg_temp.check(
  not has_function_privilege('authenticated', 'private.check_a_stored_photo()', 'execute')
  and not has_function_privilege('anon', 'private.check_a_stored_photo()', 'execute'),
  'nobody signed in, or out, can call the check themselves');

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
  if total < 8 then raise exception 'only % checks ran; expected at least 8', total; end if;
  if failed > 0 then raise exception '% of % photo checks failed', failed, total; end if;
  raise notice 'a photo is checked on the server: % checks hold', total;
end $$;

rollback;
