-- What must be true of a database built from nothing but this repository.
--
-- Run by scripts/fresh-install.sh after every migration has been applied to an
-- empty Supabase database. Each check is a protection that was, at some point,
-- present on one database and missing from another -- which is exactly the
-- kind of thing a fresh install is the only place to catch. A failure raises,
-- so psql exits non-zero and the job goes red.
do $holds$
declare
  missing text;
begin
  -- 1. A suspended account is refused before any request runs
  --    (20260923164500_a_suspension_is_immediate).
  if not exists (
    select 1 from pg_roles r, unnest(r.rolconfig) c
     where r.rolname = 'authenticator'
       and c = 'pgrst.db_pre_request=public.refuse_suspended_requests'
  ) then
    raise exception 'the data API does not refuse a suspended account before each request';
  end if;

  -- 2. Revoking somebody's approval closes their conversations. Live lost this
  --    for five weeks because an older migration ran after the one that added
  --    it (20260923190000_live_matches_the_repository).
  if pg_get_functiondef('public.in_pairing(uuid)'::regprocedure) not like '%is_approved_user()%' then
    raise exception 'in_pairing() lets a person whose approval was revoked keep reading their pairing';
  end if;

  -- 3. No row rule compares a column with itself
  --    (20260923180000_a_door_compares_the_right_things).
  select string_agg(tablename || '.' || policyname, ', ') into missing
    from pg_policies
   where exists (
     select 1 from regexp_matches(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                                  '(\m\w+\.\w+ = \w+\.\w+\M)', 'g') m
      where split_part(m[1], ' = ', 1) = split_part(m[1], ' = ', 2));
  if missing is not null then
    raise exception 'these rules compare a column with itself and so check nothing: %', missing;
  end if;

  -- 4. Every table on the live connection, and the file store, shuts a
  --    suspended account out (20260923173000_a_suspension_reaches_the_socket_too).
  select string_agg(pt.tablename, ', ') into missing
    from pg_publication_tables pt
   where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = pt.schemaname and p.tablename = pt.tablename
          and p.policyname = 'a_suspended_account_sees_nothing' and p.permissive = 'RESTRICTIVE');
  if missing is not null then
    raise exception 'these broadcast tables do not shut a suspended account out: %', missing;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'a_suspended_account_sees_nothing' and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'the file store does not shut a suspended account out';
  end if;

  -- 5. Row security is on for every table in the app's own schema.
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then
    raise exception 'these tables have row security switched off: %', missing;
  end if;

  raise notice 'a fresh install holds every checked protection';
end
$holds$;
