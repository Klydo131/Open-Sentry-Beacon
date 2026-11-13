-- BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.
--
-- Applied to the live database as `guide_only_lesson_planning` and never committed,
-- so a fresh install from this repository had no lesson_guide_shares table at all,
-- and nobody reviewing the repository could see its policies -- one of which
-- compares a column with itself. That is corrected, not here, in
-- 20260923180000_a_door_compares_the_right_things.sql.
--
-- Everything below the rule is the applied text, byte for byte: its md5 was
-- checked against supabase_migrations.schema_migrations before it was
-- committed. The live text ends in one stray carriage return, which
-- .gitattributes (eol=lf) strips on commit; that trailing byte is the only
-- difference. It is already in the live database, which records migrations by
-- the time they ran, so this file changes nothing there. It exists so that a
-- fresh database built from this repository is the same database.
-- ---------------------------------------------------------------------------
-- Applied after the 2026-09-01 Claude production migrations.
begin;

-- A leadership lesson plan is not the same audience as a published church
-- lesson. Published series keep their existing church-wide meaning. These
-- rows let a Director or Executive Director share an unpublished plan with
-- every active Guide, or with one named active Guide, without exposing the
-- plan to Explorers.
create table if not exists public.lesson_guide_shares (
  id         uuid primary key default gen_random_uuid(),
  series_id  uuid not null references public.lesson_series (id) on delete cascade,
  church_id  uuid not null references public.churches (id) on delete cascade,
  guide_id   uuid references public.profiles (id) on delete cascade,
  shared_by  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists lesson_guide_share_all_idx
  on public.lesson_guide_shares (series_id)
  where guide_id is null;

create unique index if not exists lesson_guide_share_one_idx
  on public.lesson_guide_shares (series_id, guide_id)
  where guide_id is not null;

create index if not exists lesson_guide_share_reader_idx
  on public.lesson_guide_shares (church_id, guide_id, series_id);

alter table public.lesson_guide_shares enable row level security;

revoke all on table public.lesson_guide_shares from public, anon, authenticated;
grant select, insert, delete on table public.lesson_guide_shares to authenticated;
grant all on table public.lesson_guide_shares to service_role;

drop policy if exists lesson_guide_shares_read on public.lesson_guide_shares;
create policy lesson_guide_shares_read on public.lesson_guide_shares
  for select to authenticated
  using (
    public.manages_church(church_id)
    or (
      public.auth_role() = 'dm'
      and public.in_guide_room(church_id)
      and church_id = public.my_church_id()
      and (guide_id is null or guide_id = (select auth.uid()))
    )
  );

drop policy if exists lesson_guide_shares_write on public.lesson_guide_shares;
create policy lesson_guide_shares_write on public.lesson_guide_shares
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and public.manages_church(church_id)
    and exists (
      select 1
      from public.lesson_series as series
      where series.id = series_id
        and series.church_id = church_id
        and not series.is_published
    )
    and (
      guide_id is null
      or exists (
        select 1
        from public.profiles as guide
        where guide.id = guide_id
          and guide.church_id = church_id
          and guide.role = 'dm'
          and guide.is_approved
          and guide.suspended_at is null
      )
    )
  );

drop policy if exists lesson_guide_shares_drop on public.lesson_guide_shares;
create policy lesson_guide_shares_drop on public.lesson_guide_shares
  for delete to authenticated
  using (public.manages_church(church_id));

-- A shared planning series must stay Guide-only. Publishing it would switch on
-- the existing church-wide read policy, so the database refuses that transition
-- until leadership removes its Guide planning shares.
create schema if not exists private;

create or replace function private.keep_guide_plans_unpublished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.is_published and exists (
    select 1
    from public.lesson_guide_shares as share
    where share.series_id = new.id
  ) then
    raise exception 'Remove the Guide planning shares before publishing this series church-wide.';
  end if;
  return new;
end;
$fn$;

revoke all on function private.keep_guide_plans_unpublished() from public, anon, authenticated;

drop trigger if exists keep_guide_plans_unpublished on public.lesson_series;
create trigger keep_guide_plans_unpublished
  before update of is_published on public.lesson_series
  for each row execute function private.keep_guide_plans_unpublished();

-- Series visibility now has one additional Guide-only path. Explorers retain
-- only the existing published-in-my-church path.
drop policy if exists ls_read on public.lesson_series;
create policy ls_read on public.lesson_series
  for select to authenticated
  using (
    (is_published and church_id = public.my_church_id())
    or author_id = (select auth.uid())
    or public.manages_church(church_id)
    or (
      public.auth_role() = 'dm'
      and exists (
        select 1
        from public.lesson_guide_shares as share
        where share.series_id = lesson_series.id
          and share.church_id = lesson_series.church_id
          and (share.guide_id is null or share.guide_id = (select auth.uid()))
      )
    )
  );

-- Keep a Guide from changing the author while editing their own series.
drop policy if exists ls_edit on public.lesson_series;
create policy ls_edit on public.lesson_series
  for update to authenticated
  using (public.manages_church(church_id) or author_id = (select auth.uid()))
  with check (
    church_id = public.my_church_id()
    and (public.manages_church(church_id) or author_id = (select auth.uid()))
  );

-- A lesson and its file metadata are readable only when their parent series is
-- readable. This is what makes the new audience real at the database boundary,
-- instead of merely hiding a title in the interface.
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
  for select to authenticated
  using (
    (
      series_id is not null
      and exists (
        select 1
        from public.lesson_series as series
        where series.id = lessons.series_id
          and series.church_id = lessons.church_id
      )
    )
    or (
      series_id is null
      and (author_id = (select auth.uid()) or public.manages_church(church_id))
    )
  );

drop policy if exists lesson_files_read on public.lesson_files;
create policy lesson_files_read on public.lesson_files
  for select to authenticated
  using (
    church_id = public.my_church_id()
    and exists (
      select 1
      from public.lessons as lesson
      where lesson.id = lesson_files.lesson_id
        and lesson.church_id = lesson_files.church_id
    )
  );

create index if not exists lesson_files_path_idx on public.lesson_files (path);

drop policy if exists lesson_file_read on storage.objects;
create policy lesson_file_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'lessons'
    and exists (
      select 1
      from public.lesson_files as file
      where file.path = storage.objects.name
    )
  );

-- The Guides' Room roster is also the selector for individual planning shares.
-- Suspended Guides must not remain available as recipients.
create or replace function public.guide_room_people()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path to 'public' as $fn$
  select profile.id, coalesce(profile.full_name, 'Someone'), profile.role::text
  from public.profiles as profile
  where profile.church_id = public.my_church_id()
    and profile.role in ('dm', 'admin', 'executive')
    and profile.is_approved
    and profile.suspended_at is null
    and public.in_guide_room(public.my_church_id());
$fn$;

revoke all on function public.guide_room_people() from public, anon;
grant execute on function public.guide_room_people() to authenticated;

commit;

