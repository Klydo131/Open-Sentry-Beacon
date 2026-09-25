-- What one person can put in the church's storage.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED, 25 September 2026: "Make sure to update policy and security
-- to keep our app consistent and safe", straight after Resources were opened
-- to files (20260925100000). Two things were not consistent.
--
-- 1. NOTHING LIMITED HOW MUCH ONE PERSON COULD UPLOAD. Every file is capped at
--    10 MB by the bucket, but not the number of them. Resources now take files
--    from every Guide and Explorer, and a single account -- somebody's stolen
--    password, or a script driving one -- could fill the church's storage one
--    10 MB file at a time, and the church would find out from the bill. On the
--    day this was written the most anybody had stored was three files.
--
--    So a person may keep up to 300 files and 200 MB of their own in the two
--    folders people fill by choice: their resources (library/<them>/) and
--    their study handouts (lessons/<them>/). Deleting frees the room again.
--    Photos in a conversation, profile pictures and safeguarding evidence are
--    not counted: the first two are shrunk to a few hundred kilobytes, and
--    evidence must never be refused because somebody's shelf is full.
--
--    A church that needs more changes the two numbers in
--    private.room_to_upload below, in a migration of its own.
--
-- 2. ANYBODY SIGNED IN COULD UPLOAD STUDY HANDOUTS. lesson_file_write (0038)
--    checked only that the file went into the uploader's own folder. Writing
--    a study is for Guides, Directors and Executive Directors
--    (may_write_studies, 20260904160000), and the handout row was already
--    refused to an Explorer -- but the file itself was not, so an Explorer
--    could put files in storage that nothing would ever point at. It now asks
--    the same question the study does.
--
-- PROVEN on the live database in a transaction that was discarded; the
-- figures are in the commit that added this file.
-- ---------------------------------------------------------------------------

begin;

-- How much room a person has left in their own two folders. Definer, because
-- it has to count objects the person could not otherwise list; it returns a
-- yes or a no and nothing about anybody's files.
create or replace function private.room_to_upload(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*) < 300
     and coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
         < 200::bigint * 1024 * 1024
    from storage.objects o
   where o.bucket_id = 'pairing-media'
     and (o.name like 'library/' || p_uid::text || '/%'
          or o.name like 'lessons/' || p_uid::text || '/%');
$function$;

revoke all on function private.room_to_upload(uuid) from public, anon;
grant execute on function private.room_to_upload(uuid) to authenticated, service_role;

-- RESTRICTIVE: it can only ever take a yes away from the rules that already
-- decide who may upload where. Anything outside those two folders passes
-- through it untouched.
drop policy if exists personal_uploads_have_a_limit on storage.objects;
create policy personal_uploads_have_a_limit on storage.objects
  as restrictive
  for insert to authenticated
  with check (
    bucket_id <> 'pairing-media'
    or coalesce((storage.foldername(name))[1], '') not in ('library', 'lessons')
    or (select private.room_to_upload((select auth.uid())))
  );

-- Handouts are for the people who write studies.
drop policy if exists lesson_file_write on storage.objects;
create policy lesson_file_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'lessons'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select public.may_write_studies())
  );

commit;
