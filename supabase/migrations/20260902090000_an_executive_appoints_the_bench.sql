-- An Executive Director appoints another Executive Director, by email.
--
-- TWO RULES DISAGREED, AND THE STRICTER ONE WON SILENTLY. The invite edge
-- function says "only an Executive Director can invite another Executive
-- Director" — a rule about WHO may do it. The database trigger underneath said
-- "Executive Directors are appointed, not invited" — a rule that nobody may,
-- ever. So the screen offered Executive Director in its list, the function
-- allowed it, and the insert was refused at the last moment with a sentence
-- that reads like a policy rather than a bug. It was written when there was no
-- way to appoint one at all and was never revisited once the function grew the
-- narrower rule.
--
-- The database now says what the function says: an Executive may appoint an
-- Executive, and nobody else may.
--
-- AND THEY DO NOT WAIT FOR APPROVAL. Guides and Directors wait, because a
-- second person confirming somebody who will hold power over members is the
-- point of that gate. An Executive Director is the top of the tree: the only
-- people who could approve them are the Directors they themselves appoint, so
-- asking for that approval is backwards. The appointing Executive IS the
-- authority, and the invitation is the act.

create or replace function public.validate_invite_privilege()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_inviter public.profiles%rowtype;
  v_guide public.profiles%rowtype;
begin
  select * into v_inviter from public.profiles where id = new.invited_by;

  if v_inviter.id is null
     or not v_inviter.is_approved
     or v_inviter.role not in ('admin', 'executive')
     or v_inviter.church_id is distinct from new.church_id then
    raise exception 'The inviter may not invite into this church' using errcode = '42501';
  end if;

  -- The bench appoints the bench. Same rule as the edge function, in the place
  -- that actually decides.
  if new.role = 'executive' and v_inviter.role <> 'executive' then
    raise exception 'Only an Executive Director may appoint an Executive Director'
      using errcode = '42501';
  end if;
  if new.role = 'admin' and v_inviter.role <> 'executive' then
    raise exception 'Only an Executive Director may invite a Director' using errcode = '42501';
  end if;

  if new.recommended_by is not null then
    if new.role <> 'ds' then
      raise exception 'Only an Explorer invitation may name a Guide' using errcode = '22023';
    end if;
    select * into v_guide from public.profiles where id = new.recommended_by;
    if v_guide.id is null
       or v_guide.role <> 'dm'
       or not v_guide.is_approved
       or v_guide.church_id is distinct from new.church_id then
      raise exception 'The recommended Guide must be approved in this church' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- The other half: an appointed Executive is in on arrival, like an Explorer and
-- unlike a Guide or a Director. See the comment above for why.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite public.invites%rowtype;
  v_role   public.user_role;
  v_auto   boolean;
begin
  select * into v_invite
  from public.invites
  where lower(btrim(email)) = lower(btrim(new.email))
    and redeemed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  v_role := coalesce(v_invite.role, 'ds'::public.user_role);

  -- Waits for a Director: a Guide, and a Director. Does not wait: an Explorer,
  -- who holds no power over anybody, and an Executive Director, who has nobody
  -- above them to do the approving.
  v_auto := v_invite.id is not null
            and v_role in ('ds'::public.user_role, 'executive'::public.user_role);

  insert into public.profiles (
    id, full_name, role, church_id, is_approved, recommended_by, recommended_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, ''),
    v_role,
    v_invite.church_id,
    v_auto,
    v_invite.recommended_by,
    case when v_invite.recommended_by is not null then now() end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.invites set redeemed_at = now() where id = v_invite.id;
  end if;

  if v_invite.id is not null and not v_auto and v_invite.church_id is not null then
    insert into public.notifications (user_id, type, title, body)
    select p.id,
           'approval',
           'Somebody is waiting to be approved',
           coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, '')), ''), 'A new member')
             || ' has finished signing up and cannot get in until a Director approves them.'
    from public.profiles p
    where p.church_id = v_invite.church_id
      and p.is_approved
      and p.role in ('admin'::public.user_role, 'executive'::public.user_role);
  end if;

  return new;
end;
$function$;
