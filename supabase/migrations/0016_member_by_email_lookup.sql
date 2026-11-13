-- Is this address already somebody in Hope Beacon?
--
-- WHY THIS IS NEEDED. Nothing checked, so inviting an address that already
-- belonged to a member created a perfectly valid invitation for them. The
-- Executive Director's own address ended up with an open invitation as a Guide
-- in the Invitations list: the account was untouched and still executive, but
-- the screen said otherwise and there was no way to tell which was true.
--
-- The confusing list is the smaller half. handle_new_user reads the invite's
-- role when a sign-up is redeemed, so an accepted invitation for an existing
-- member is a route to changing their role by following a link — an Executive
-- Director could demote themselves by clicking something addressed to them.
-- Refusing at the point of invitation closes that without relying on anybody
-- noticing.
--
-- SECURITY DEFINER because it must read auth.users, which no browser-side
-- policy can reach — and that is exactly why the check has to live here rather
-- than in a table policy.
--
-- IT IS NOT GRANTED TO ANY BROWSER ROLE. A function that answers "is this
-- address registered?" is an account-enumeration oracle: point it at a list of
-- addresses and it tells you which people use this app. Only the service role,
-- held by the invite Edge Function and never by a client, may call it.
-- Revoked from PUBLIC as well as anon and authenticated, because EXECUTE on a
-- new function is granted to PUBLIC by default and removing it from one member
-- of that group removes nothing — the mistake migration 0010 exists to correct.

create or replace function public.member_by_email(p_email text)
returns table (id uuid, role public.user_role, church_id uuid, full_name text)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, p.role, p.church_id, p.full_name
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = lower(btrim(p_email))
  limit 1;
$$;

revoke all on function public.member_by_email(text) from public, anon, authenticated;
grant execute on function public.member_by_email(text) to service_role;
