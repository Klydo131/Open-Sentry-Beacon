-- The member waiting to be approved is named in the notice, not "Somebody".
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 29 OCTOBER 2026, with a picture of the bell: "Why is it called
-- somebody, it should be the name being approved please." The notice a
-- Director gets when an invited member finishes signing up was titled
-- "Somebody is waiting to be approved", and the name came only in the line
-- under it. A bell lists titles, and a phone's notification shows the title
-- first, so the one word a Director needs was the one word left out.
--
-- NEW NOTICES. handle_new_user, otherwise exactly as
-- 20260914120000_the_head_executive_appointment_needs_no_second_approval left
-- it, titles the notice "<their name> is waiting to be approved", the name
-- they signed up with, or the name on their invitation, or "A new member" if
-- there is neither, cut at 80 characters. The line under it no longer
-- repeats the name.
--
-- NOTICES ALREADY SENT keep their wording below the title but gain the name in
-- it, read back out of that line, which every one of them starts with
-- (it was written by this same function). Only an unchanged "Somebody" notice
-- of that exact shape is touched; nothing else in anybody's bell is.
--
-- A new migration rather than an edit of 20260914120000, which has been
-- applied to the live database.
-- ---------------------------------------------------------------------------

begin;

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
  v_name   text;
begin
  select * into v_invite
  from public.invites
  where lower(btrim(email)) = lower(btrim(new.email))
    and redeemed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  v_role := coalesce(v_invite.role, 'ds'::public.user_role);

  v_auto := v_invite.id is not null
            and (
              v_role in ('ds'::public.user_role, 'executive'::public.user_role)
              or (
                v_role = 'admin'::public.user_role
                and exists (
                  select 1 from public.profiles h
                   where h.id = v_invite.invited_by
                     and h.is_head_executive
                )
              )
            );

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
    -- The name the bell shows first: the person's own, as they signed up, at
    -- most 80 characters, since it is theirs to type and a title is the first
    -- thing a Director reads.
    v_name := left(coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, '')), ''), 'A new member'), 80);
    insert into public.notifications (user_id, type, title, body)
    select p.id,
           'approval',
           v_name || ' is waiting to be approved',
           'They have finished signing up and cannot get in until a Director approves them.'
    from public.profiles p
    where p.church_id = v_invite.church_id
      and p.is_approved
      and p.role in ('admin'::public.user_role, 'executive'::public.user_role);
  end if;

  return new;
end;
$function$;

-- The notices already in people's bells.
update public.notifications
   set title = left(left(body, length(body) - length(' has finished signing up and cannot get in until a Director approves them.')), 80)
               || ' is waiting to be approved'
 where type = 'approval'
   and title = 'Somebody is waiting to be approved'
   and right(body, length(' has finished signing up and cannot get in until a Director approves them.'))
       = ' has finished signing up and cannot get in until a Director approves them.'
   and length(body) > length(' has finished signing up and cannot get in until a Director approves them.');

commit;
