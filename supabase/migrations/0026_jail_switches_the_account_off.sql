-- Jail now switches the account off, and release switches it back on.
--
-- WHAT WAS WRONG. 0023's suspension was a flag on the profile. It stopped the
-- person sending messages, because the messages policy asks about it, and it
-- archived their pairings -- but they could still sign in, still look around,
-- and every screen that did not happen to ask about suspended_at still worked
-- for them. For a safeguarding hold that is the wrong shape entirely: somebody
-- suspended for harassment could still read the church, see who was there, and
-- watch the people who reported them.
--
-- Worse, an existing session kept working. The flag changed what the database
-- would accept on the next request, and their browser already held a valid
-- token, so nothing visibly happened until it expired.
--
-- WHAT JAIL IS NOW. The auth account is deactivated: banned_until is set far
-- into the future, which is the switch GoTrue itself consults, so sign-in is
-- refused at the front door rather than by each policy in turn. Their live
-- sessions and refresh tokens are deleted in the same breath, so somebody
-- already signed in is out immediately instead of at token expiry.
--
-- Release is the exact inverse: banned_until back to null, the profile flag
-- cleared, and they can sign in again. On and off, one switch, both directions.
--
-- WHY THE PROFILE FLAG STAYS. It is what the app reads to SAY somebody is
-- suspended -- on the member list, in the trial room -- and what the messages
-- policy checks. Deactivating the auth account is the enforcement; the flag is
-- the record. Dropping either one would lose something: without the flag the
-- app cannot show who is jailed, and without the ban the app is the only thing
-- stopping them.
--
-- PAIRINGS STILL DO NOT SPRING BACK on release, unchanged from 0023. Who walks
-- with whom is a decision a Director makes again, deliberately.

begin;

/** Jail: deactivate the account. They stay in the church and keep their history. */
create or replace function public.suspend_member(p_target uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare verdict text;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  update public.profiles
     set suspended_at = now(),
         suspended_by = (select auth.uid()),
         suspended_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_target;

  -- THE SWITCH. banned_until is what GoTrue checks before it will issue a
  -- token, so this refuses the sign-in itself rather than relying on every
  -- policy to remember to ask.
  update auth.users
     set banned_until = now() + interval '100 years',
         updated_at = now()
   where id = p_target;

  -- Out now, not when the token happens to expire.
  delete from auth.sessions       where user_id = p_target;
  delete from auth.refresh_tokens where user_id = p_target::text;

  update public.pairings set status = 'archived'
   where (dm_id = p_target or ds_id = p_target) and status = 'active';

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'approval', 'A member was suspended',
         (select full_name from public.profiles where id = p_target)
         || ' was suspended by '
         || (select full_name from public.profiles where id = (select auth.uid())) || '.'
  from public.profiles p
  where p.church_id = (select church_id from public.profiles where id = p_target)
    and p.is_approved and p.role in ('admin', 'executive')
    and p.id <> (select auth.uid());

  return 'ok';
end;
$$;

/** Release: switch the account back on. Same authority test -- whoever may jail may release. */
create or replace function public.restore_member(p_target uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare verdict text;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  update public.profiles
     set suspended_at = null, suspended_by = null, suspended_reason = null
   where id = p_target;

  update auth.users
     set banned_until = null,
         updated_at = now()
   where id = p_target;

  insert into public.notifications (user_id, type, title, body)
  values (p_target, 'approval', 'Your account is active again',
          'A Director has lifted your suspension. You can sign in as usual.');

  return 'ok';
end;
$$;

revoke all on function public.suspend_member(uuid, text) from public, anon;
revoke all on function public.restore_member(uuid)       from public, anon;
grant execute on function public.suspend_member(uuid, text) to authenticated;
grant execute on function public.restore_member(uuid)       to authenticated;

commit;
