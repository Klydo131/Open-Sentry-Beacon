-- Is this project ready for real members?
--
-- ---------------------------------------------------------------------------
-- RUN IT in the SQL editor of the project real members will use, after
-- docs/GOING-LIVE.md steps 1 to 8, and again before every gate. It prints one
-- line per check: READY, NOT YET, or INFO, and what to do about anything that
-- is not ready.
--
-- WHY. Hope Beacon's first service was a trial run with test information, and
-- every problem below was found on it by hand, one at a time: a nightly job
-- that could not run because the Vault was empty, a 30-day promise kept only
-- when somebody shared a link, consent asked at one door of two, sample
-- addresses mixed in with people. This asks all of those questions at once.
--
-- IT ONLY READS. It counts rows and reads the NAMES of scheduled jobs and Vault
-- entries. It never shows a member's details and never a secret's value, so its
-- output can be pasted into a go-live record. The one thing it creates is a
-- function in pg_temp, which belongs to this session and disappears with it.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.readiness()
returns table (n int, item text, seen text, status text, what_to_do text)
language plpgsql
as $$
declare
  v  bigint;
  v2 bigint;
  t  text;
begin
  -- 1. Every table checks who is asking.
  select count(*) into v from pg_tables where schemaname = 'public' and not rowsecurity;
  n := 1; item := 'Row-level security on every table';
  seen := v || ' table(s) without it';
  status := case when v = 0 then 'READY' else 'NOT YET' end;
  what_to_do := case when v = 0 then '' else 'Build the database only from the repository (npx supabase db push). Never add a table by hand.' end;
  return next;

  -- 2 to 4. The scheduled jobs that keep the privacy notice's promises.
  if to_regclass('cron.job') is null then
    n := 2; item := 'Scheduled jobs'; seen := 'pg_cron is not switched on';
    status := 'NOT YET'; what_to_do := 'Run every database change: they switch it on and schedule each job.';
    return next;
  else
    for n, item, t in values
      (2, 'Job: invitation passwords run out (hourly)', 'invitation-passwords-run-out'),
      (3, 'Job: shared-link record kept 30 days (daily)', 'link-record-runs-out'),
      (4, 'Job: files of deleted records removed (daily)', 'erase-deleted-files')
    loop
      -- pg_cron marks a paused job inactive; a stand-in without the column has none.
      execute 'select count(*) from cron.job where jobname = $1'
           || case when exists (select 1 from information_schema.columns
                                 where table_schema = 'cron' and table_name = 'job' and column_name = 'active')
                   then ' and active' else '' end
        into v using t;
      seen := case when v > 0 then 'scheduled' else 'missing' end;
      status := case when v > 0 then 'READY' else 'NOT YET' end;
      what_to_do := case when v > 0 then '' else 'Apply the newest database changes (npx supabase db push).' end;
      return next;
    end loop;
  end if;

  -- 5 and 6. The Vault entries the nightly file removal needs. Names only.
  if to_regclass('vault.secrets') is null then
    n := 5; item := 'Vault'; seen := 'not available';
    status := 'NOT YET'; what_to_do := 'Supabase projects have a Vault; check that this is the right project.';
    return next;
  else
    execute 'select count(*) from vault.secrets where name = $1' into v using 'notify_service_key';
    n := 5; item := 'Vault: key for the nightly jobs (notify_service_key)';
    seen := case when v > 0 then 'present' else 'missing' end;
    status := case when v > 0 then 'READY' else 'NOT YET' end;
    what_to_do := case when v > 0 then '' else 'Add it in the SQL editor: docs/START-HERE.md Part 3, Step 6, item 5.' end;
    return next;

    execute 'select count(*) from vault.secrets where name = any($1)' into v using array['erase_function_url', 'notify_function_url'];
    n := 6; item := 'Vault: where the erase function lives';
    seen := case when v > 0 then 'present' else 'missing' end;
    status := case when v > 0 then 'READY' else 'NOT YET' end;
    what_to_do := case when v > 0 then '' else 'Add notify_function_url (or erase_function_url), and deploy the erase function.' end;
    return next;
  end if;

  -- 7. The erase list is being emptied, not just filled.
  if to_regclass('private.files_to_erase') is not null then
    execute 'select count(*) from private.files_to_erase where queued_at < now() - interval ''2 days''' into v;
    n := 7; item := 'Files of deleted records waiting more than 2 days';
    seen := v::text;
    status := case when v = 0 then 'READY' else 'NOT YET' end;
    what_to_do := case when v = 0 then '' else 'The nightly removal is not running: check checks 4 to 6, and that the erase function is deployed.' end;
    return next;
  else
    n := 7; item := 'Erase list for files of deleted records'; seen := 'not installed';
    status := 'NOT YET'; what_to_do := 'Apply the newest database changes.';
    return next;
  end if;

  -- 8. The 30-day link record holds nothing older.
  if to_regclass('public.library_activity') is not null then
    execute 'select count(*) from public.library_activity where occurred_at < now() - interval ''31 days''' into v;
    n := 8; item := 'Shared-link entries older than 30 days';
    seen := v::text;
    status := case when v = 0 then 'READY' else 'NOT YET' end;
    what_to_do := case when v = 0 then '' else 'Check job 3 is scheduled; it removes these daily.' end;
    return next;
  end if;

  -- 9. Sample people never share a database with real ones.
  select count(*) into v from auth.users
   where lower(email) ~ '@(example\.(test|com|org|net)|[^@]*\.example)$';
  n := 9; item := 'Sample or test addresses (example.test and the like)';
  seen := v::text;
  status := case when v = 0 then 'READY' else 'NOT YET' end;
  what_to_do := case when v = 0 then '' else 'This project holds sample people. Never run the demonstration file on production; start a clean project.' end;
  return next;

  -- 10. Invitation passwords do not outlive their three days.
  if to_regclass('public.temporary_passwords') is not null then
    execute 'select count(*) from public.temporary_passwords where expires_at <= now()' into v;
    n := 10; item := 'Expired invitation passwords still active';
    seen := v::text;
    status := case when v = 0 then 'READY' else 'NOT YET' end;
    what_to_do := case when v = 0 then '' else 'Check job 2 is scheduled and active.' end;
    return next;
  end if;

  -- 11. Somebody holds the first seat.
  select count(*) into v from public.profiles where role = 'executive' and is_approved;
  n := 11; item := 'Approved Executive Directors';
  seen := v::text;
  status := case when v > 0 then 'READY' else 'NOT YET' end;
  what_to_do := case when v > 0 then '' else 'Create the first one: supabase/seed/01_make_me_the_first_director.sql.' end;
  return next;

  -- 12. Consent: counted, never listed.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'consent_at') then
    select count(*), count(*) filter (where consent_at is null) into v, v2 from public.profiles;
    n := 12; item := 'Accounts without consent on record';
    seen := v2 || ' of ' || v;
    status := case when v2 = 0 then 'READY' else 'INFO' end;
    what_to_do := case when v2 = 0 then '' else 'Each is asked at their next sign-in. A number that does not fall within two weeks needs looking into.' end;
    return next;
  end if;

  -- 13. Two-step sign-in for leaders.
  if to_regclass('auth.mfa_factors') is not null then
    execute $q$
      select count(*),
             count(*) filter (where exists (select 1 from auth.mfa_factors f
                                             where f.user_id = p.id and f.status = 'verified'))
        from public.profiles p
       where p.role in ('admin', 'executive') and p.is_approved$q$
      into v, v2;
    n := 13; item := 'Leaders using two-step sign-in';
    seen := v2 || ' of ' || v;
    status := case when v > 0 and v2 = v then 'READY' else 'NOT YET' end;
    what_to_do := case when v > 0 and v2 = v then '' else 'Each leader turns it on in Settings, Password, Two-step sign-in. Console administrators also turn it on in GitHub, Supabase, Vercel and the e-mail service.' end;
    return next;
  end if;

  -- 14. Which database changes this project has.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into t;
    n := 14; item := 'Newest database change applied';
    seen := coalesce(t, 'none recorded');
    status := 'INFO';
    what_to_do := 'Compare with the newest file in supabase/migrations. Different means a change is waiting.';
    return next;
  end if;
end;
$$;

select n as "#", item as "Check", seen as "Found", status as "Status", what_to_do as "What to do"
  from pg_temp.readiness()
 order by n;
