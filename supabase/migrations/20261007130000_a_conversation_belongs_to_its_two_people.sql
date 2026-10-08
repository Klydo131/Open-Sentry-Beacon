-- Conversation authority stays with the Guide and Explorer, even after a role changes.
-- Leadership can still manage pairings and review submitted safeguarding evidence.
begin;

create or replace function public.lock_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  caller_privileged boolean := public.is_admin() or public.is_executive();
begin
  -- SQL migrations and service-side recovery work have no end-user JWT. They
  -- are the deliberate administrative path, not a browser self-update.
  if new.id is distinct from old.id then
    raise exception 'A profile identity cannot change' using errcode = '42501';
  end if;
  if v_user_id is null then
    return new;
  end if;

  if old.id = v_user_id then
    if new.role is distinct from old.role
       or new.is_approved is distinct from old.is_approved
       or new.church_id is distinct from old.church_id
       or new.is_head_executive is distinct from old.is_head_executive
       or new.guardian_name is distinct from old.guardian_name
       or new.guardian_consent_at is distinct from old.guardian_consent_at
       or new.guardian_consent_by is distinct from old.guardian_consent_by
       or new.guardian_member_id is distinct from old.guardian_member_id then
      if old.church_id is null
         and old.is_approved is false
         and new.is_approved is false
         and new.is_head_executive is not distinct from old.is_head_executive
         and new.guardian_name is not distinct from old.guardian_name
         and new.guardian_consent_at is not distinct from old.guardian_consent_at
         and new.guardian_consent_by is not distinct from old.guardian_consent_by
         and new.guardian_member_id is not distinct from old.guardian_member_id
         and exists (
           select 1
           from auth.users u
           join public.invites i
             on lower(btrim(i.email)) = lower(btrim(u.email))
           where u.id = v_user_id
             and i.expires_at > now()
             and i.church_id = new.church_id
             and i.role = new.role
         ) then
        return new;
      end if;

      raise exception 'You cannot change your own role, church, approval or guardian consent'
        using errcode = '42501';
    end if;
  elsif not caller_privileged then
    new.role                := old.role;
    new.is_approved         := old.is_approved;
    new.church_id           := old.church_id;
    new.is_head_executive   := old.is_head_executive;
    new.guardian_name       := old.guardian_name;
    new.guardian_consent_at := old.guardian_consent_at;
    new.guardian_consent_by := old.guardian_consent_by;
    new.guardian_member_id  := old.guardian_member_id;
  elsif new.church_id is distinct from old.church_id
     or new.is_head_executive is distinct from old.is_head_executive
     or old.is_head_executive then
    raise exception 'Church and Head Executive changes use the authorized administrative route'
      using errcode = '42501';
  elsif public.is_admin() and (old.role not in ('dm', 'ds') or new.role not in ('dm', 'ds')) then
    raise exception 'Only an Executive Director may manage a Director' using errcode = '42501';
  elsif new.role = 'executive' and old.role <> 'executive' and not public.is_head_executive() then
    raise exception 'Executive appointments use the authorized invitation route' using errcode = '42501';
  elsif old.role = 'executive' and (
       new.role is distinct from old.role or new.is_approved is distinct from old.is_approved)
       and not public.is_head_executive() then
    raise exception 'Executive authority uses the authorized administrative route' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create or replace function private.my_pairing_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select p.id from public.pairings p
  join public.profiles me on me.id = (select auth.uid())
  where me.is_approved and me.suspended_at is null
    and (select private.my_session_is_live())
    and ((me.role = 'dm' and p.dm_id = me.id) or (me.role = 'ds' and p.ds_id = me.id));
$$;

create or replace function public.in_pairing(p uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.is_approved_user() and p in (select private.my_pairing_ids()); $$;

create or replace function private.keep_pairing_participants()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare guide public.profiles%rowtype; explorer public.profiles%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.dm_id is distinct from old.dm_id
       or new.ds_id is distinct from old.ds_id or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Start a new pairing to arrange a different relationship.' using errcode = '42501';
    end if;
    return new;
  end if;
  select * into guide from public.profiles where id = new.dm_id;
  select * into explorer from public.profiles where id = new.ds_id;
  if guide.id is null or explorer.id is null or guide.id = explorer.id
     or guide.role <> 'dm' or explorer.role <> 'ds'
     or not guide.is_approved or not explorer.is_approved
     or guide.suspended_at is not null or explorer.suspended_at is not null
     or guide.church_id is null or guide.church_id is distinct from explorer.church_id then
    raise exception 'Pair an approved Guide and Explorer from the same church.' using errcode = '42501';
  end if;
  if (select auth.uid()) is not null and new.created_by is distinct from (select auth.uid()) then
    raise exception 'The pairing records who arranged it.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_pairing_participants() from public, anon, authenticated;
drop trigger if exists keep_pairing_participants on public.pairings;
create trigger keep_pairing_participants before insert or update on public.pairings
for each row execute function private.keep_pairing_participants();

revoke insert, update on public.pairings from authenticated;
grant insert (dm_id, ds_id, track, journey_stage, created_by) on public.pairings to authenticated;
grant update (journey_stage, status, updated_at) on public.pairings to authenticated;

create or replace function private.my_threads()
returns table (
  pairing_id   uuid,
  other_id     uuid,
  other_name   text,
  unread       bigint,
  last_at      timestamptz,
  last_preview text,
  last_is_mine boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  me uuid := (select auth.uid());
begin
  return query
  with mine as (
    select p.id,
           case when p.dm_id = me then p.ds_id else p.dm_id end as other
    from public.pairings p
    where p.status = 'active' and p.id in (select private.my_pairing_ids())
  ),
  last_line as (
    select distinct on (m.pairing_id)
           m.pairing_id, m.body, m.sender_id, m.created_at, m.deleted_at
    from public.messages m
    join mine on mine.id = m.pairing_id
    order by m.pairing_id, m.created_at desc
  )
  select
    mine.id,
    mine.other,
    coalesce(who.full_name, 'A member'),
    (select count(*) from public.messages u
      where u.pairing_id = mine.id and u.sender_id <> me and u.read_at is null),
    l.created_at,
    -- ONE LINE, AND NEVER THE WORDS OF A MESSAGE THAT WAS TAKEN BACK. A deleted
    -- message empties its own row, so the preview would be blank rather than
    -- wrong -- but blank reads as "no messages yet", which is a different and
    -- worse lie than saying what happened.
    case
      when l.deleted_at is not null then 'Message deleted'
      when length(l.body) > 80 then left(l.body, 80) || '…'
      else l.body
    end,
    l.sender_id = me
  from mine
  join public.profiles who on who.id = mine.other
  left join last_line l on l.pairing_id = mine.id
  order by (select count(*) from public.messages u
             where u.pairing_id = mine.id and u.sender_id <> me and u.read_at is null) desc,
           l.created_at desc nulls last;
end;
$$;

create or replace function private.edit_message(p_message uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.messages%rowtype;
  v_new text := btrim(coalesce(p_body, ''));
begin
  select * into v_msg from public.messages where id = p_message;
  if v_msg.id is null or not public.in_pairing(v_msg.pairing_id) then
    raise exception 'That message is not available to you.' using errcode = '42501';
  end if;

  -- THE AUTHOR, AND ONLY THE AUTHOR. The other person in the pairing could do
  -- this until today; that is the fault this function exists to end.
  if v_msg.sender_id <> (select auth.uid()) then
    raise exception 'You can only change your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;
  if length(v_new) not between 1 and 4000 then
    raise exception 'A message has to say something, and fit in 4000 characters.';
  end if;
  -- Nothing to record and nothing to change. Saving an unchanged message should
  -- not litter the record with a revision that says the same as the row.
  if v_new = v_msg.body then
    return;
  end if;

  insert into public.message_revisions (message_id, pairing_id, author_id, body, reason)
  values (v_msg.id, v_msg.pairing_id, v_msg.sender_id, v_msg.body, 'edited');

  update public.messages
     set body = v_new, edited_at = now()
   where id = v_msg.id;
end;
$$;

create or replace function private.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_msg public.messages%rowtype;
begin
  select * into v_msg from public.messages where id = p_message;
  if v_msg.id is null or not public.in_pairing(v_msg.pairing_id) then
    raise exception 'That message is not available to you.' using errcode = '42501';
  end if;
  if v_msg.sender_id <> (select auth.uid()) then
    raise exception 'You can only take back your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    return;                                   -- already gone; pressing twice is fine
  end if;

  insert into public.message_revisions (message_id, pairing_id, author_id, body, reason)
  values (v_msg.id, v_msg.pairing_id, v_msg.sender_id, v_msg.body, 'deleted');

  -- The words leave the row. The fact of it, and who did it, stay -- that note
  -- is the thing that was asked for, and it is also what stops a deletion
  -- looking like a message that was never sent.
  update public.messages
     set body = '', deleted_at = now(), deleted_by = (select auth.uid())
   where id = v_msg.id;
end;
$$;

-- Reports hold the content deliberately submitted as evidence. A church role
-- must not unlock a separate feed of private message revisions.
revoke all on function public.message_history_for_leader(uuid) from public, anon, authenticated;
revoke all on function private.message_history_for_leader(uuid) from public, anon, authenticated;

create or replace function public.church_of(p uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare c uuid;
begin
  select church_id into c from public.profiles where id = p;
  if c is not null and (public.can_access_church(c) or public.manages_church(c)) then
    return c;
  end if;
  return null;
end;
$$;

commit;
