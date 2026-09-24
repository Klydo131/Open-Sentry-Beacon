-- Undo two grants 0031 should never have made, and fix the rule that made them.
--
-- THE FAULT. 0031 looped over every function and granted EXECUTE to
-- `authenticated`. A blanket grant cannot tell a function that was never
-- granted from one that was deliberately UN-granted, so it silently overrode
-- every narrower decision anybody had made earlier.
--
-- It overrode exactly two, and one of them mattered:
--
--   member_by_email(text) takes an arbitrary email address and returns the id,
--   name, role and church of whoever holds it -- across every church in the
--   database, with no caller check of any kind. It was restricted to
--   service_role in 0016, in 0017 and again in 0018: three separate migrations
--   ending with the same revoke, because it is an identity-disclosure
--   primitive and the authors knew it. 0031 handed it to every signed-in user,
--   including Explorers, who are the least privileged role in the app and the
--   ones the safeguarding model exists to protect. "Does this person have an
--   account here, what are they called, and which congregation are they in" is
--   precisely the question this app must not answer.
--
--   rls_auto_enable() returns event_trigger, so PostgREST cannot invoke it and
--   nothing was reachable -- but it is infrastructure, not an API, and should
--   never have carried a grant.
--
-- THE RULE, restated: a lockdown only ever TAKES AWAY. Whatever a function is
-- meant to be callable by is the business of the migration that creates it.
--
-- Failing closed is the right direction. A migration that forgets to grant
-- breaks its feature the first time somebody uses it, loudly and in testing. A
-- lockdown that grants by default erases a restriction silently, and nobody
-- finds out until it is being used against them.

revoke all on function public.member_by_email(text) from public, anon, authenticated;
grant execute on function public.member_by_email(text) to service_role;

-- GUARDED, ADDED 2026-09-23 SO A NEW CHURCH CAN INSTALL. rls_auto_enable() is
-- put there by the Supabase dashboard on some projects and not others, and a
-- brand-new project does not have it -- so this line, unguarded, stopped a
-- fresh install at this file (proven by applying every migration to an empty
-- Supabase database). 0005 already guards the same function the same way.
-- Where the function exists nothing changes: the same revoke runs.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

create or replace function public.lock_new_functions()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  obj     record;
  not_api boolean;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag = 'CREATE FUNCTION' and obj.schema_name = 'public' then
      begin
        -- Trigger and event-trigger functions are machinery, never endpoints.
        select p.prorettype in ('pg_catalog.trigger'::regtype,
                                'pg_catalog.event_trigger'::regtype)
          into not_api
          from pg_proc p where p.oid = obj.objid;

        execute format('revoke all on function %s from public', obj.objid::regprocedure);
        execute format('revoke all on function %s from anon',   obj.objid::regprocedure);

        if not_api then
          execute format('revoke all on function %s from authenticated', obj.objid::regprocedure);
        end if;
        -- No grant. See the header.
      exception when others then
        -- Never block DDL. An open function is a finding; a database that
        -- refuses migrations is an outage.
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

-- Assert both properties rather than trusting the statements above.
do $$
declare bad integer;
begin
  select count(*) into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if bad > 0 then
    raise exception '% function(s) still executable by anon', bad;
  end if;

  if has_function_privilege('authenticated', 'public.member_by_email(text)', 'EXECUTE') then
    raise exception 'member_by_email is still callable by authenticated users';
  end if;
end $$;
