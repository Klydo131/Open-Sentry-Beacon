-- Close every public function to anonymous callers, and keep it closed.
--
-- WHAT THE AUDIT FOUND. Three functions in `public` were callable at
-- /rest/v1/rpc/<name> without signing in: enforce_guide_pairing_limit,
-- guide_pairing_limit (both added the day before, by me) and pairing_folder
-- (added in 0022). None was meaningfully exploitable -- one is a trigger
-- function PostgREST cannot invoke, the other two return a constant and a
-- parsed UUID. The problem is not what they leak. It is that 0010 established
-- "nothing in public answers an anonymous caller" and the guarantee had
-- silently decayed, three functions at a time, with nothing to notice.
--
-- WHY 0010 COULD NOT HOLD THE LINE. It was a DO block that looped over the
-- functions existing at that moment. Postgres grants EXECUTE to PUBLIC on every
-- new function by default, and PUBLIC includes anon -- so every function
-- created afterwards arrived open, and 0010 had already run. Its own header
-- says the next definer function somebody writes "should be closed by default
-- rather than by memory", which a one-shot sweep cannot deliver.
--
-- So this migration does the sweep AND installs an event trigger that performs
-- it on every CREATE FUNCTION from now on. Event triggers are available to the
-- project owner on Supabase -- checked, not assumed.
--
-- NOTE FOR THE READER: the grant in the loop below is wrong, and 0032 corrects
-- it. It is left here rather than rewritten because this is what ran against
-- the live database, and a migration history that does not match the database
-- is worse than one that records a mistake.

-- Pin the search_path on the two functions that lacked it. Both call into other
-- schemas, so a caller who controls search_path could otherwise shadow what
-- they resolve to.
create or replace function public.guide_pairing_limit()
returns integer
language sql immutable
set search_path to 'public'
as $fn$ select 5; $fn$;

create or replace function public.pairing_folder(p_name text)
returns uuid
language sql immutable
set search_path to 'public', 'storage'
as $fn$
  select case
    when (storage.foldername(p_name))[1] ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$fn$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    if f.is_trigger_fn then
      execute format('revoke all on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

create or replace function public.lock_new_functions()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  obj record;
  is_trigger_fn boolean;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag = 'CREATE FUNCTION' and obj.schema_name = 'public' then
      begin
        select p.prorettype = 'pg_catalog.trigger'::regtype
          into is_trigger_fn
          from pg_proc p where p.oid = obj.objid;

        execute format('revoke all on function %s from public', obj.objid::regprocedure);
        execute format('revoke all on function %s from anon', obj.objid::regprocedure);

        if is_trigger_fn then
          execute format('revoke all on function %s from authenticated', obj.objid::regprocedure);
        else
          execute format('grant execute on function %s to authenticated', obj.objid::regprocedure);
          execute format('grant execute on function %s to service_role', obj.objid::regprocedure);
        end if;
      exception when others then
        raise warning 'lock_new_functions could not lock %: %', obj.object_identity, sqlerrm;
      end;
    end if;
  end loop;
end $fn$;

revoke all on function public.lock_new_functions() from public, anon, authenticated;

drop event trigger if exists lock_new_functions;
create event trigger lock_new_functions
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public.lock_new_functions();

do $$
declare open_count integer;
begin
  select count(*) into open_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if open_count > 0 then
    raise exception 'Lockdown failed: % function(s) in public are still executable by anon', open_count;
  end if;
end $$;
