-- Close the doors nobody uses.
--
-- Nothing here fixes a leak that is happening. The audit that produced this
-- migration probed every table in the schema as the signed-out `anon` role and
-- every one of them returned zero rows. The problem is WHY they returned zero.
--
-- THE SHAPE OF THE RISK. Supabase grants `anon` and `authenticated` every
-- privilege on every new table by default, and Row Level Security is what takes
-- it back. A policy written without a `TO` clause applies to PUBLIC — which
-- includes `anon`. Thirteen policies here were written that way. They are safe
-- today only because each one compares something against `auth.uid()`, which is
-- NULL for a signed-out caller, so the test can never be true.
--
-- That is safety by arithmetic, not by design. The anonymous key ships inside
-- the JavaScript bundle; anyone who opens the app has it. The day somebody adds
-- a reasonable-looking policy — `using (is_published)`, say, or
-- `using (church_id = ...)` — that table becomes readable by the whole internet,
-- and nothing in the review would look wrong. Four tables were additionally
-- being saved by an accident: their policy calls a helper that reads a table
-- `anon` cannot read, so the query RAISES instead of returning nothing. Remove
-- that helper's inner read some day and the accident stops saving them.
--
-- So: `anon` loses every table privilege, because the app never signs in as
-- `anon` for data. Every policy names `authenticated` explicitly. And a new
-- event trigger does for table grants what `lock_new_functions` already does
-- for function grants, so the next table created cannot reintroduce this.
--
-- TWO STORAGE POLICIES WERE GENUINELY TOO WIDE. `lesson_file_read` and
-- `avatar_read` matched on the folder name alone, so any signed-in account
-- could list and download every lesson file and every avatar in the instance,
-- regardless of church. The `lesson_files` METADATA table is correctly scoped
-- with `church_id = my_church_id()`; the bytes were not scoped at all. There is
-- one church and zero lesson files today, so nothing has been exposed — which
-- is exactly why this is the cheap moment to fix it, before there are files to
-- migrate and before the second church makes it real.
--
-- SCOPING THE AVATARS TURNED UP SOMETHING ELSE. Ten avatar images are stored;
-- only seven belong to a profile that still exists. Three were uploaded by
-- accounts that have since been deleted, and the pictures stayed behind. No
-- screen renders them, because there is no profile left to render — they were
-- simply unreachable rather than gone. A person who asks to be deleted and
-- whose photograph remains on the server has not been deleted, so the last
-- section tries to make the bytes follow the account out.
--
-- CORRECTION, added the same day by the migration that undoes it: that last
-- section DOES NOT WORK and never could. Supabase refuses direct deletes from
-- `storage.objects`, the trigger below swallows the refusal, and the files
-- stay. See 20260901140000_a_database_trigger_cannot_delete_a_photograph.sql,
-- which drops it and moves the job into the app, where the Storage API can
-- actually delete the image and not merely the row that points at it.

begin;

-- ---------------------------------------------------------------------------
-- 1. The signed-out role keeps nothing.
--
-- Checked first, and it matters: no function in either schema is executable by
-- `anon`, and no screen queries a table before sign-in. The one that looked
-- like it did — the /setup health probe — was already receiving `42501` and
-- calling the database "unreachable". That is fixed on the app side.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables    in schema public from public;

-- `blog_views` has RLS on and deliberately no policies for anybody: it is
-- written only by `record_blog_view` and read only by `blog_reader_count`,
-- both SECURITY DEFINER. Holding grants it can never use is noise that reads
-- like an oversight. Take them.
revoke all on public.blog_views from authenticated;

-- Stop the default from coming back on the next table.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- 2. Every policy says who it is for.
--
-- ALTER POLICY ... TO changes the role list and leaves the expression exactly
-- as it is. Rewriting thirteen `using` clauses by hand to change one word is
-- how a typo becomes a security incident.
-- ---------------------------------------------------------------------------
alter policy discipline_log_read     on public.discipline_log     to authenticated;
alter policy guild_members_read      on public.guild_members      to authenticated;
alter policy guilds_read             on public.guilds             to authenticated;
alter policy messages_send           on public.messages           to authenticated;
alter policy pairing_media_add       on public.pairing_media      to authenticated;
alter policy pairing_media_read      on public.pairing_media      to authenticated;
alter policy pairing_media_remove    on public.pairing_media      to authenticated;
alter policy reports_decide          on public.reports            to authenticated;
alter policy reports_read            on public.reports            to authenticated;
alter policy trial_parties_read      on public.trial_parties      to authenticated;
alter policy trial_statements_read   on public.trial_statements   to authenticated;
alter policy trial_statements_speak  on public.trial_statements   to authenticated;
alter policy trials_read             on public.trials             to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What `lock_new_functions` does for functions, this does for tables.
--
-- `ensure_rls` already turns RLS on for a new table. That is half the job: RLS
-- decides which ROWS a role may see, and the grant decides whether the role may
-- ask at all. Without both, a new table arrives holding the default grant, and
-- the next policy written without a `TO` clause opens it.
--
-- It never blocks DDL. An over-granted table is a finding; a database that
-- refuses migrations is an outage. Same trade, same reason, as the sibling.
-- ---------------------------------------------------------------------------
create or replace function public.lock_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       and obj.schema_name = 'public'
       and obj.object_type in ('table', 'partitioned table') then
      begin
        execute format('revoke all on table %s from anon', obj.object_identity);
        execute format('revoke all on table %s from public', obj.object_identity);
        -- No grant to `authenticated`. What a table is readable by is the
        -- business of the migration that creates it, not of this trigger.
      exception when others then
        raise warning 'lock_new_tables could not lock %: %', obj.object_identity, sqlerrm;
      end;
    end if;
  end loop;
end $$;

revoke all on function public.lock_new_tables() from public, anon, authenticated;

drop event trigger if exists lock_new_tables;
create event trigger lock_new_tables on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.lock_new_tables();

-- ---------------------------------------------------------------------------
-- 4. The bytes get the same church boundary as the row that describes them.
--
-- Paths are `lessons/<uploader>/…` and `avatars/<uploader>/…`. The uploader's
-- church is the church the file belongs to. `can_access_church` is the same
-- test the rest of the app uses, and it is the reason this is not simply
-- `= my_church_id()`: an Executive Director oversees churches that are not
-- their own, and must still see the avatars of the people in them.
--
-- The folder segment is cast through a helper rather than inline, because
-- `'notauuid'::uuid` raises, and a policy that can raise is a policy that can
-- take down every screen that touches the bucket.
-- ---------------------------------------------------------------------------
create or replace function public.uploader_church(p_folder text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare u uuid;
begin
  begin
    u := p_folder::uuid;
  exception when others then
    return null;
  end;
  return (select church_id from public.profiles where id = u);
end $$;

revoke all on function public.uploader_church(text) from public, anon;
grant execute on function public.uploader_church(text) to authenticated;

alter policy lesson_file_read on storage.objects
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'lessons'
    and public.can_access_church(public.uploader_church((storage.foldername(name))[2]))
  );

alter policy avatar_read on storage.objects
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'avatars'
    and public.can_access_church(public.uploader_church((storage.foldername(name))[2]))
  );

-- ---------------------------------------------------------------------------
-- 5. A deleted account takes its pictures with it.
--
-- `profiles` is removed by cascade when the account behind it is removed, so
-- this fires on the way out and clears anything filed under that person's id in
-- the bucket — their avatar, and any lesson file they uploaded.
--
-- It runs as the definer because the row is being deleted by an administrator
-- acting on somebody else's account, and `storage.objects` has its own rules
-- that would otherwise refuse. It swallows its own errors on purpose: failing
-- to tidy a picture must never be the reason an erasure request cannot be
-- carried out.
--
-- This governs deletions from today forward. Pictures already orphaned by
-- earlier deletions are still in the bucket and are listed in the audit report;
-- removing those is the owner's call, not a migration's.
-- ---------------------------------------------------------------------------
create or replace function public.forget_stored_files()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  begin
    delete from storage.objects
     where bucket_id = 'pairing-media'
       and (storage.foldername(name))[2] = old.id::text;
  exception when others then
    raise warning 'forget_stored_files could not clear files for a deleted profile: %', sqlerrm;
  end;
  return old;
end $$;

revoke all on function public.forget_stored_files() from public, anon, authenticated;

drop trigger if exists forget_stored_files on public.profiles;
create trigger forget_stored_files
  after delete on public.profiles
  for each row execute function public.forget_stored_files();

commit;
