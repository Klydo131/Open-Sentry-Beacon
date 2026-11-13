-- The browser receives only the table operations the live core actually uses.
-- RLS still decides which rows each signed-in person may reach.
--
-- Supabase projects created after the Data API default changed do not
-- automatically grant authenticated access to new public tables. RLS without
-- these grants is safe but unusable: every legitimate request is denied before
-- the policy is evaluated.

begin;

revoke all on table public.churches from anon;
revoke all on table public.church_executives from anon;
revoke all on table public.profiles from anon;
revoke all on table public.pairings from anon;
revoke all on table public.messages from anon;
revoke all on table public.journey_events from anon;
revoke all on table public.invites from anon;

grant select, update on table public.churches to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.pairings to authenticated;
grant select, insert, update on table public.messages to authenticated;
grant select, insert on table public.journey_events to authenticated;

-- These helpers exist for RLS. Anonymous callers need none of them. Signed-in
-- callers need EXECUTE because their policies call the functions internally;
-- each answer is scoped to auth.uid().
revoke all on function public.auth_role() from public, anon;
revoke all on function public.my_church_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_executive() from public, anon;
revoke all on function public.is_head_executive() from public, anon;
revoke all on function public.oversees_church(uuid) from public, anon;
revoke all on function public.manages_church(uuid) from public, anon;
revoke all on function public.can_access_church(uuid) from public, anon;
revoke all on function public.church_of(uuid) from public, anon;
revoke all on function public.is_paired_with(uuid) from public, anon;
revoke all on function public.in_pairing(uuid) from public, anon;

grant execute on function public.auth_role() to authenticated;
grant execute on function public.my_church_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_executive() to authenticated;
grant execute on function public.is_head_executive() to authenticated;
grant execute on function public.oversees_church(uuid) to authenticated;
grant execute on function public.manages_church(uuid) to authenticated;
grant execute on function public.can_access_church(uuid) to authenticated;
grant execute on function public.church_of(uuid) to authenticated;
grant execute on function public.is_paired_with(uuid) to authenticated;
grant execute on function public.in_pairing(uuid) to authenticated;

-- Trigger functions are never RPC endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.lock_privileged_profile_columns() from public, anon, authenticated;
revoke all on function public.validate_invite_privilege() from public, anon, authenticated;
revoke all on function public.pair_recommended_explorer_after_approval() from public, anon, authenticated;

-- The live conversation subscribes to new messages. Add the table once; a
-- repeated migration must not fail because it is already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

create index if not exists church_executives_executive_idx
  on public.church_executives (executive_id);
create index if not exists invites_invited_by_idx
  on public.invites (invited_by);
create index if not exists invites_recommended_by_idx
  on public.invites (recommended_by);
create index if not exists profiles_recommended_by_idx
  on public.profiles (recommended_by);

commit;
