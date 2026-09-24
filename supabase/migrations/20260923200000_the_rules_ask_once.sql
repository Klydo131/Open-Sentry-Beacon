-- The read rules ask "who am I?" once per request, not once per row.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS SLOW, MEASURED ON THE LIVE DATABASE ON 23 SEPTEMBER 2026.
-- pg_stat_statements put reads of `profiles` at the top of the whole app: about
-- 94 ms on average across 13,500 requests, some over 700 ms -- for a table of
-- 43 rows. `pairings` averaged 45 ms. Timed warm, server side, as a Director, a
-- Guide and an Explorer:
--
--     profiles   23-30 ms     messages   14 ms (even with nothing to see)
--     materials  12-22 ms     pairings    8-10 ms
--     notifications 0.4 ms -- the one rule that simply compares a column
--
-- THE CAUSE. Every one of the slow rules calls a SECURITY DEFINER helper with
-- the row's own column -- manages_church(church_id), is_paired_with(id),
-- in_pairing(pairing_id) -- and those helpers call more helpers. Such a function
-- cannot be inlined, so Postgres runs it once for EVERY row it looks at, and a
-- request for "the people I may see" became hundreds of function calls. The
-- messages rule looked at every message in the database, one at a time, to
-- find a person's four: a chat got slower with every message anybody sent.
--
-- THE CHANGE. The answer to "which churches do I run, which pairings am I in,
-- who do I walk with" depends on who is asking, not on the row. So it is now
-- asked once per request, as a set, and each row is checked against the set
-- with a hash lookup (`x in (select private.set())` is planned as one hashed
-- subquery). Nothing about WHO may see WHAT changes: every set is defined as
-- exactly the rows for which the old helper said yes, and the proof below was
-- run against every account in the live database.
--
-- WHY SOME RULES STILL READ THEIR OWN COLUMNS. The app inserts into pairings
-- and materials and asks for the new row back in the same statement. A rule
-- that looked the new row up by id could not see it yet, and the read-back
-- would fail. So pairings_read and materials_read keep their row-column arms
-- (dm_id, ds_id, added_by, is_published, church_id) and only the "who am I"
-- half becomes a set.
--
-- PROVEN, in a transaction that was discarded: for EACH of the 43 accounts in
-- the live database, the rows visible in every table touched here were
-- fingerprinted before and after this ran. Identical for all 43.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

-- The pairings the caller is in, while approved -- exactly in_pairing()'s yes.
create or replace function private.my_pairing_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.pairings p
   where (p.dm_id = (select auth.uid()) or p.ds_id = (select auth.uid()))
     and (select public.is_approved_user());
$$;

-- The people the caller walks with in an active pairing, while approved --
-- exactly is_paired_with()'s yes.
create or replace function private.people_i_walk_with()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.ds_id from public.pairings p
   where p.status = 'active' and p.dm_id = (select auth.uid())
     and (select public.is_approved_user())
  union
  select p.dm_id from public.pairings p
   where p.status = 'active' and p.ds_id = (select auth.uid())
     and (select public.is_approved_user());
$$;

-- The churches manages_church() says yes to, asked once per church.
create or replace function private.churches_i_manage()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select c.id from public.churches c where public.manages_church(c.id);
$$;

-- Everybody in those churches: manages_church(church_of(person)) as a set.
create or replace function private.people_in_churches_i_manage()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select pr.id from public.profiles pr
   where pr.church_id in (select private.churches_i_manage());
$$;

-- Materials shared into a pairing the caller is in -- the share arm of
-- can_read_material().
create or replace function private.materials_shared_with_me()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.material_id from public.material_shares s
   where s.pairing_id in (select private.my_pairing_ids());
$$;

do $$
declare f text;
begin
  foreach f in array array['my_pairing_ids', 'people_i_walk_with', 'churches_i_manage',
                           'people_in_churches_i_manage', 'materials_shared_with_me'] loop
    execute format('revoke all on function private.%I() from public, anon', f);
    execute format('grant execute on function private.%I() to authenticated, service_role', f);
  end loop;
end $$;

-- PEOPLE ------------------------------------------------------------------
drop policy if exists profiles_read_church on public.profiles;
create policy profiles_read_church on public.profiles
  for select to authenticated
  using (church_id in (select private.churches_i_manage()));

drop policy if exists profiles_read_paired on public.profiles;
create policy profiles_read_paired on public.profiles
  for select to authenticated
  using (id in (select private.people_i_walk_with()));

-- PAIRINGS: the row's own columns first, so a new pairing can be read back.
drop policy if exists pairings_read on public.pairings;
create policy pairings_read on public.pairings
  for select to authenticated
  using (
    ((select public.is_approved_user())
      and (dm_id = (select auth.uid()) or ds_id = (select auth.uid())))
    or ds_id in (select private.people_in_churches_i_manage())
  );

-- CONVERSATIONS, MEETINGS, SHARED FILES AND LESSONS INSIDE A PAIRING -------
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

drop policy if exists pairing_media_read on public.pairing_media;
create policy pairing_media_read on public.pairing_media
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

drop policy if exists la_read on public.lesson_assignments;
create policy la_read on public.lesson_assignments
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

-- THE LIBRARY ---------------------------------------------------------------
drop policy if exists shares_read on public.material_shares;
create policy shares_read on public.material_shares
  for select to authenticated
  using (pairing_id in (select private.my_pairing_ids()));

-- The author arm stays first and reads the row, so an insert can ask for its
-- own row back. The other two arms are can_read_material(id) written out: the
-- church's published shelf for leaders and Guides, and anything shared into a
-- pairing the reader is in.
drop policy if exists materials_read on public.materials;
create policy materials_read on public.materials
  for select to authenticated
  using (
    added_by = (select auth.uid())
    or (is_published
        and church_id = (select public.my_church_id())
        and (select public.auth_role()) in ('dm', 'admin', 'executive'))
    or id in (select private.materials_shared_with_me())
  );

-- PRAYER ------------------------------------------------------------------
drop policy if exists prayer_read on public.prayer_requests;
create policy prayer_read on public.prayer_requests
  for select to authenticated
  using (ds_id = (select auth.uid()) or ds_id in (select private.people_i_walk_with()));

commit;
