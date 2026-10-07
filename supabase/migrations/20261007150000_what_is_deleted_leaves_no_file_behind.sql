-- What is deleted leaves no file behind.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED, 7 October 2026: "Make sure we have a system of in and out
-- (exit) of data when it's deleted. WE DONT WANT TO VIOLATE ANY NATIONAL AND
-- INTERNATIONAL DATA PRIVACY LAW here, specially in our home country
-- Philippines."
--
-- WHAT WAS WRONG. Personal data is kept no longer than it is needed (RA 10173
-- section 11(e); GDPR Art. 5(1)(e)), and a person may have it erased (section
-- 16(e); Art. 17). The rows did go. The files did not always: a photograph or
-- a voice message in a conversation, a resource somebody uploaded, a study
-- handout, a profile picture. When the row that pointed at one was deleted --
-- a member removed, a conversation ended by a removal, a resource taken off the
-- shelf by a cascade -- the file stayed in storage. Nobody could open it any
-- more, because every file's read rule asks for its row; but it was still
-- kept, which is the thing the law forbids, and nothing would ever remove it.
--
-- Postgres cannot remove a stored file, only the row about it (Supabase
-- refuses deletes from storage.objects, and a row deleted there strands the
-- file rather than removing it). So:
--
--   1. Whenever a row that points at a file is deleted, the file's path is
--      written to private.files_to_erase. It happens in the database, so it
--      happens however the row went: a screen, a removal, a cascade from an
--      account being deleted.
--   2. Once a day the database asks the `erase` function to empty that list
--      through the Storage API, which removes both halves. The function holds
--      the service key, takes no instruction from a browser, and removes only
--      paths this list names.
--
-- WHAT IS KEPT ON PURPOSE is unchanged: evidence attached to a safeguarding
-- report stays while its report does (docs/DATA-PROTECTION.md). When the
-- report itself is deleted, its evidence is queued like anything else.
--
-- THE APP WORKS WITHOUT THE FUNCTION. Until `erase` is deployed, paths wait on
-- the list; nothing is lost and nothing is readable. Deploying it empties the
-- list on the next run. docs/PRIVACY-MANUAL.md has the one setup step.
-- ---------------------------------------------------------------------------

begin;

create table if not exists private.files_to_erase (
  bucket    text not null,
  path      text not null,
  reason    text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
revoke all on private.files_to_erase from public, anon, authenticated;

-- One trigger function for every table that points at a file. Its arguments
-- name the bucket and the column; the reason is the table's own name.
create or replace function private.queue_file_for_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  in_bucket text := tg_argv[0];
  col    text := tg_argv[1];
  old_path text := to_jsonb(old) ->> col;
  new_path text;
begin
  if tg_op = 'UPDATE' then
    new_path := to_jsonb(new) ->> col;
    -- A replaced profile picture: the old one goes, the new one stays.
    if old_path is not distinct from new_path then
      return new;
    end if;
  end if;
  if old_path is not null and btrim(old_path) <> '' then
    insert into private.files_to_erase (bucket, path, reason)
    values (in_bucket, old_path, tg_table_name || ' ' || lower(tg_op))
    on conflict (bucket, path) do nothing;
  end if;
  return coalesce(new, old);
end;
$function$;
revoke all on function private.queue_file_for_erasure() from public, anon, authenticated;

drop trigger if exists zz_queue_file_for_erasure on public.pairing_media;
create trigger zz_queue_file_for_erasure after delete on public.pairing_media
  for each row execute function private.queue_file_for_erasure('pairing-media', 'path');

drop trigger if exists zz_queue_file_for_erasure on public.materials;
create trigger zz_queue_file_for_erasure after delete on public.materials
  for each row execute function private.queue_file_for_erasure('pairing-media', 'file_path');

drop trigger if exists zz_queue_file_for_erasure on public.lesson_files;
create trigger zz_queue_file_for_erasure after delete on public.lesson_files
  for each row execute function private.queue_file_for_erasure('pairing-media', 'path');

drop trigger if exists zz_queue_file_for_erasure on public.report_files;
create trigger zz_queue_file_for_erasure after delete on public.report_files
  for each row execute function private.queue_file_for_erasure('pairing-media', 'path');

drop trigger if exists zz_queue_file_for_erasure on public.profiles;
create trigger zz_queue_file_for_erasure after delete or update of photo_path on public.profiles
  for each row execute function private.queue_file_for_erasure('pairing-media', 'photo_path');

-- WHAT THE `erase` FUNCTION CALLS. Service role only: a browser can neither
-- read the list (it names files of people it may not know) nor mark anything
-- erased.
create or replace function public.files_waiting_to_be_erased(p_limit integer default 500)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $function$
  select f.bucket, f.path
    from private.files_to_erase f
   order by f.queued_at
   limit greatest(1, least(coalesce(p_limit, 500), 1000));
$function$;
revoke all on function public.files_waiting_to_be_erased(integer) from public, anon, authenticated;
grant execute on function public.files_waiting_to_be_erased(integer) to service_role;

create or replace function public.files_erased(p_bucket text, p_paths text[])
returns integer
language sql
security definer
set search_path = ''
as $function$
  with gone as (
    delete from private.files_to_erase
     where bucket = p_bucket and path = any (p_paths)
    returning 1
  )
  select count(*)::integer from gone;
$function$;
revoke all on function public.files_erased(text, text[]) from public, anon, authenticated;
grant execute on function public.files_erased(text, text[]) to service_role;

-- ONCE A DAY, the database asks `erase` to empty the list. The same two Vault
-- secrets the notification sender already uses (20260916210000): the service
-- key, and that function's address with its last part changed. A church that
-- has not set them up has nothing called and loses nothing; the list waits.
create or replace function private.ask_for_files_to_be_erased()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  service_key  text;
  function_url text;
begin
  if not exists (select 1 from private.files_to_erase) then
    return;
  end if;
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'notify_service_key' limit 1;
  select coalesce(
           (select decrypted_secret from vault.decrypted_secrets where name = 'erase_function_url' limit 1),
           (select regexp_replace(decrypted_secret, '/notify/?$', '/erase')
              from vault.decrypted_secrets where name = 'notify_function_url' limit 1))
    into function_url;
  if service_key is null or function_url is null then
    return;
  end if;
  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
exception when others then
  return;  -- tomorrow's run tries again; nothing is lost
end;
$function$;
revoke all on function private.ask_for_files_to_be_erased() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'erase-deleted-files') then
    perform cron.unschedule('erase-deleted-files');
  end if;
  perform cron.schedule('erase-deleted-files', '23 3 * * *', 'select private.ask_for_files_to_be_erased()');
end $$;

commit;
