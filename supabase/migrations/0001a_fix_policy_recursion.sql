-- Stop profiles and pairings re-entering each other's policies.
--
-- WHY THIS FILE EXISTS SEPARATELY. It was applied to the reference database and
-- never written down. A fresh install from this repository therefore got the
-- policies from 0001 and not this correction — which means every install but
-- the first one would have hit `infinite recursion detected in policy for
-- relation "pairings"`, and every journey and pairing read would have failed
-- outright. Recovered from the applied migration history and committed here so
-- the repository can actually build the database it describes.
--
-- THE BUG. A policy on `profiles` asked. by
-- querying `pairings`; the policy on `pairings` asked. by querying `profiles`. Each read
-- re-enters the other's policy, Postgres refuses the whole query, and both
-- screens die together.
--
-- THE FIX. Two SECURITY DEFINER helpers cross that boundary once, without
-- re-entering anything. Every later migration in this repository uses the same
-- shape for the same reason.

-- Two helpers that read across the profiles<->pairings boundary WITHOUT
-- re-entering the other table's policies.
create or replace function public.church_of(p uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select church_id from public.profiles where id = p;
$$;

create or replace function public.is_paired_with(other uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.pairings
    where status = 'active'
      and ((dm_id = (select auth.uid()) and ds_id = other)
        or (ds_id = (select auth.uid()) and dm_id = other))
  );
$$;

drop policy if exists profiles_read_paired on public.profiles;
create policy profiles_read_paired on public.profiles
  for select to authenticated using (public.is_paired_with(id));

drop policy if exists pairings_read on public.pairings;
drop policy if exists pairings_write on public.pairings;
drop policy if exists pairings_update on public.pairings;
create policy pairings_read on public.pairings for select to authenticated
  using (dm_id = (select auth.uid()) or ds_id = (select auth.uid())
         or public.manages_church(public.church_of(ds_id)));
create policy pairings_write on public.pairings for insert to authenticated
  with check (public.manages_church(public.church_of(ds_id)));
create policy pairings_update on public.pairings for update to authenticated
  using (dm_id = (select auth.uid()) or public.manages_church(public.church_of(ds_id)))
  with check (dm_id = (select auth.uid()) or public.manages_church(public.church_of(ds_id)));

drop policy if exists journey_read on public.journey_events;
drop policy if exists journey_write on public.journey_events;
create policy journey_read on public.journey_events for select to authenticated
  using (exists (select 1 from public.pairings p
                 where p.id = pairing_id
                   and (p.dm_id = (select auth.uid())
                        or public.manages_church(public.church_of(p.ds_id)))));
create policy journey_write on public.journey_events for insert to authenticated
  with check (exists (select 1 from public.pairings p
                      where p.id = pairing_id and p.dm_id = (select auth.uid())));
