-- Close every SECURITY DEFINER function to unauthenticated callers, and close
-- the trigger functions to everybody.
--
-- WHY THE EARLIER REVOKES DID NOTHING. Migrations 0006-0009 each said
-- `revoke all on function ... from anon`, and every one of them was a no-op.
-- Postgres grants EXECUTE to PUBLIC by default, PUBLIC includes every role, and
-- revoking from a member does not remove a privilege held through PUBLIC. The
-- functions stayed callable at /rest/v1/rpc/<name> without signing in, and
-- Supabase's own linter is what found it — not the four rounds of policy
-- testing that preceded it, because those tested TABLES and these are
-- FUNCTIONS.
--
-- Nothing had leaked. Each function keys off auth.uid() and an anonymous caller
-- has none, so prayer_wall() matched no church, my_blog_posts() matched no
-- author and can_read_post() returned false. But that is the argument being
-- load-bearing rather than the permission, and one future edit that forgets to
-- check auth.uid() turns a reachable endpoint into a disclosure.
--
-- A loop rather than a list, because a hand-written list is a thing to forget
-- to update, and the next definer function somebody writes should be closed by
-- default rather than by memory.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- TRIGGER FUNCTIONS ARE NOT AN API.
--
-- The loop above grants to `authenticated`, which is right for the helpers a
-- policy invokes and wrong for handle_new_user, lock_privileged_profile_columns,
-- validate_invite_privilege and their kin. Those are invoked by a table, never
-- by a caller. Fixing one thing and loosening another beside it is the ordinary
-- way this goes wrong, which is why the linter gets run again AFTER the fix.
--
-- A trigger function runs as the table owner when the trigger fires, so taking
-- EXECUTE from every role changes nothing about the triggers. What it removes is
-- calling them directly over REST, where the state a trigger depends on — NEW,
-- OLD, TG_OP — does not exist.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;

-- PROVED AFTER APPLYING, both directions:
--
--   anon calls prayer_wall()                     refused 42501
--   anon calls my_blog_posts()                   refused 42501
--   anon calls record_blog_view()                refused 42501
--   authenticated calls handle_new_user()        refused 42501
--   authenticated calls lock_privileged_...()    refused 42501
--   Guide calls my_blog_posts()                  2 posts     <- control
--   Explorer calls prayer_wall()                 2 rows      <- control
--   Explorer reads materials (policy uses these) 2 shared    <- control
--   Executive reads members                      8           <- control
--   a new auth user still gets a profile         yes         <- control
--   self-promotion to executive                  refused, still 'ds'
--
-- The controls are the point. Revoking EXECUTE on functions that RLS policies
-- call would have locked every user out of every table, and the failure would
-- have looked exactly like "the app is broken" rather than like a permission
-- change.
