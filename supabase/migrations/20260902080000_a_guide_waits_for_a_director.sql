-- A Guide waits for a Director. An Explorer does not.
--
-- THE BUG. `handle_new_user` set `is_approved` to `v_invite.id is not null` —
-- anybody holding an invitation was approved the instant their account existed.
-- So the approvals screen was permanently empty and no Director ever approved
-- anybody: an invited Guide redeemed a link and was inside, walking with people,
-- before any second person had looked.
--
-- WHY THE INVITATION IS NOT ENOUGH ON ITS OWN. It is one decision, made when the
-- address was typed, and the person who redeems a link is not necessarily the
-- person it was sent to — a forwarded email, a shared inbox, a mistyped address
-- that happens to belong to somebody real. For an Explorer that is a small
-- problem: they can see their own journey and nothing else. For a GUIDE it is
-- the whole safeguarding model, because a Guide is handed private conversations
-- with people the church is walking alongside.
--
-- SO THE LINE IS DRAWN AT POWER, NOT AT PAPERWORK. An invited Explorer is still
-- approved on arrival, because asking a Director to confirm somebody they just
-- invited, who can do nothing, is friction that trains people to click Approve
-- without reading. A Guide, a Director and an Executive Director wait.
--
-- WHAT A WAITING PERSON SEES: the "Account awaiting approval" screen that
-- already existed for this case. Nothing new to build; it simply had no way of
-- ever being reached.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite public.invites%rowtype;
  -- TYPED, NOT text. The first version of this declared `v_role text`, which
  -- lost the enum: `profiles.role` is `user_role`, so the insert failed with
  -- "column role is of type user_role but expression is of type text" — and
  -- that insert is the ONLY thing that creates a profile. Every sign-up would
  -- have broken, for every role, the moment somebody redeemed a link. Caught by
  -- running the real path against the real trigger rather than reading it.
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

  -- An Explorer with a live invitation is approved on arrival. Anybody who
  -- will hold power over somebody else waits to be approved by a person.
  v_auto := v_invite.id is not null and v_role = 'ds'::public.user_role;

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

  -- TELL THE DIRECTORS, or the queue is a screen nobody thinks to open. A
  -- person waiting to be let in has no way to chase it themselves: they cannot
  -- message anybody, because being able to message people is the thing they are
  -- waiting for.
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
