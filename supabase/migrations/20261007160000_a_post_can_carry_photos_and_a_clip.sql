-- A blog post or an announcement can carry photos and one short clip.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED, 7 October 2026: "For home, writing blog post should be easy
-- with added features like photos and videos." Asked how videos should work,
-- the owner chose: YouTube or Facebook links play inside the post (that needs
-- nothing from the database), and short phone clips, about a minute, go to the
-- church's own storage. This file is the second half.
--
-- WHAT IT ADDS
--
--   * A private bucket, post-media: photos (JPEG, PNG, WebP) and clips (MP4,
--     WebM, QuickTime), 50 MB a file at most. The app shrinks a photo on the
--     phone to about 1600 pixels before it leaves, so a photo is a few hundred
--     kilobytes; 50 MB is for the clip.
--
--   * One row per file, post_media, belonging to exactly one post or one
--     notice: up to ten files on one, and at most one of them a clip.
--
-- WHO MAY DO WHAT, which is the reason this file is long
--
--   Read     whoever may read the post or the notice. The file's own read rule
--            asks the row, and the row asks can_read_post() for a post or the
--            notice's own rule for a notice, so a file can never reach
--            somebody the words could not. A draft's photos stay with its
--            writer, exactly as the draft does.
--   Add      a post's writer, to their own post; a notice's writer, or the
--            church's leadership, to a notice. Into their own church's folder
--            and nobody else's, in the path shape the app writes and no other.
--   Remove   whoever added it, the post's writer, or leadership.
--   Change   nobody. A photo is replaced by removing it and adding another.
--
--   A suspended account sees none of it, as everywhere else.
--
-- HOW MUCH ONE PERSON MAY KEEP: 40 files and 200 MB in this bucket. A church
-- that needs more changes the two numbers in private.room_for_post_media, in a
-- migration of its own. Supabase's free plan holds 1 GB of files in total for
-- the whole church, so the numbers are deliberately modest.
--
-- THE APP WORKS WITHOUT THIS. Until it has run, the app finds no post_media
-- table, hides Add photos and Add a short video, and everything else, video
-- links included, works as before (lib/live/not-yet.ts).
--
-- A DELETED POST TAKES ITS ROWS WITH IT, BY CASCADE, AND ITS FILES WITH THEM.
-- Each row deleted queues its file on the erase list (20261007150000), and the
-- nightly `erase` function removes it from storage. Until then the file cannot
-- be opened, because reading a file needs its row.
-- ---------------------------------------------------------------------------

begin;

-- 1. THE BUCKET -------------------------------------------------------------
-- PRIVATE. A public bucket makes every file readable by anybody holding the
-- address, and a church's photographs are of its people.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. THE ROWS ---------------------------------------------------------------
create table if not exists public.post_media (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches (id) on delete cascade,
  post_id         uuid references public.blog_posts (id) on delete cascade,
  announcement_id uuid references public.announcements (id) on delete cascade,
  owner_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('image', 'video')),
  mime            text not null check (mime in ('image/jpeg', 'image/png', 'image/webp',
                                                'video/mp4', 'video/webm', 'video/quicktime')),
  size            bigint not null check (size between 1 and 52428800),
  path            text not null unique,
  -- Said for a photo, for anybody who cannot see it. Plain words: the same
  -- right-to-left trick refused in titles elsewhere is refused here.
  alt             text not null default '' check (length(alt) <= 300 and alt !~ '[\u202A-\u202E\u2066-\u2069]'),
  position        smallint not null default 0 check (position between 0 and 9),
  created_at      timestamptz not null default now(),
  -- One home: a post or a notice, never both and never neither.
  constraint post_media_one_home check ((post_id is null) <> (announcement_id is null)),
  -- A photo is a picture type and a clip is a video type.
  constraint post_media_kind_is_its_type check ((kind = 'image') = (mime like 'image/%')),
  -- THE PATH BUILDS A URL IN A READER'S BROWSER, as pairing_media's does
  -- (20261001120000, section 6). The app writes
  -- <church>/<post or notice>/<uuid>.<ext> and the database accepts nothing else.
  constraint post_media_path_shape check (
    path ~ ('^' || church_id::text || '/' || coalesce(post_id, announcement_id)::text
            || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|webm|mov)$')
  )
);

create index if not exists post_media_post_idx on public.post_media (post_id) where post_id is not null;
create index if not exists post_media_notice_idx on public.post_media (announcement_id) where announcement_id is not null;
-- Ten places on one post or notice, each used once: at most ten files.
create unique index if not exists post_media_one_per_place
  on public.post_media (coalesce(post_id, announcement_id), position);
-- And one clip.
create unique index if not exists post_media_one_clip
  on public.post_media (coalesce(post_id, announcement_id)) where kind = 'video';

alter table public.post_media enable row level security;

-- Who may add to this post or notice. Definer, so the answer does not depend
-- on whether the caller can read the post's row at that moment; it says yes or
-- no and nothing else.
create or replace function private.may_add_post_media(p_church uuid, p_post uuid, p_notice uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_church = public.my_church_id()
     and (
       (p_post is not null and p_notice is null and exists (
          select 1 from public.blog_posts b
           where b.id = p_post and b.church_id = p_church and b.author_id = (select auth.uid())))
       or
       (p_notice is not null and p_post is null and exists (
          select 1 from public.announcements a
           where a.id = p_notice and a.church_id = p_church
             and (a.author_id = (select auth.uid()) or public.manages_church(a.church_id))))
     );
$function$;
revoke all on function private.may_add_post_media(uuid, uuid, uuid) from public, anon;
grant execute on function private.may_add_post_media(uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists post_media_read on public.post_media;
create policy post_media_read on public.post_media
  for select to authenticated
  using (
    (post_id is not null and public.can_read_post(post_id))
    or (announcement_id is not null and exists (
          -- The notice's own read rule decides: the subquery runs as the reader.
          select 1 from public.announcements a where a.id = post_media.announcement_id))
  );

drop policy if exists post_media_add on public.post_media;
create policy post_media_add on public.post_media
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.may_add_post_media(church_id, post_id, announcement_id)
  );

drop policy if exists post_media_remove on public.post_media;
create policy post_media_remove on public.post_media
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or public.manages_church(church_id)
    or (post_id is not null and exists (
          select 1 from public.blog_posts b
           where b.id = post_media.post_id and b.author_id = (select auth.uid())))
  );

drop policy if exists a_suspended_account_sees_nothing on public.post_media;
create policy a_suspended_account_sees_nothing on public.post_media
  as restrictive for all to authenticated
  using ((select private.i_am_not_suspended()))
  with check ((select private.i_am_not_suspended()));

-- WHAT A BROWSER MAY DO: read, add with these columns, remove. Never change.
revoke all on public.post_media from anon, authenticated;
grant select, delete on public.post_media to authenticated;
grant insert (church_id, post_id, announcement_id, owner_id, kind, mime, size, path, alt, position)
  on public.post_media to authenticated;

-- 3. HOW MUCH ONE PERSON MAY KEEP ----------------------------------------------
create or replace function private.room_for_post_media(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*) < 40
     and coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
         < 200::bigint * 1024 * 1024
    from storage.objects o
   where o.bucket_id = 'post-media'
     and o.owner = p_uid;
$function$;
revoke all on function private.room_for_post_media(uuid) from public, anon;
grant execute on function private.room_for_post_media(uuid) to authenticated, service_role;

-- 4. THE FILES THEMSELVES -----------------------------------------------------
-- NO TEXT IS CAST TO A UUID HERE. Every comparison is uuid::text = folder, so
-- a path like post-media/not-a-uuid/x is simply refused rather than making a
-- policy throw (the lesson of 0022).
drop policy if exists post_media_file_add on storage.objects;
create policy post_media_file_add on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and owner = (select auth.uid())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|webm|mov)$'
    and (select private.i_am_not_suspended())
    and (select private.room_for_post_media((select auth.uid())))
    and (
      exists (select 1 from public.blog_posts b
               where b.id::text = (storage.foldername(name))[2]
                 and b.church_id::text = (storage.foldername(name))[1]
                 and private.may_add_post_media(b.church_id, b.id, null))
      or exists (select 1 from public.announcements a
               where a.id::text = (storage.foldername(name))[2]
                 and a.church_id::text = (storage.foldername(name))[1]
                 and private.may_add_post_media(a.church_id, null, a.id))
    )
  );

-- A file is readable exactly when its row is: the row's own rule runs, as the
-- reader, inside this one. And its uploader can always see it, which is what
-- lets them remove a file whose row never got written (an upload that
-- finished just as the connection dropped): Postgres only deletes rows the
-- person deleting them can see.
drop policy if exists post_media_file_read on storage.objects;
create policy post_media_file_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-media'
    and (
      exists (select 1 from public.post_media m where m.path = objects.name)
      or owner = (select auth.uid())
    )
  );

drop policy if exists post_media_file_remove on storage.objects;
create policy post_media_file_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (
      owner = (select auth.uid())
      or exists (select 1 from public.churches c
                  where c.id::text = (storage.foldername(name))[1]
                    and public.manages_church(c.id))
      or exists (select 1 from public.blog_posts b
                  where b.id::text = (storage.foldername(name))[2]
                    and b.author_id = (select auth.uid()))
    )
  );

-- 5. WHAT IS DELETED LEAVES NO FILE BEHIND ------------------------------------
drop trigger if exists zz_queue_file_for_erasure on public.post_media;
create trigger zz_queue_file_for_erasure after delete on public.post_media
  for each row execute function private.queue_file_for_erasure('post-media', 'path');

-- 6. WHAT A ROW IS ABOUT DOES NOT CHANGE (20261007130000): nothing about a file
-- row is changed by a browser at all, which the grants above already say; this
-- is the second wall.
drop trigger if exists aa_keep_columns on public.post_media;
create trigger aa_keep_columns before update on public.post_media
  for each row execute function private.keep_columns('id', 'church_id', 'post_id', 'announcement_id', 'owner_id', 'path');

commit;
