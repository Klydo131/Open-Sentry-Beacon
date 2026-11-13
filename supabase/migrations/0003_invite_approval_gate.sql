-- An invitation assigns church and role, but it does not approve access.
--
-- The invited person first proves control of the e-mail and sets a password.
-- A Director or Executive Director then makes the separate human approval
-- decision. Until that happens the authenticated account can read only its own
-- profile, and the live shell shows the review notice instead of the app.

begin;

-- Keep the Guide recommendation on the profile until approval. Creating the
-- pairing while the account is pending would let the two accounts reach each
-- other through pairing RLS before the Director had made the access decision.
alter table public.profiles
  add column if not exists recommended_by uuid references public.profiles (id) on delete set null;
alter table public.profiles
  add column if not exists recommended_at timestamptz;

-- The Edge Function checks these rules for a friendly error. This trigger is
-- the real boundary: it also covers a caller who skips the app and writes to
-- the Data API directly.
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

  if new.role = 'executive' then
    raise exception 'Executive Directors are appointed, not invited' using errcode = '42501';
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

drop trigger if exists validate_invite_privilege on public.invites;
create trigger validate_invite_privilege
  before insert or update on public.invites
  for each row execute function public.validate_invite_privilege();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite
  from public.invites
  where lower(btrim(email)) = lower(btrim(new.email))
    and redeemed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  insert into public.profiles (
    id, full_name, role, church_id, is_approved, recommended_by, recommended_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, ''),
    coalesce(v_invite.role, 'ds'),
    v_invite.church_id,
    false,
    v_invite.recommended_by,
    case when v_invite.recommended_by is not null then now() end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.invites set redeemed_at = now() where id = v_invite.id;

  end if;

  return new;
end;
$$;

-- A Director may approve Guides and Explorers in their own church. Only an
-- Executive Director may approve a Director. No signed-in account may create
-- or promote another Executive Director; the first one is bootstrapped by the
-- project owner in SQL.
create or replace function public.lock_privileged_profile_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
begin
  -- SQL administration and the server-side service role remain able to perform
  -- deliberate bootstrap and recovery work. Neither is available in a browser.
  if v_uid is null then return new; end if;

  select role into v_role from public.profiles where id = v_uid;

  if new.id = v_uid then
    if new.role is distinct from old.role
       or new.is_approved is distinct from old.is_approved
       or new.church_id is distinct from old.church_id
       or new.is_head_executive is distinct from old.is_head_executive then
      raise exception 'You cannot change your own role, church or approval'
        using errcode = '42501';
    end if;
  elsif v_role not in ('admin', 'executive') then
    new.role              := old.role;
    new.is_approved       := old.is_approved;
    new.church_id         := old.church_id;
    new.is_head_executive := old.is_head_executive;
  elsif v_role = 'admin' and (old.role not in ('dm', 'ds') or new.role not in ('dm', 'ds')) then
    raise exception 'Only an Executive Director may manage a Director'
      using errcode = '42501';
  elsif new.role = 'executive' and old.role <> 'executive' then
    raise exception 'Executive Directors are appointed outside the app'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- A recommended Explorer is paired only after the human approval decision.
create or replace function public.pair_recommended_explorer_after_approval()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not old.is_approved
     and new.is_approved
     and new.role = 'ds'
     and new.recommended_by is not null then
    insert into public.pairings (dm_id, ds_id, journey_stage, created_by)
    values (new.recommended_by, new.id, 'connect', (select auth.uid()))
    on conflict (ds_id, dm_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists pair_recommended_explorer_after_approval on public.profiles;
create trigger pair_recommended_explorer_after_approval
  after update of is_approved on public.profiles
  for each row execute function public.pair_recommended_explorer_after_approval();

commit;
