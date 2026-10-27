-- A photo is checked on the server: one the browser did not clean is cleaned
-- here.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 27 October 2026, from the costed plan "Rust and Python for Hope
-- Beacon". The privacy page promises that a photo's location is removed before
-- it is stored, and until today only the browser kept that promise
-- (lib/live/shrink-image.ts, lib/live/photo-location.ts). A modified copy of
-- the app, or somebody calling the file store directly, could store a photo
-- that still says where it was taken. The owner chose to close that.
--
-- HOW. When a file arrives in `pairing-media` or `post-media`, or is replaced
-- there, and it is a JPEG, PNG or WebP, this queues one request to the
-- `photo-check` function (supabase/functions/photo-check), which reads the
-- file and writes it back without its location, or removes it if it says where
-- it was taken and cannot be read. The same reader the browser uses does the
-- reading. Report evidence (`reports/` in `pairing-media`) is left as it was
-- raised: leaders read it, nobody else, and it is evidence.
--
-- WHY A TRIGGER. A photo is stored from six places in the app, and from
-- anywhere at all by somebody skipping it; this fires on the row the file
-- store writes for every one. `net.http_post` only queues, so an upload is
-- never slowed or refused by this, and the handler at the bottom keeps an
-- upload saved even if queuing fails. A file replaced with a cleaned copy
-- changes its eTag and is checked once more, and comes back clean: it ends.
--
-- THE KEY AND THE ADDRESS ARE NOT IN THIS FILE. As with notifications, the
-- function reads both from the church's own Vault, and until the address is
-- set nothing is queued. To switch it on, once, in the SQL editor (the key is
-- the one notifications already use):
--
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/photo-check',
--                              'photo_check_function_url');
--
-- and deploy the function: npx supabase functions deploy photo-check
-- The Postgres edition sets its own address when it starts (selfhost/server).
-- ---------------------------------------------------------------------------

begin;

-- pg_net is already on: 20260916210000 switched it on for notifications.

create or replace function private.check_a_stored_photo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  service_key text;
  function_url text;
begin
  if new.bucket_id not in ('pairing-media', 'post-media') or new.name like 'reports/%' then
    return new;
  end if;
  if coalesce(new.metadata ->> 'mimetype', '') not in ('image/jpeg', 'image/png', 'image/webp') then
    return new;
  end if;

  -- A CHURCH THAT HAS NOT SET THIS UP IS NOT BROKEN: the browser still cleans
  -- every photo the app sends, exactly as before.
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'notify_service_key' limit 1;
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'photo_check_function_url' limit 1;
  if service_key is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('bucket', new.bucket_id, 'name', new.name),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- THE UPLOAD IS KEPT EITHER WAY. A check that could not be queued is a
  -- missed second chance, never a lost photo.
  return new;
end;
$$;

revoke all on function private.check_a_stored_photo() from public, anon, authenticated;

drop trigger if exists a_stored_photo_is_checked on storage.objects;
create trigger a_stored_photo_is_checked
  after insert on storage.objects
  for each row execute function private.check_a_stored_photo();

-- The file store may write the row first and its details once the bytes are
-- in, and a replaced photo keeps its row: a new eTag is a new file to check.
drop trigger if exists a_replaced_photo_is_checked on storage.objects;
create trigger a_replaced_photo_is_checked
  after update of metadata on storage.objects
  for each row
  when (old.metadata ->> 'eTag' is distinct from new.metadata ->> 'eTag')
  execute function private.check_a_stored_photo();

commit;
