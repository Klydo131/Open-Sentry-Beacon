-- The court room is closed. Admin Reports is reports, and a conversation.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 27 October 2026: "Admin reports will just be admin reports by
-- now, not a court room. I think it will complicate more things if we do
-- online court rooms in this application. It will be just faster if Admins can
-- see reports, see the problems and reports and be transparent to both Guide
-- and Explorer users by chatting them as Admins, no more trial online." And,
-- asked which way: remove the court room from the app. "All legacy features
-- will be archived in the foundation and Library for museum purposes only."
--
-- WHAT GOES. Everything the court room added, from 0024_trial_court to
-- 20261021100000_the_court_room_door_by_email: the trials and their parties
-- and statements, the hash-chained record, exhibits and their bucket, leave to
-- answer and its minute-by-minute sweep, who-is-in-the-room, the judge draw,
-- the Church Board's ruling, the door (a second step before the room opened)
-- and its e-mail codes. Its screens, functions and proofs are in this
-- repository's history, last at commit 82cf18f; they are not for running.
--
-- WHAT STAYS, AND IS REWRITTEN WITHOUT THE COURT IN IT:
--   * the check before every request (refuse_suspended_requests): a suspended
--     account is refused everything again, with no court-room exception;
--   * the suspended-account rule on stored files, without the exhibits bucket;
--   * library sharing between a Guide and an Explorer
--     (library_sharing_status, why_library_sharing_is_paused,
--     library_pairing_controls), which paused while a case was open about
--     either of them. A Director can still pause it for a pairing by hand
--     (pairing_library_permissions); nothing pauses it on its own now;
--   * church_pulse, without its "cases open" count.
-- Reports themselves (0021, 20260915120000, 20261020180000's names that
-- outlive an account) are not touched here.
--
-- A RECORD IS NOT THROWN AWAY BY A MIGRATION. On the live project and on any
-- fresh install the court room's tables are empty, and they are dropped. A copy
-- that DID hold cases keeps them: the tables move, data and all, into a schema
-- of their own, `court_archive`, that no app role can reach, and exhibit files
-- stay in their bucket with no rule left that lets anybody read them. That is
-- the church's record to keep or delete; this file does not decide it.
-- ---------------------------------------------------------------------------

begin;

-- ------------------------------------------------------- the rewritten rules --

-- As 20261013140000: suspended means refused, with no door left ajar.
create or replace function public.refuse_suspended_requests()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Signed out (no uid) or not suspended: carry on. This runs before EVERY
  -- request, so it does one indexed lookup and nothing else.
  if exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.suspended_at is not null
  ) then
    raise exception 'This account is suspended.'
      using errcode = '42501',
            hint = 'A leader has suspended this account. Sign-in is closed until they lift it.';
  end if;
  -- And a session that has been ended is ended now, not when its pass expires.
  if not private.my_session_is_live() then
    raise exception 'This sign-in has ended.'
      using errcode = 'PT401',
            hint = 'It was signed out, or its password was changed. Sign in again.';
  end if;
  -- And somebody who set up two-step sign-in has finished both steps.
  if not private.my_second_step_is_done() then
    raise exception 'Two-step sign-in is needed.'
      using errcode = 'PT403',
            hint = 'Enter the six-digit code from your authenticator app to finish signing in.';
  end if;
end;
$$;

-- Restated: replacing a function in `public` takes EXECUTE from the signed-out
-- role (lock_new_functions), and this runs before every request, theirs too.
grant execute on function public.refuse_suspended_requests() to anon, authenticated;

-- As 20260923173000: a suspended account reaches no stored file at all.
drop policy if exists a_suspended_account_sees_nothing on storage.objects;
create policy a_suspended_account_sees_nothing on storage.objects
  as restrictive for all to authenticated
  using ((select private.i_am_not_suspended()))
  with check ((select private.i_am_not_suspended()));

-- Library sharing: as 20260908034003, without the open-case pause.
create or replace function public.library_sharing_status(p_pairing uuid)
returns table(allowed boolean)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    pairing.status = 'active'
      and not coalesce(not permission.sharing_allowed, false)
      and not public.library_blocked(pairing.dm_id)
      and not public.library_blocked(pairing.ds_id)
  from public.pairings as pairing
  left join public.pairing_library_permissions as permission
    on permission.pairing_id = pairing.id
  where pairing.id = p_pairing
    and (
      pairing.dm_id = (select auth.uid())
      or pairing.ds_id = (select auth.uid())
    );
$$;

create or replace function public.why_library_sharing_is_paused(p_pairing uuid)
returns text
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  pair     public.pairings%rowtype;
  guide    public.profiles%rowtype;
  explorer public.profiles%rowtype;
begin
  select * into pair from public.pairings where id = p_pairing;

  -- ONE ANSWER FOR "no such pairing" AND "not one of yours", so the question
  -- cannot be used to discover that a pairing exists.
  if pair.id is null
     or (pair.dm_id <> (select auth.uid()) and pair.ds_id <> (select auth.uid())) then
    return 'That pairing is not one of yours.';
  end if;

  if pair.status <> 'active' then
    return 'That pairing is not active, so nothing can be shared through it.';
  end if;

  select * into guide    from public.profiles where id = pair.dm_id;
  select * into explorer from public.profiles where id = pair.ds_id;

  -- A pairing pointing at somebody who is gone is a refusal, said, rather than
  -- every check below comparing against NULL and falling through to "allowed".
  if guide.id is null or explorer.id is null then
    return 'That pairing is missing somebody.';
  end if;

  if not guide.is_approved or not explorer.is_approved then
    return 'Sharing waits until both people in this pairing are approved.';
  end if;

  if guide.suspended_at is not null or explorer.suspended_at is not null then
    return 'Sharing is off while somebody in this pairing is suspended.';
  end if;

  if guide.church_id is distinct from explorer.church_id then
    return 'Sharing only works between two people in the same church.';
  end if;

  if public.library_blocked(pair.dm_id) or public.library_blocked(pair.ds_id) then
    return 'Sharing the library has been turned off for somebody in this pairing.';
  end if;

  if exists (
    select 1 from public.pairing_library_permissions permission
     where permission.pairing_id = pair.id
       and not permission.sharing_allowed
  ) then
    return 'Library sharing has been turned off for this pairing.';
  end if;

  return null;
end;
$$;

-- Its shape changes (no `court_blocked`), so it is dropped and made again.
-- Nothing in the app calls it; it is the Directors' own view of the switches.
drop function if exists public.library_pairing_controls();
create function public.library_pairing_controls()
returns table(pairing_id uuid, guide_name text, explorer_name text, manually_blocked boolean,
              reason text, updated_at timestamp with time zone)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    pairing.id,
    coalesce(guide.full_name, 'Guide'),
    coalesce(explorer.full_name, 'Explorer'),
    coalesce(not permission.sharing_allowed, false),
    permission.reason,
    permission.updated_at
  from public.profiles as me
  join public.pairings as pairing on pairing.status = 'active'
  join public.profiles as guide on guide.id = pairing.dm_id
  join public.profiles as explorer on explorer.id = pairing.ds_id
  left join public.pairing_library_permissions as permission
    on permission.pairing_id = pairing.id
  where me.id = (select auth.uid())
    and me.is_approved
    and me.suspended_at is null
    and me.role = 'admin'
    and me.church_id = explorer.church_id
    and guide.church_id = explorer.church_id
  order by guide.full_name, explorer.full_name;
$$;

revoke all on function public.library_pairing_controls() from public, anon;
grant execute on function public.library_pairing_controls() to authenticated;

-- church_pulse: as 0029, without `open_trials`. Same drop-and-make for its shape.
drop function if exists public.church_pulse();
create function public.church_pulse()
returns table(church_id uuid, church_name text, directors bigint, guides bigint, explorers bigint,
              awaiting_approval bigint, active_pairings bigint, unpaired_explorers bigint,
              guilds_total bigint, guilds_active bigint, guilds_stagnant bigint,
              suspended_now bigint, removed_ever bigint, open_reports bigint,
              messages_7d bigint, messages_30d bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    c.id, c.name,
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'admin'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'dm'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.role = 'ds'),
    (select count(*) from public.profiles p where p.church_id = c.id and not p.is_approved),
    (select count(*) from public.pairings pr where pr.status = 'active'
       and exists (select 1 from public.profiles p where p.id = pr.ds_id and p.church_id = c.id)),
    (select count(*) from public.profiles p
      where p.church_id = c.id and p.role = 'ds'
        and not exists (select 1 from public.pairings pr
                         where pr.ds_id = p.id and pr.status = 'active')),
    (select count(*) from public.guilds g where g.church_id = c.id),
    (select count(*) from public.guild_metrics() gm where gm.state = 'active'),
    (select count(*) from public.guild_metrics() gm where gm.state = 'stagnant'),
    (select count(*) from public.profiles p where p.church_id = c.id and p.suspended_at is not null),
    (select count(*) from public.discipline_log d where d.church_id = c.id and d.action = 'removed'),
    (select count(*) from public.reports r where r.church_id = c.id and r.status = 'open'),
    (select count(*) from public.messages ms where ms.created_at > now() - interval '7 days'
       and exists (select 1 from public.profiles p where p.id = ms.sender_id and p.church_id = c.id)),
    (select count(*) from public.messages ms where ms.created_at > now() - interval '30 days'
       and exists (select 1 from public.profiles p where p.id = ms.sender_id and p.church_id = c.id))
  from public.churches c
  where public.leads_church(c.id)
  order by c.name;
$$;

revoke all on function public.church_pulse() from public, anon;
grant execute on function public.church_pulse() to authenticated;

-- ------------------------------------------------- what the court room ran --

-- The minute-by-minute sweep of leave to answer. By its id rather than its
-- name: pg_cron finds a job by name only among the current role's own, so a
-- name would miss when this is run by a role other than the one that made it.
do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname = 'court-leave-runs-out' loop
    perform cron.unschedule(j);
  end loop;
end $$;

-- An account that is deleted no longer writes its name into the court's book.
drop trigger if exists court_remembers_the_departed on public.profiles;

-- The rules on exhibit files.
drop policy if exists court_exhibit_read on storage.objects;
drop policy if exists court_exhibit_upload on storage.objects;

-- The door's e-mail codes, passes and send log: short-lived, never a record.
drop table if exists private.court_email_codes;
drop table if exists private.court_email_passes;
drop table if exists private.court_email_sends;
-- Who was in the room, kept only while in session (20261020210000).
drop table if exists public.court_presence;
-- The door's setting.
delete from public.app_settings where key = 'COURT_DOOR_METHOD';

-- ---------------------------------------------------------- the record itself --

do $$
declare
  t        text;
  p        record;
  record_n bigint := 0;
  -- Every table that is the court's record, in an order that drops cleanly.
  tables   text[] := array['court_record', 'court_exhibits', 'court_leave', 'court_departed',
                           'trial_statements', 'trial_parties', 'trials'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) + %s from public.%I', record_n, t) into record_n;
    end if;
  end loop;

  -- Off the wire first: realtime carried trials and their statements.
  foreach t in array array['trials', 'trial_parties', 'trial_statements'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;

  -- Their rules and triggers name the court's functions, which go below.
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public' and tablename = any (tables)
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  drop trigger if exists court_statement_recorded on public.trial_statements;
  drop trigger if exists court_statement_stamp on public.trial_statements;
  drop trigger if exists court_trial_keeps_role on public.trials;

  if record_n = 0 then
    foreach t in array tables loop
      execute format('drop table if exists public.%I', t);
    end loop;
    -- An empty bucket goes too. Storage may refuse a delete made in SQL; then
    -- it stays, empty and with no rule that lets anybody into it.
    begin
      delete from storage.buckets b
       where b.id = 'court-exhibits'
         and not exists (select 1 from storage.objects o where o.bucket_id = 'court-exhibits');
    exception when others then
      raise notice 'The empty court-exhibits bucket was left in place (%). Delete it in the dashboard if you like.', sqlerrm;
    end;
  else
    create schema if not exists court_archive;
    comment on schema court_archive is
      'The court room''s record from before 27 October 2026, kept as it was. Nothing in the app reads it; no app role can reach it.';
    foreach t in array tables loop
      if to_regclass('public.' || t) is not null then
        execute format('alter table public.%I set schema court_archive', t);
      end if;
    end loop;
    revoke all on schema court_archive from public, anon, authenticated;
    revoke all on all tables in schema court_archive from public, anon, authenticated;
    raise notice 'The court room held % row(s); they are kept in the court_archive schema.', record_n;
  end if;
end $$;

-- ------------------------------------------------------- the court's functions --

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname = any (array[
         -- 0024_trial_court
         'call_head_judge', 'close_trial', 'in_trial', 'my_trials', 'open_trial', 'take_head_judge',
         -- 20261020160000_the_court_room
         'court_append', 'court_door_open', 'court_enter_exhibit', 'court_file_awaited',
         'court_file_readable', 'court_in_the_room', 'court_letter', 'court_may_present',
         'court_may_see_exhibit', 'court_on_the_bench', 'court_pass_minutes', 'court_pass_until',
         'court_place', 'court_require_door', 'court_sha256', 'court_statement_recorded',
         'court_statement_stamp', 'court_case', 'court_cases', 'court_check_record', 'court_door',
         'court_exhibit_begin', 'court_exhibit_handled', 'court_exhibit_seal', 'court_exhibit_write',
         'court_exported', 'court_gallery', 'court_record_for', 'court_say', 'court_summon',
         'join_trial', 'trials_i_may_sit_on',
         -- 20261020180000_leave_to_answer_and_a_record_that_outlives_the_account
         'court_answering', 'court_close_leave', 'court_exhibit_room', 'court_leave_case',
         'court_leave_ends', 'court_leave_sweep', 'court_remembers_the_departed',
         'court_trial_keeps_role', 'may_sit_on_trial', 'court_end_leave', 'court_grant_leave',
         -- 20261020200000_a_judge_is_drawn_and_the_church_board_rules
         'court_draw_judge', 'court_is_here', 'court_judge_pool', 'court_close_hearing',
         'court_here', 'court_record_ruling', 'court_step_down',
         -- 20261021100000_the_court_room_door_by_email
         'court_door_method', 'court_email_code_hash', 'court_email_code_issue',
         'court_email_code_prove'
       ])
  loop
    execute format('drop function %s', f);
  end loop;
end $$;

commit;
