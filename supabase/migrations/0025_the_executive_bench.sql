-- What an Executive Director may do, corrected on two counts.
--
-- 1. THE CEILING WAS TOO LOW. 0023 refused Executive-on-Executive outright, to
--    avoid a church where whoever clicks first wins. The owner's ruling is that
--    an Executive Director can jail or kick anyone. That is the call to make --
--    they are the top of the church, and a safeguarding system whose highest
--    authority cannot act on a peer has a hole exactly where the most senior
--    person stands.
--
--    Two limits survive, and neither is a rank:
--
--      * nobody acts on themselves -- unchanged, and not about authority.
--      * nobody removes the HEAD Executive Director.
--
--    The second is the root of the tree. is_head_executive is the one account
--    that can appoint executives; if it can be removed by any executive, then a
--    single compromised or angry executive account can decapitate the church
--    and leave nobody able to appoint a replacement. It is a recovery
--    guarantee, not a privilege -- and it binds the head executive too, who
--    cannot be removed by anyone including themselves.
--
-- 2. AN EXECUTIVE COULD NOT REACH THE CHURCHES THEY OVERSEE. discipline_check
--    compared church_id to church_id. An executive is tied to the churches they
--    oversee through church_executives, and their own church_id may be a
--    different one or none at all -- so the check silently refused them on
--    every member of a church they are responsible for. This is the same fault
--    that made executives see one profile instead of twenty-four, in a
--    different function.

begin;

create or replace function public.discipline_check(p_target uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  me     public.profiles%rowtype;
  target public.profiles%rowtype;
  reach  boolean;
begin
  select * into me     from public.profiles where id = (select auth.uid());
  select * into target from public.profiles where id = p_target;

  if me.id is null or not me.is_approved then return 'Your account cannot do this.'; end if;
  if target.id is null then return 'That person is not here.'; end if;
  if me.id = target.id then return 'You cannot do this to yourself.'; end if;

  -- The head executive is the root of authority and cannot be suspended or
  -- removed through the app by anybody, themselves included.
  if target.is_head_executive then
    return 'The Head Executive Director cannot be suspended or removed from inside the app.';
  end if;

  if me.role = 'executive' then
    -- Their own church, or any church they oversee.
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

revoke all on function public.discipline_check(uuid) from public, anon;
grant execute on function public.discipline_check(uuid) to authenticated;

commit;
