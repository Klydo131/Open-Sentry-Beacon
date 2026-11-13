-- Undo a fix that did not work, and put the working one where it belongs.
--
-- WHAT WENT WRONG. `close_the_doors_nobody_uses` added a trigger,
-- `forget_stored_files`, that deleted from `storage.objects` when a profile was
-- deleted, so that a person who asks to be erased does not leave their
-- photograph on the server. It was written, reasoned about, committed, and
-- described in a commit message as working. It was never run.
--
-- It cannot work. Supabase puts a `protect_objects_delete` trigger on
-- `storage.objects` that raises `42501` on ANY direct delete —
--
--     Direct deletion from storage tables is not allowed. Use the Storage API
--     instead.  HINT: This prevents accidental data loss from orphaned objects.
--
-- and `forget_stored_files` swallows its own exceptions on purpose, so it
-- turned that refusal into a warning nobody reads and returned success. Proved
-- against the live database: delete a profile that owns one avatar, and the
-- count of its storage rows goes 1 -> 1.
--
-- The hint explains why the platform refuses, and it is right. A row in
-- `storage.objects` is metadata; the image itself lives in object storage.
-- Deleting the row does not delete the bytes — it strands them, permanently and
-- invisibly, because every route to a file goes through the metadata. A
-- "deletion" that hides the evidence and keeps the photograph is worse than no
-- deletion at all, and it is the exact shape of the claim we would have made in
-- a privacy notice.
--
-- WHERE THE JOB ACTUALLY BELONGS. Only the Storage API deletes both halves, and
-- only the app can call it. So the trigger goes, and the deletion moves into
-- `removeMemberByLeader`, which now clears the member's files BEFORE removing
-- the account — necessarily before, because `remove_member_by_leader` deletes
-- `auth.users`, `profiles` goes with it, and after that no rule can tell whose
-- church the leftover files belonged to.
--
-- That needs a rule that does not exist yet: `avatar_drop` only ever let people
-- delete their OWN files. A Director removing somebody could not clear their
-- picture. The new policy below is the smallest thing that closes it.
--
-- SEPARATELY, AND MORE COMMONLY THAN DELETION: avatars accumulate. The upload
-- path writes `avatars/<person>/<timestamp>.jpg`, so a new picture never
-- replaces the old one — it joins it. One member is currently keeping three.
-- Nothing ever removed the previous copy, so every profile picture anybody has
-- ever set is still stored and still readable by their church. That is fixed in
-- the app, on the upload path, where the person deleting is the owner and the
-- existing `avatar_drop` rule already permits it.

begin;

-- The trigger that could never fire, and the function behind it.
drop trigger if exists forget_stored_files on public.profiles;
drop function if exists public.forget_stored_files();

-- A leader may clear the files of somebody in a church they manage. Scoped the
-- same way the read rules are, through the uploader's church, so it cannot
-- reach across churches. `manages_church` is the same test that already decides
-- who may delete a lesson file or a library material.
drop policy if exists member_files_drop_by_leader on storage.objects;
create policy member_files_drop_by_leader on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] in ('avatars', 'lessons')
    and public.manages_church(public.uploader_church((storage.foldername(name))[2]))
  );

commit;
