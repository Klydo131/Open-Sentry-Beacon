-- Files in a conversation, on the live app.
--
-- WHY THIS WAS NOT HERE, AND WHY IT IS NOW. The note in lib/live/data.ts was
-- honest: object storage was "a later, deliberate decision with a quota
-- attached". The demo's attachments live in the sender's own IndexedDB, which
-- is a genuine privacy property and also means the bytes cannot travel — the
-- row syncs and the file does not. Fine for a demo on one device, useless for
-- a Guide who wants to send an Explorer a study sheet. This is that decision,
-- made: a private bucket, a row per file, both locked to the two people in the
-- pairing.
--
-- THE BYTES AND THE ROW ARE GUARDED SEPARATELY, and both matter. A row anyone
-- could read leaks filenames; an object anyone could fetch leaks the file, and
-- a storage path is guessable in a way a row id is not.

create table if not exists public.pairing_media (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references public.pairings(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  mime        text not null default '',
  size        bigint not null default 0,
  -- Where the bytes are. Always '<pairing_id>/<uuid>', which is what the
  -- storage policies below match on.
  path        text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists pairing_media_pairing_idx
  on public.pairing_media (pairing_id, created_at desc);

alter table public.pairing_media enable row level security;

-- REUSES public.in_pairing(uuid), which already exists and already asks exactly
-- this question for the messages policies. Writing a second copy was the first
-- instinct and would have been the mistake: two definitions of one security
-- check is one chance to fix the wrong one. Checked before reusing — SECURITY
-- DEFINER, STABLE, search_path pinned to public, granted to authenticated and
-- not to anon.

drop policy if exists pairing_media_read on public.pairing_media;
create policy pairing_media_read on public.pairing_media
  for select using (public.in_pairing(pairing_id));

drop policy if exists pairing_media_add on public.pairing_media;
create policy pairing_media_add on public.pairing_media
  for insert with check (
    owner_id = (select auth.uid()) and public.in_pairing(pairing_id)
  );

-- Only the sender may take it back. Not the other party: deleting something
-- somebody sent you is not the same as declining to look at it, and the person
-- who needs that power is a Director, through removal, not a peer.
drop policy if exists pairing_media_remove on public.pairing_media;
create policy pairing_media_remove on public.pairing_media
  for delete using (owner_id = (select auth.uid()));

revoke all on table public.pairing_media from anon;
grant select, insert, delete on table public.pairing_media to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- PRIVATE. A public bucket makes every file readable by anyone holding the URL,
-- and these are prayer notes and photographs between two people.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pairing-media',
  'pairing-media',
  false,
  10485760,  -- 10 MB. Enough for a photo or a study sheet; small enough that a
             -- free tier is not exhausted by one person with a video.
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reading the pairing id out of a storage path.
--
-- NEVER CAST TEXT TO UUID INSIDE A POLICY WITHOUT CHECKING IT FIRST. The first
-- draft did `((storage.foldername(name))[1])::uuid` directly. Every path this
-- app writes is '<uuid>/<uuid>' — but the bucket is reachable by any signed-in
-- browser, and a request naming 'pairing-media/not-a-uuid/x' makes that cast
-- RAISE rather than return false. An error is still a refusal, so nothing
-- leaks; but a policy that can be made to throw is one worth not having. The
-- regex short-circuits, so the cast only ever sees a well-formed uuid, and a
-- malformed path yields NULL — which in_pairing() answers false to.
create or replace function public.pairing_folder(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(p_name))[1] ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$$;

drop policy if exists pairing_media_object_read on storage.objects;
create policy pairing_media_object_read on storage.objects
  for select using (
    bucket_id = 'pairing-media'
    and public.in_pairing(public.pairing_folder(name))
  );

drop policy if exists pairing_media_object_add on storage.objects;
create policy pairing_media_object_add on storage.objects
  for insert with check (
    bucket_id = 'pairing-media'
    and owner = (select auth.uid())
    and public.in_pairing(public.pairing_folder(name))
  );

drop policy if exists pairing_media_object_remove on storage.objects;
create policy pairing_media_object_remove on storage.objects
  for delete using (
    bucket_id = 'pairing-media'
    and owner = (select auth.uid())
  );
