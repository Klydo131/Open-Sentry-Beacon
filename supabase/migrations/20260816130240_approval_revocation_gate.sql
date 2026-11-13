-- Disapproval is a reversible access suspension, not merely a UI flag.
-- A suspended account may read and edit its own profile so the app can explain
-- what happened, but it cannot exercise leadership, use a pairing, read or
-- send messages, or read/write journey history through the Data API.

begin;

create or replace function public.is_approved_user()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_approved
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_approved
  );
$$;

create or replace function public.is_executive()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'executive' and is_approved
  );
$$;

create or replace function public.is_head_executive()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'executive'
      and is_head_executive
      and is_approved
  );
$$;

create or replace function public.oversees_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_executive() and exists (
    select 1 from public.church_executives
    where church_id = c and executive_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_church(c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select (public.is_approved_user() and public.my_church_id() = c)
    or public.oversees_church(c);
$$;

create or replace function public.is_paired_with(other uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_approved_user() and exists (
    select 1 from public.pairings
    where status = 'active'
      and ((dm_id = (select auth.uid()) and ds_id = other)
        or (ds_id = (select auth.uid()) and dm_id = other))
  );
$$;

create or replace function public.in_pairing(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_approved_user() and exists (
    select 1 from public.pairings
    where id = p and (dm_id = (select auth.uid()) or ds_id = (select auth.uid()))
  );
$$;

drop policy if exists pairings_read on public.pairings;
create policy pairings_read on public.pairings
  for select to authenticated
  using (
    (public.is_approved_user()
      and (dm_id = (select auth.uid()) or ds_id = (select auth.uid())))
    or public.manages_church(public.church_of(ds_id))
  );

drop policy if exists pairings_update on public.pairings;
create policy pairings_update on public.pairings
  for update to authenticated
  using (
    (public.is_approved_user() and dm_id = (select auth.uid()))
    or public.manages_church(public.church_of(ds_id))
  )
  with check (
    (public.is_approved_user() and dm_id = (select auth.uid()))
    or public.manages_church(public.church_of(ds_id))
  );

drop policy if exists journey_read on public.journey_events;
create policy journey_read on public.journey_events
  for select to authenticated
  using (
    exists (
      select 1 from public.pairings p
      where p.id = pairing_id
        and ((public.is_approved_user() and p.dm_id = (select auth.uid()))
          or public.manages_church(public.church_of(p.ds_id)))
    )
  );

drop policy if exists journey_write on public.journey_events;
create policy journey_write on public.journey_events
  for insert to authenticated
  with check (
    public.is_approved_user() and exists (
      select 1 from public.pairings p
      where p.id = pairing_id and p.dm_id = (select auth.uid())
    )
  );

revoke all on function public.is_approved_user() from public, anon;
grant execute on function public.is_approved_user() to authenticated;

commit;
