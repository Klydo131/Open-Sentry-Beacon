-- The trial room: suspending a member, and removing one.
--
-- WHAT THIS IS FOR. A church running this app has no other lever. If somebody
-- sends an Explorer something they should not have, the leadership needs to be
-- able to act tonight, from a phone, without a developer. Reports (0021) gave
-- them the evidence; this gives them the response.
--
-- TWO DIFFERENT ACTS, and conflating them is the mistake to avoid:
--
--   JAIL (suspend)  They stay in the church and keep their history. They
--                   cannot sign in, message, or be paired. Reversible by the
--                   leadership that imposed it. This is for  and for .
--   KICK (remove)   They are gone. Already exists as remove_member().
--
-- WHO MAY DO WHAT — enforced here, in the database, not in a screen:
--
--   Executive Director  may suspend or remove admin, dm, ds.
--   Director            may suspend or remove dm and ds ONLY. Never another
--                       Director, and never an Executive.
--   Nobody              may suspend or remove themselves. A church that
--                       accidentally locks out its own leadership has no way
--                       back in without a developer, which is exactly the
--                       dependency this app exists to remove.

alter table public.profiles
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_by     uuid references public.profiles(id) on delete set null,
  add column if not exists suspended_reason text;

comment on column public.profiles.suspended_at is
  'Set while a member is suspended ("jailed"): still in the church, cannot act. NULL means active.';

/**
 * May the caller act on this person?
 *
 * One function, so the rule cannot drift between suspend, restore and remove.
 * Returns the reason it is refused rather than just false, because "nothing
 * happened" is the worst possible answer to a leader trying to stop something.
 */
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
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into target from public.profiles where id = p_target;

  if me.id is null or not me.is_approved then return 'Your account cannot do this.'; end if;
  if target.id is null then return 'That person is not here.'; end if;
  if me.church_id is distinct from target.church_id then return 'That person is not in your church.'; end if;
  if me.id = target.id then return 'You cannot do this to yourself.'; end if;

  if me.role = 'executive' then
    if target.role = 'executive' then
      -- Two Executive Directors cannot remove each other. The alternative is a
      -- church where whoever clicks first wins.
      return 'An Executive Director cannot suspend or remove another Executive Director.';
    end if;
    return 'ok';
  end if;

  if me.role = 'admin' then
    if target.role in ('dm', 'ds') then return 'ok'; end if;
    return 'A Director may only suspend or remove Guides and Explorers.';
  end if;

  return 'Only a Director or Executive Director can do this.';
end;
$$;

revoke all on function public.discipline_check(uuid) from public, anon;
grant execute on function public.discipline_check(uuid) to authenticated;

/** Jail: suspend a member. They stay; they cannot act. */
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

  -- Their conversations stop too. A suspended Guide who could still message
  -- the person who reported them would make this worse than doing nothing.
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

/** Unjail. Deliberately the same authority test: whoever may jail may release. */
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

  -- Pairings are NOT restored. Who walks with whom is a decision for a
  -- Director to make again deliberately, not something that springs back.
  return 'ok';
end;
$$;

/** Kick: remove from the church entirely, under the same authority rules. */
create or replace function public.remove_member_by_leader(p_target uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare verdict text;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  delete from public.messages where sender_id = p_target;
  delete from public.journey_events where changed_by = p_target;
  delete from public.pairings where dm_id = p_target or ds_id = p_target or created_by = p_target;
  delete from auth.users where id = p_target;
  return 'ok';
end;
$$;

revoke all on function public.suspend_member(uuid, text) from public, anon;
revoke all on function public.restore_member(uuid) from public, anon;
revoke all on function public.remove_member_by_leader(uuid) from public, anon;
grant execute on function public.suspend_member(uuid, text) to authenticated;
grant execute on function public.restore_member(uuid) to authenticated;
grant execute on function public.remove_member_by_leader(uuid) to authenticated;

-- A suspended person must not be able to keep talking. The screen refuses too,
-- but a screen is not a security boundary — this is.
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.in_pairing(pairing_id)
    and not exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid()) and me.suspended_at is not null
    )
  );
