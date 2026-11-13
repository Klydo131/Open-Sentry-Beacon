-- Let a church's leadership see the email address of their own members.
--
-- An approval screen listing "Cool — Guide" and "kl — Explorer" with nothing
-- else asks a Director to make a real decision about a real person on the
-- strength of a display name that person typed themselves. The address the
-- invitation went to is the one piece of information that actually identifies
-- them, and it was unreachable: addresses live in auth.users, which no
-- browser-side policy can read.
--
-- SECURITY DEFINER because it must read auth.users, and every risk that creates
-- is closed inside the function rather than at the call site:
--
--   * it takes NO arguments, so nobody can ask about a church that is not
--     theirs;
--   * the church is read from the caller's own profile, never accepted from
--     them;
--   * it returns nothing at all unless the caller is an approved admin or
--     executive of that same church;
--   * search_path is pinned, so a caller cannot shadow `profiles` with a table
--     of their own and change what the body means.

create or replace function public.church_member_contact()
returns table (id uuid, email text, joined_at timestamptz)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, u.email::text, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive')
        and me.church_id = p.church_id
    );
$$;

-- Revoke from PUBLIC, not just anon. EXECUTE on a new function is granted to
-- PUBLIC by default, and removing it from one member of that group removes
-- nothing — the exact mistake migration 0010 exists to correct.
revoke all on function public.church_member_contact() from public, anon;
grant execute on function public.church_member_contact() to authenticated;
