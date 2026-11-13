-- A picture, or a chosen icon, for a live account.
--
-- The tutorial has had both since the beginning and the live app had neither:
-- no columns, no picker, nothing. Every member in a real church was a pair of
-- initials on a coloured circle, including on the card their Guide opens every
-- week.
--
-- TWO COLUMNS, BECAUSE THEY ARE TWO DIFFERENT THINGS. `avatar` is one of a short
-- list of emoji the person picked. `photo_path` is an object in storage they
-- uploaded. A photo wins when both are set, and clearing the photo falls back to
-- the icon rather than to nothing.
--
-- THE PHOTO IS A PATH, NOT A URL. Signed URLs expire, so storing one means
-- storing something that stops working with nothing to say why.
--
-- NOT PRIVILEGED. Unlike role or guardian consent, these are yours to change:
-- they are deliberately absent from lock_privileged_profile_columns.

alter table public.profiles
  add column if not exists avatar     text,
  add column if not exists photo_path text;

alter table public.profiles drop constraint if exists profiles_avatar_short;
alter table public.profiles
  add constraint profiles_avatar_short check (coalesce(length(avatar), 0) <= 16);

alter table public.profiles drop constraint if exists profiles_photo_path_shape;
-- The path must live under this person's own folder. Without this a member
-- could point their profile at somebody else's uploaded file.
alter table public.profiles
  add constraint profiles_photo_path_shape check (
    photo_path is null
    or photo_path like ('avatars/' || id::text || '/%')
  );

-- Storage: the same private bucket conversation attachments use, under an
-- avatars/ prefix. Read is open to any signed-in member, because a Director
-- reading a roster and a Guide opening a card both need to see the face. Write
-- is your own folder only.
drop policy if exists avatar_read   on storage.objects;
drop policy if exists avatar_write  on storage.objects;
drop policy if exists avatar_update on storage.objects;
drop policy if exists avatar_drop   on storage.objects;

create policy avatar_read on storage.objects
  for select to authenticated
  using (bucket_id = 'pairing-media' and (storage.foldername(name))[1] = 'avatars');

create policy avatar_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy avatar_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy avatar_drop on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
