-- Pin the search_path on the one-Guide-per-Explorer check.
--
-- FOUND BY AUDIT, not by anything failing. Supabase's own linter reports
-- `function_search_path_mutable` against `public.one_guide_per_explorer`, and
-- it is right: the function was added earlier today and is the only trigger
-- function in this schema without `set search_path`.
--
-- WHY IT MATTERS EVEN THOUGH THIS ONE IS NOT `security definer`. A function
-- with a mutable search_path resolves `public.pairings` through whatever the
-- caller's search_path happens to be at the time. Every reference in the body
-- is already schema-qualified, so there is no exploitable path here today --
-- this is closing the door before somebody adds an unqualified reference to
-- the body in a year and turns a lint into a bug. It costs one line.
--
-- The body is unchanged. It is repeated in full because `create or replace`
-- cannot alter the attributes of a function without restating it, and an
-- `alter function ... set search_path` that drifted from the definition here
-- would leave the repository disagreeing with the database.

begin;

create or replace function public.one_guide_per_explorer()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.pairings p
    where p.ds_id = new.ds_id
      and p.status = 'active'
      and p.id is distinct from new.id
  ) then
    raise exception 'That Explorer already has a Guide. Disconnect the current one first.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

commit;
