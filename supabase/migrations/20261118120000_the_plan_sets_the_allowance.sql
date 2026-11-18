-- The plan a church pays for sets what each person may keep, and leaders can
-- see how full the church is.
--
-- ---------------------------------------------------------------------------
-- WHY. Asked for on 18 November 2026: a local church on Supabase's FREE plan
-- must be able to run Hope Beacon well and at no cost, and a church that PAYS
-- for a bigger plan must get the room it pays for, without a code change.
--
-- Until now every allowance was written for the free plan only (500 MB of
-- database and 1 GB of files for the whole church), and a paying church had to
-- write a migration of its own to change two numbers in two functions. And
-- nobody inside the app could see how close the church was to either limit:
-- they found out when an upload was refused, or from Supabase's e-mail.
--
-- WHAT THIS DOES, with the same kind of switch giving uses (20261026200000):
-- one row in public.app_settings, which only the server can read or write.
--
--     HOSTING_PLAN = 'paid'                  a Supabase plan bigger than Free
--     anything else, or no row at all        the free plan, the safe default
--
-- Say the church pays, as the owner of the project, in the SQL editor:
--
--     insert into public.app_settings (key, value) values ('HOSTING_PLAN', 'paid')
--     on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- Delete the row to go back to the free allowances. Nothing stored is
-- removed either way: a smaller allowance only refuses the NEXT upload of
-- somebody already past it.
--
--                         FREE (default)         PAID
--   Resources + handouts  300 files, 200 MB      3,000 files, 2 GB    per person
--   Post photos + clips   40 files, 200 MB       400 files, 2 GB      per person
--   The project, shown    500 MB data, 1 GB      8 GB data, 100 GB    whole church
--                         files                  files
--
-- The size of any ONE file does not change: 10 MB for a resource, 50 MB for a
-- clip. Those are what keep a single view cheap, on any plan.
--
-- THE READ-OUT, public.church_space(), is for the church's leaders (Admins
-- and Executive Directors) only. It returns totals and nothing else: how big
-- the database is, how many bytes of files are kept, the plan, and that
-- plan's limits. Never a file, a name or who stored what.
-- ---------------------------------------------------------------------------

begin;

/** Whether this project says it is on a paid Supabase plan (HOSTING_PLAN = 'paid'). */
create or replace function private.on_a_paid_plan()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(coalesce(
           (select s.value from public.app_settings s where s.key = 'HOSTING_PLAN'), '')))
         = 'paid';
$$;
-- Asked only by the definer functions below, which run as their owner. Nobody
-- signed in needs to ask it directly.
revoke all on function private.on_a_paid_plan() from public, anon, authenticated;
grant execute on function private.on_a_paid_plan() to service_role;

-- What one person may keep in their own resources and handouts
-- (20260925120000). Same question, the plan's numbers.
create or replace function private.room_to_upload(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*) < (case when private.on_a_paid_plan() then 3000 else 300 end)
     and coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
         < (case when private.on_a_paid_plan() then 2048 else 200 end)::bigint * 1024 * 1024
    from storage.objects o
   where o.bucket_id = 'pairing-media'
     and (o.name like 'library/' || p_uid::text || '/%'
          or o.name like 'lessons/' || p_uid::text || '/%');
$function$;
revoke all on function private.room_to_upload(uuid) from public, anon;
grant execute on function private.room_to_upload(uuid) to authenticated, service_role;

-- What one person may keep in photos and clips on posts and notices
-- (20261007160000). Same question, the plan's numbers.
create or replace function private.room_for_post_media(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*) < (case when private.on_a_paid_plan() then 400 else 40 end)
     and coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
         < (case when private.on_a_paid_plan() then 2048 else 200 end)::bigint * 1024 * 1024
    from storage.objects o
   where o.bucket_id = 'post-media'
     and o.owner = p_uid;
$function$;
revoke all on function private.room_for_post_media(uuid) from public, anon;
grant execute on function private.room_for_post_media(uuid) to authenticated, service_role;

/**
 * How full the church is, for its leaders. Totals only. Refused to anybody
 * who does not manage their church.
 */
create or replace function public.church_space()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_church uuid := public.my_church_id();
  v_paid boolean := private.on_a_paid_plan();
begin
  if v_church is null or not public.manages_church(v_church) then
    raise exception 'Only the church''s leaders can see this.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'plan', case when v_paid then 'paid' else 'free' end,
    'database_bytes', pg_database_size(current_database()),
    'file_bytes', coalesce((
      select sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$'
                      then (o.metadata ->> 'size')::bigint else 0 end)
        from storage.objects o), 0),
    'database_limit', case when v_paid then 8::bigint * 1024 * 1024 * 1024 else 500::bigint * 1024 * 1024 end,
    'file_limit', case when v_paid then 100::bigint * 1024 * 1024 * 1024 else 1024::bigint * 1024 * 1024 end,
    'person_limit', case when v_paid then 2048::bigint * 1024 * 1024 else 200::bigint * 1024 * 1024 end
  );
end;
$function$;
revoke all on function public.church_space() from public, anon;
grant execute on function public.church_space() to authenticated, service_role;

commit;
