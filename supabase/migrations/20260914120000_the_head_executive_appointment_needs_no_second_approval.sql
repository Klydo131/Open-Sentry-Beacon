-- An appointment by the Head Executive Director needs no second approval.
--
-- ASKED FOR DIRECTLY: "Once the head of Executive Director invites there's no
-- need of approval for ED and Directors."
--
-- WHAT WAS ALREADY TRUE, AND THE INCONSISTENCY UNDERNEATH IT. handle_new_user
-- already arrived approved for an Explorer and for an Executive Director, and
-- NOT for a Director. Measured rather than read, by walking a real invitation
-- through the trigger for each role inside a transaction that rolled back:
--
--   invited as executive -> approved   invited as admin -> NOT approved
--   invited as ds        -> approved   invited as dm    -> NOT approved
--
-- So the most privileged role in a church already skipped the queue while the
-- one below it waited. That is not a rule anybody chose; it is two rules that
-- drifted apart.
--
-- WHY SKIPPING IT IS SAFE HERE, stated plainly because this grants privilege.
-- The approval step exists so somebody holding a link cannot let themselves in.
-- It is not bypassed: the Head Executive Director is the root of authority in
-- this app and the only account that cannot be removed from inside it. Asking
-- them to approve an appointment they have just made is the same person
-- agreeing with themselves twice, and the queue it creates is the one a church
-- most often leaves sitting.
--
-- WHAT STILL WAITS, deliberately:
--
--   * A Director invited by any OTHER Executive Director. Proven by probe: the
--     same role, invited by a non-head Executive Director, arrives unapproved.
--     That keeps a second pair of eyes on the one role that can then approve
--     everybody else.
--   * A Guide. Unchanged, and untouched by this.
--
-- Tied to invited_by, which the invite function always sets. If that account is
-- later removed the column is nulled by its foreign key, so an invitation
-- claimed after its issuer has gone falls back to needing approval. Failing
-- towards asking is the safe direction.

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

commit;
