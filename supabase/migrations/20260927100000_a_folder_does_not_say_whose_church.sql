-- A folder does not say whose church it is to somebody outside that church.
--
-- FOUND IN THE AUDIT OF 27 SEPTEMBER 2026. `public.uploader_church(folder)`
-- turns the first part of a stored file's path (a person's id) into that
-- person's church. The storage rules need exactly that. But the function is
-- also callable on its own, by any signed-in member, with any id at all:
--
--   POST /rest/v1/rpc/uploader_church  {"p_folder": "<anybody's id>"}
--
-- and it answered with that person's church, whichever church it was. An id
-- is a long random string that a member of one church would not normally
-- hold for a member of another, so this was a small door. It was still a
-- question nobody should be able to ask, in an app whose promise is that a
-- church's people are its own business.
--
-- THE CHANGE. The function now answers only with a church the caller could
-- already see into (`can_access_church`) or leads (`manages_church`), and
-- with nothing otherwise.
--
-- WHY EVERY STORAGE RULE DECIDES EXACTLY AS BEFORE. Each one uses this
-- function only inside one of those same two tests:
--
--   can_access_church(uploader_church(folder))   -- lesson files, avatars
--   manages_church(uploader_church(folder))      -- leaders removing files,
--                                                   safeguarding evidence,
--                                                   resource files
--
-- Where the caller passes the test, the function returns the church as it
-- always did, so the test passes as before. Where the caller fails both, it
-- now returns nothing -- and both tests say no to nothing, as they already
-- said no to that church. Where the caller passes one test but not the other,
-- the church is returned and the other test says no to it, as before.
-- Checked on the live database in a discarded transaction for every account
-- against every person's folder, both tests, before this was applied
-- (docs/SECURITY.md has the numbers).

create or replace function public.uploader_church(p_folder text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  c uuid;
begin
  begin
    u := p_folder::uuid;
  exception when others then
    return null;
  end;
  select church_id into c from public.profiles where id = u;
  if c is not null and (public.can_access_church(c) or public.manages_church(c)) then
    return c;
  end if;
  return null;
end $$;

revoke all on function public.uploader_church(text) from public, anon;
grant execute on function public.uploader_church(text) to authenticated;
