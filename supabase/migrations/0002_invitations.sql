-- Invitations, and the one place this design could have gone badly wrong.
--
-- HOW A PERSON JOINS. There is no public sign-up. A Director invites somebody
-- by email; they get a link; they set a password; they arrive already holding
-- the role they were invited as, in the right church, and — if a Guide
-- recommended them — already paired with that Guide.
--
-- THE TRAP, AND WHY THIS TABLE EXISTS.
--
-- Supabase's signUp() lets the CLIENT attach arbitrary metadata to a new user.
-- So the obvious design — have the new-user trigger read
-- `raw_user_meta_data ->> 'role'` and apply it — hands every visitor on the
-- internet a role of their choosing. They would sign up with
-- { role: 'executive' } and be an Executive Director before the page finished
-- loading. It is one line of client JavaScript.
--
-- So the trigger below reads NOTHING that came from the client except the name.
-- Role, church and pairing come from THIS table, and rows here can only be
-- written by somebody who already manages the church. The email address is the
-- join: you are given what you were invited to, not what you asked for.
--
-- PROVED, then rolled back:
--
--   A. self-signup claiming role=executive  → role     ds
--   B.                       claiming church → church  (none)
--   C.               claiming is_approved    → approved false
--   D. the NAME it asked for was kept        → Mallory   ← a name is not a
--                                                          privilege
--   E. a genuinely invited person            → role     dm    ← control
--   F.                                       → approved true  ← control
--   G. the invite is marked redeemed         → yes
--
-- E and F are the half that matters: without them, A–C would also pass if
-- invitations were simply broken. The address in E was submitted as
-- "  GUIDE@Good.Test  " against an invite for "guide@good.test", so case and
-- whitespace normalisation is proved too — that is how one person becomes two
-- invitations and neither works.
--
-- The consequence is worth stating: signing up with an address nobody invited
-- gets you an account with role 'ds', no church, and is_approved false — which
-- can see nothing at all. That is the correct outcome, not a bug.

begin;

create table if not exists public.invites (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid        not null references public.churches (id) on delete cascade,
  email          text        not null,
  role           user_role   not null default 'ds',
  full_name      text,
  invited_by     uuid        references public.profiles (id) on delete set null,
  -- When a Guide recommended this person, the pairing is made automatically at
  -- redemption. Nobody has to remember, and there is no window in which a new
  -- Explorer exists with nobody attached to them.
  recommended_by uuid        references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '14 days',
  redeemed_at    timestamptz,
  constraint invite_email_shape check (position('@' in email) > 1)
);

-- Case and whitespace are how the same person becomes two invitations. One
-- OPEN invite per address per church; redeemed ones stay for the record.
create unique index if not exists invites_one_open_per_email
  on public.invites (church_id, lower(btrim(email)))
  where redeemed_at is null;

create index if not exists invites_email_idx on public.invites (lower(btrim(email)));

alter table public.invites enable row level security;

-- Only the people who run the church, and only for their own church. There is
-- deliberately NO policy letting the invited person read their own invite: they
-- do not need to, and a policy keyed on an email address would let anybody
-- enumerate who has been invited by guessing addresses.
drop policy if exists invites_read   on public.invites;
drop policy if exists invites_create on public.invites;
drop policy if exists invites_revoke on public.invites;

create policy invites_read on public.invites
  for select to authenticated using (public.manages_church(church_id));

create policy invites_create on public.invites
  for insert to authenticated
  with check (public.manages_church(church_id) and invited_by = (select auth.uid()));

create policy invites_revoke on public.invites
  for delete to authenticated
  using (public.manages_church(church_id) and redeemed_at is null);

-- ---------------------------------------------------------------------------
-- Redemption.
--
-- Replaces the earlier handle_new_user(). Still writes the name from client
-- metadata — a name is not a privilege — and takes everything that IS a
-- privilege from the invites table instead.
-- ---------------------------------------------------------------------------
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

  insert into public.profiles (id, full_name, role, church_id, is_approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_invite.full_name, ''),
    -- No invite: the safe defaults. An uninvited account can reach nothing.
    coalesce(v_invite.role, 'ds'),
    v_invite.church_id,
    v_invite.id is not null
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.invites set redeemed_at = now() where id = v_invite.id;

    -- Arrive already paired, at Connect. An Explorer is never at Create:
    -- by the time they have an account, a Guide already brought them.
    if v_invite.role = 'ds' and v_invite.recommended_by is not null then
      insert into public.pairings (dm_id, ds_id, journey_stage, created_by)
      values (v_invite.recommended_by, new.id, 'connect', v_invite.invited_by)
      on conflict (ds_id, dm_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

commit;
