-- Cancel has never once worked, and said it did.
--
-- The invites_revoke policy allows a delete only where `redeemed_at is null`.
-- redeemed_at is stamped by handle_new_user when the account row is created,
-- which happens the instant Send is pressed — so the condition is false for
-- every invitation that has ever existed. A delete matching no rows is not an
-- error, so the button reported success, the row stayed, and the
-- one-open-invitation-per-address index went on blocking the corrected
-- invitation. An address typed wrongly was un-invitable for good.
--
-- Fixed here rather than by widening the policy, because the honest condition —
-- "nobody has finished signing up at this address" — has to read auth.users to
-- match an address to an account, and a policy expression is evaluated with the
-- caller's own privileges, which do not include that.
create or replace function public.cancel_invitation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_church uuid;
  v_email  text;
  v_done   timestamptz;
begin
  select i.church_id, i.email into v_church, v_email
  from public.invites i where i.id = p_id;

  if v_church is null then
    return false;
  end if;

  -- The caller must lead THIS church. Without it the id alone would be enough
  -- to delete another church's invitations.
  if not exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.is_approved
      and me.role in ('admin', 'executive')
      and me.church_id = v_church
  ) then
    return false;
  end if;

  -- Somebody who has finished signing up is a member. Withdrawing the
  -- invitation they came in on would erase how they joined.
  select p.signup_completed_at into v_done
  from auth.users u join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = lower(btrim(v_email))
  limit 1;

  if v_done is not null then
    return false;
  end if;

  delete from public.invites where id = p_id;
  return true;
end;
$$;

revoke all on function public.cancel_invitation(uuid) from public, anon;
grant execute on function public.cancel_invitation(uuid) to authenticated;
