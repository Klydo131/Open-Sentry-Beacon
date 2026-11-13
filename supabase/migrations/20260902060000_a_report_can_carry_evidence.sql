-- Evidence on a safeguarding report.
--
-- WHAT WAS MISSING. A report carried a reason and a paragraph of text and
-- nothing else. The thing being reported is very often a picture, a screenshot
-- of a conversation, a voice note or a document — and the person raising it had
-- nowhere to put any of it. They were asked to describe, in their own words,
-- something they were holding on their phone. A Director then decided on that
-- description alone.
--
-- THE PREFIX IS `reports/<uploader>/`, matching `lessons/` and `avatars/`, so
-- the existing folder conventions in this bucket keep meaning one thing.
--
-- WHO CAN READ IT, AND WHY IT IS NARROWER THAN EVERYTHING ELSE IN THE BUCKET.
-- Lesson handouts and avatars are readable across a church, because they are
-- meant to be. Evidence is not. `reports_read` already limits a report to the
-- Directors and Executive Directors of its church, and this matches it exactly
-- — including, deliberately, keeping it from the person who raised it. There is
-- no "my reports" view for a reporter anywhere in this app; they are told it
-- went through at the time, and every extra read path is another way for this
-- to end up with the wrong person. Attaching does not create one.
--
-- AND THERE IS NO DELETE, for either the row or the object. `reports` itself has
-- no delete policy, on purpose: a record somebody can remove is not a record.
-- Evidence attached to one inherits that, so nothing here grants DELETE and the
-- leader-cleanup policy on this bucket stays limited to avatars and lessons.

create table if not exists public.report_files (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  church_id   uuid not null references public.churches(id) on delete cascade,
  added_by    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  path        text not null unique,
  mime        text,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);

create index if not exists report_files_by_report on public.report_files (report_id, created_at);

alter table public.report_files enable row level security;

-- Reading matches `reports_read` exactly. Written out rather than delegated so
-- the two can be compared side by side; a helper here would hide the fact that
-- this is deliberately the same rule.
drop policy if exists report_files_read on public.report_files;
create policy report_files_read on public.report_files
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive')
        and me.church_id = report_files.church_id
    )
  );

-- NO INSERT POLICY. Attaching goes through the definer function below, which is
-- the only thing that can confirm the caller actually raised the report it is
-- being attached to — a fact the reporter cannot check for themselves, because
-- they cannot read the reports table at all.

/**
 * Attach one piece of evidence to a report you raised.
 */
create or replace function private.attach_report_evidence(
  p_report uuid,
  p_name   text,
  p_path   text,
  p_mime   text,
  p_size   bigint
) returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_me     uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_id     uuid;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into v_report from public.reports where id = p_report;
  if v_report.id is null or v_report.reporter_id is distinct from v_me then
    -- ONE MESSAGE FOR BOTH CASES. Telling somebody a report exists but is not
    -- theirs confirms that a report exists, which is the thing a person trying
    -- to find out whether they have been reported would be probing for.
    raise exception 'That report is not yours.' using errcode = '42501';
  end if;

  -- Evidence goes on while the report is still open. A closed report is a
  -- decided one, and quietly adding to the file after the decision is how a
  -- record stops matching what was actually considered.
  if v_report.status is distinct from 'open' then
    raise exception 'That report has already been decided.' using errcode = '42501';
  end if;

  -- The path must be in this caller's own folder, or a reporter could attach a
  -- row pointing at somebody else's object and read it back through the
  -- Director's screen.
  if p_path is null or p_path not like 'reports/' || v_me::text || '/%' then
    raise exception 'That file was not uploaded by you.' using errcode = '42501';
  end if;

  insert into public.report_files (report_id, church_id, added_by, name, path, mime, size_bytes)
  values (p_report, v_report.church_id, v_me,
          left(btrim(coalesce(p_name, 'file')), 200), p_path,
          nullif(btrim(coalesce(p_mime, '')), ''), p_size)
  returning id into v_id;

  return v_id;
end;
$fn$;

create or replace function public.attach_report_evidence(
  p_report uuid, p_name text, p_path text, p_mime text, p_size bigint
) returns uuid
language sql
security definer
set search_path to public, pg_temp
as $$ select private.attach_report_evidence(p_report, p_name, p_path, p_mime, p_size) $$;

revoke all on function private.attach_report_evidence(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.attach_report_evidence(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.attach_report_evidence(uuid, text, text, text, bigint) to authenticated;

-- ---- Storage: the objects themselves --------------------------------------

drop policy if exists report_evidence_write on storage.objects;
create policy report_evidence_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Leadership of the UPLOADER'S church, which is the same church as the report:
-- report_person takes church_id from the reporter's own profile, so the two
-- cannot disagree.
drop policy if exists report_evidence_read on storage.objects;
create policy report_evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'reports'
    and manages_church(uploader_church((storage.foldername(name))[2]))
  );
