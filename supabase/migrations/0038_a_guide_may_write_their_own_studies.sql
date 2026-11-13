-- A GUIDE COULD NOT WRITE A LESSON. That is the whole of the complaint.
--
-- lesson_series and lessons both had a single write policy,
-- manages_church(church_id), so only a Director or an Executive Director could
-- create anything. A Guide, the person actually sitting with somebody week by
-- week, could look at a list of titles and nothing else. There was no way to
-- attach a handout, and nothing for an Explorer to open.
--
-- WHO OWNS WHAT, NOW.
--   A Director writes for the church, as before.
--   A Guide writes their own, and may only edit and delete their own.
--   An Explorer reads anything published in their church, and opens the files.
--
-- author_id is what makes "their own" expressible. lesson_series had no author
-- column at all, which is why the only available rule was "manages the church".

alter table public.lesson_series
  add column if not exists author_id uuid references public.profiles (id) on delete set null;

drop policy if exists ls_write on public.lesson_series;
drop policy if exists ls_read  on public.lesson_series;
drop policy if exists ls_edit  on public.lesson_series;
drop policy if exists ls_drop  on public.lesson_series;

create policy ls_read on public.lesson_series
  for select to authenticated
  using (
    (is_published and church_id = public.my_church_id())
    -- Your own drafts. Without this a Guide cannot see what they just wrote
    -- until they publish it, which makes writing it impossible.
    or (author_id = (select auth.uid()))
    or public.manages_church(church_id)
  );

create policy ls_write on public.lesson_series
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and (
      public.manages_church(church_id)
      or (public.auth_role() = 'dm' and author_id = (select auth.uid()))
    )
  );

create policy ls_edit on public.lesson_series
  for update to authenticated
  using (public.manages_church(church_id) or author_id = (select auth.uid()))
  with check (church_id = public.my_church_id());

create policy ls_drop on public.lesson_series
  for delete to authenticated
  using (public.manages_church(church_id) or author_id = (select auth.uid()));

drop policy if exists lessons_write on public.lessons;
drop policy if exists lessons_read  on public.lessons;
drop policy if exists lessons_edit  on public.lessons;
drop policy if exists lessons_drop  on public.lessons;

create policy lessons_read on public.lessons
  for select to authenticated using (church_id = public.my_church_id());

create policy lessons_write on public.lessons
  for insert to authenticated
  with check (
    church_id = public.my_church_id()
    and (
      public.manages_church(church_id)
      or (public.auth_role() = 'dm' and author_id = (select auth.uid()))
    )
  );

create policy lessons_edit on public.lessons
  for update to authenticated
  using (public.manages_church(church_id) or author_id = (select auth.uid()))
  with check (church_id = public.my_church_id());

create policy lessons_drop on public.lessons
  for delete to authenticated
  using (public.manages_church(church_id) or author_id = (select auth.uid()));

-- A handout attached to a lesson. The path points into the same private bucket
-- the conversation attachments use, under lessons/; the object is signed at
-- render time, because a stored signed URL expires.
create table if not exists public.lesson_files (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  church_id  uuid not null references public.churches (id) on delete cascade,
  added_by   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 200),
  path       text not null,
  mime       text,
  size_bytes integer,
  created_at timestamptz not null default now()
);

create index if not exists lesson_files_lesson_idx on public.lesson_files (lesson_id);

alter table public.lesson_files enable row level security;

drop policy if exists lesson_files_read  on public.lesson_files;
drop policy if exists lesson_files_write on public.lesson_files;
drop policy if exists lesson_files_drop  on public.lesson_files;

-- Anybody who can read the lesson can open what is attached to it. A handout
-- nobody can open is the bug this table exists to fix.
create policy lesson_files_read on public.lesson_files
  for select to authenticated using (church_id = public.my_church_id());

create policy lesson_files_write on public.lesson_files
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and church_id = public.my_church_id()
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (public.manages_church(l.church_id) or l.author_id = (select auth.uid()))
    )
  );

create policy lesson_files_drop on public.lesson_files
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (select 1 from public.lessons l
               where l.id = lesson_id and public.manages_church(l.church_id))
  );

drop policy if exists lesson_file_read  on storage.objects;
drop policy if exists lesson_file_write on storage.objects;
drop policy if exists lesson_file_drop  on storage.objects;

create policy lesson_file_read on storage.objects
  for select to authenticated
  using (bucket_id = 'pairing-media' and (storage.foldername(name))[1] = 'lessons');

create policy lesson_file_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'lessons'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy lesson_file_drop on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'lessons'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
