-- Somewhere for the bytes: pictures and files in a study room.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "I want the whole feature please", with screenshots of AFFiNE's
-- own editor. Images and attachments are part of that, and until now the room
-- kept them in `MemoryBlobSource` -- a JavaScript Map that empties when the tab
-- closes. A photograph of somebody's Bible page would have survived exactly as
-- long as the browser tab did, and looked like a bug on the next visit.
--
-- WHY A TABLE AND NOT A STORAGE BUCKET. The app already has uploads, with rules
-- about what may be uploaded and who may see it, and those rules live in the
-- existing bucket policies. A study room writing into that bucket would be a
-- second, quieter path into the same place. This is the same shape as
-- `study_docs`, owner-only like everything else in the room, and it lives and
-- dies with the room rather than with the church's media.
--
-- THE CEILING IS THE POINT, not an afterthought. The free tier is 500 MB for
-- the whole congregation, so a room where anybody can paste a 20 MB photograph
-- is a room that takes the church's database down. One megabyte of real bytes
-- per picture, which is a generous photograph once it has been resized, and the
-- app resizes before it ever gets here.
--
-- BASE64, BECAUSE THE CLIENT SPEAKS JSON. PostgREST hands `bytea` back as a hex
-- string that has to be parsed anyway; text of base64 is the same trip with one
-- less conversion, and it is what `study_docs.state` already does.
-- ---------------------------------------------------------------------------

create table if not exists public.study_blobs (
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  workspace_id text not null,
  -- BlockSuite's own key for the blob: the sha of its contents. Two copies of
  -- the same picture are therefore one row, which is why this is not a uuid.
  key          text not null,
  mime         text not null default 'application/octet-stream',
  bytes        text not null,
  created_at   timestamptz not null default now(),

  primary key (owner_id, workspace_id, key),

  -- 1 MB of real bytes is about 1.37 MB of base64.
  constraint study_blobs_fits check (length(bytes) <= 1400000)
);

alter table public.study_blobs enable row level security;

-- ONE POLICY PER VERB, EACH NAMING `authenticated`. A policy with no TO clause
-- applies to every Postgres role, including the anonymous one Supabase grants
-- the whole internet. There is no update policy on purpose: a blob is its own
-- checksum, so a changed blob is a different key, and a row that can be
-- rewritten in place is a way to swap the contents of a picture somebody has
-- already put in a page.
drop policy if exists study_blobs_read on public.study_blobs;
create policy study_blobs_read on public.study_blobs
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists study_blobs_write on public.study_blobs;
create policy study_blobs_write on public.study_blobs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists study_blobs_drop on public.study_blobs;
create policy study_blobs_drop on public.study_blobs
  for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, delete on public.study_blobs to authenticated;

create index if not exists study_blobs_by_room
  on public.study_blobs (owner_id, workspace_id);

comment on table public.study_blobs is
  'Pictures and files inside an Explorer''s own study room. Owner-only, capped, '
  'and deleted with the account.';
