-- A suspension takes effect on the next request, not at the next sign-in.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG, PROVEN RATHER THAN ARGUED. 0026 deletes a suspended person's
-- sessions and refresh tokens and says that puts somebody already signed in
-- "out immediately instead of at token expiry". It does not. The data API
-- checks an access token's signature and its expiry and nothing else -- it
-- never looks at auth.sessions -- so a token issued before the suspension keeps
-- working until it lapses, an hour by default.
--
-- And for that hour nothing downstream noticed, because "approved" never meant
-- "approved and not suspended". Checked against the live database on
-- 23 September 2026, in a transaction that was discarded, with a Director
-- marked suspended:
--
--     is_admin()                    true    before and while suspended
--     is_approved_user()            true    before and while suspended
--     discipline_check(an Explorer) 'ok'    before and while suspended
--
-- So a suspended Director could go on suspending and removing people until the
-- token ran out. Thirty-eight functions and three policies asked "approved?"
-- without asking "suspended?". Five already asked both, which is how this was
-- noticed as an omission rather than a design.
--
-- WHAT THIS DOES, IN THREE LAYERS, because the three ways into the database do
-- not share one door:
--
--   1. THE DATA API, every table and every function, through one check that
--      PostgREST runs before each request (`db_pre_request`). A suspended
--      account is refused before anything else is evaluated. One primary-key
--      lookup per request, which is all it costs.
--
--   2. REALTIME AND STORAGE do not go through that door: they evaluate row
--      security directly. So the five helper functions most policies are built
--      on learn the same rule, and the three policies that checked approval
--      inline are rebuilt with it. That covers a suspended leader's open
--      websocket, which would otherwise keep delivering safeguarding report
--      files, and the storage paths guarded by manages_church.
--
--   3. discipline_check, the gate for suspend / remove / restore, says so in its
--      own words too, so the rule does not depend on the other two layers being
--      in place when somebody reads this function alone.
--
-- Nothing changes for anybody who is not suspended: every added clause is
-- `suspended_at is null`, which is true of every profile in the database today.
--
-- ALSO, WHILE HERE -- defence in depth found in the same audit:
--   * Every function in `private` was executable by PUBLIC, which includes the
--     anonymous role. Unreachable today (anon has no USAGE on `private`), but
--     one careless grant away from not being. Revoked from PUBLIC; granted to
--     the roles that use them, so nothing that works now stops working.
--   * private.a_private_copy_is_never_published had no fixed search_path (the
--     one "function search path mutable" advisor warning).
--   * private.church_fingerprint_salt had row security off. Nobody but its
--     owner can reach it; now nobody else could even if granted.
-- ---------------------------------------------------------------------------

begin;

-- 1 ------------------------------------------------------------------------
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
end;
$$;

revoke all on function public.refuse_suspended_requests() from public;
grant execute on function public.refuse_suspended_requests() to anon, authenticated, service_role;

-- PostgREST reads its settings from the authenticator role. Guarded, so a
-- database without that role (a fresh local one, another host) still applies.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.refuse_suspended_requests''';
  end if;
end $$;

-- 2 ------------------------------------------------------------------------
create or replace function public.is_approved_user()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_approved and suspended_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_approved and suspended_at is null
  );
$$;

create or replace function public.is_executive()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'executive' and is_approved and suspended_at is null
  );
$$;

create or replace function public.is_head_executive()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'executive'
      and is_head_executive
      and is_approved
      and suspended_at is null
  );
$$;

create or replace function public.leads_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.is_approved
      and me.suspended_at is null
      and me.role in ('admin', 'executive')
      and (me.church_id = c
           or exists (select 1 from public.church_executives ce
                      where ce.executive_id = me.id and ce.church_id = c))
  );
$$;

drop policy if exists guilds_read on public.guilds;
create policy guilds_read on public.guilds for select to authenticated using (
  exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.is_approved and me.suspended_at is null
      and (me.church_id = guilds.church_id
           or exists (select 1 from public.church_executives ce
                      where ce.executive_id = me.id and ce.church_id = guilds.church_id))
  )
);

drop policy if exists guild_members_read on public.guild_members;
create policy guild_members_read on public.guild_members for select to authenticated using (
  person_id = (select auth.uid())
  or exists (
    select 1 from public.profiles me join public.guilds g on g.id = guild_members.guild_id
    where me.id = (select auth.uid()) and me.is_approved and me.suspended_at is null
      and me.role = any (array['admin'::public.user_role, 'executive'::public.user_role, 'dm'::public.user_role])
      and (me.church_id = g.church_id
           or exists (select 1 from public.church_executives ce
                      where ce.executive_id = me.id and ce.church_id = g.church_id))
  )
);

drop policy if exists report_files_read on public.report_files;
create policy report_files_read on public.report_files for select to authenticated using (
  exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.is_approved and me.suspended_at is null
      and me.role = any (array['admin'::public.user_role, 'executive'::public.user_role])
      and me.church_id = report_files.church_id
  )
);

-- 3 ------------------------------------------------------------------------
create or replace function public.discipline_check(p_target uuid)
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  me     public.profiles%rowtype;
  target public.profiles%rowtype;
  reach  boolean;
begin
  select * into me     from public.profiles where id = (select auth.uid());
  select * into target from public.profiles where id = p_target;

  -- A SUSPENDED LEADER IS NOT A LEADER. See the header: this returned 'ok' to a
  -- suspended Director for as long as their token lived.
  if me.id is null or not me.is_approved or me.suspended_at is not null then
    return 'Your account cannot do this.';
  end if;
  if target.id is null then return 'That person is not here.'; end if;
  if me.id = target.id then return 'You cannot do this to yourself.'; end if;

  if target.is_head_executive then
    return 'The Head Executive Director cannot be suspended or removed from inside the app.';
  end if;

  if me.role = 'executive' then
    reach := (me.church_id is not null and me.church_id = target.church_id)
             or exists (select 1 from public.church_executives ce
                        where ce.executive_id = me.id
                          and ce.church_id = target.church_id);
    if not reach then return 'That person is not in a church you oversee.'; end if;
    return 'ok';
  end if;

  if me.role = 'admin' then
    if me.church_id is distinct from target.church_id then
      return 'That person is not in your church.';
    end if;
    if target.role in ('dm', 'ds') then return 'ok'; end if;
    return 'A Director may only suspend or remove Guides and Explorers.';
  end if;

  return 'Only a Director or Executive Director can do this.';
end;
$$;

-- Defence in depth ---------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- New private functions should not come back executable by everybody.
alter default privileges in schema private revoke execute on functions from public;

alter function private.a_private_copy_is_never_published() set search_path = '';

alter table private.church_fingerprint_salt enable row level security;

commit;

-- Tell the data API to pick up the pre-request setting now rather than on its
-- next restart. Outside the transaction: a notification is only sent on commit.
notify pgrst, 'reload config';
