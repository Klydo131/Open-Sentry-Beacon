-- Make yourself the first Executive Director of a new church.
--
-- Run this ONCE, after you have signed up through the app with your own email.
-- There is no public route to this on purpose: the highest seat in the app
-- cannot be handed out by anything inside the app, so the first one is granted
-- from a database session by whoever owns the database. That is you.
--
-- Everybody after you arrives by invitation.
--
-- ------------------------------------------------------------------------
-- CHANGE THESE TWO LINES, then run the whole file.
-- ------------------------------------------------------------------------

do $$
declare
  -- The address you signed up with.
  v_email text := 'you@yourchurch.example';
  -- What your church is called. It appears on screens your members read.
  v_church_name text := 'Your Church Name';

  v_user uuid;
  v_church uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No account for %. Sign up through the app first, then run this.', v_email;
  end if;

  -- Reuse a church of that name if you are re-running this, rather than
  -- quietly creating a second one with the same name.
  select id into v_church from public.churches where name = v_church_name order by created_at limit 1;
  if v_church is null then
    insert into public.churches (name) values (v_church_name) returning id into v_church;
  end if;

  -- The signup trigger already made the profile with safe defaults — role 'ds',
  -- no church, not approved. So this is an UPDATE. An INSERT here would hit the
  -- existing row and, with `on conflict do nothing`, silently change nothing
  -- while appearing to succeed.
  update public.profiles
  set role = 'executive',
      church_id = v_church,
      is_approved = true,
      is_head_executive = true,
      full_name = coalesce(nullif(full_name, ''), 'Executive Director')
  where id = v_user;

  insert into public.church_executives (church_id, executive_id)
  values (v_church, v_user)
  on conflict (church_id, executive_id) do nothing;

  raise notice 'Done. % is now Executive Director of %.', v_email, v_church_name;
end $$;

-- Check it worked. You should see one row, executive, approved.
select p.full_name, p.role, p.is_approved, c.name as church
from public.profiles p join public.churches c on c.id = p.church_id
where p.is_head_executive;
