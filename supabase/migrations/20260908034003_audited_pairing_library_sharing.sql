-- BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.
--
-- Applied to the live database as `audited_pairing_library_sharing` and never committed,
-- so a fresh install from this repository had none of the pairing-level library
-- controls the app calls: share_library_link, set_pairing_library_sharing,
-- library_pairing_controls, library_sharing_status.
--
-- Everything below the rule is the applied text, byte for byte: its md5 was
-- checked against supabase_migrations.schema_migrations before it was
-- committed. The live text ends in one stray carriage return, which
-- .gitattributes (eol=lf) strips on commit; that trailing byte is the only
-- difference. It is already in the live database, which records migrations by
-- the time they ran, so this file changes nothing there. It exists so that a
-- fresh database built from this repository is the same database.
-- ---------------------------------------------------------------------------
-- Pairing-level safety for the audited church library, applied after its canonical ledger.
--
-- Migration 20260901090000 already provides the canonical 30-day activity
-- ledger and person-level block used by Directors. This migration deliberately
-- extends that system instead of creating a second audit feed:
--
--   * a Guide and Explorer can share a private link atomically;
--   * a Director can mark one pairing "Not allowed to share";
--   * an open Court trial involving either participant pauses that pairing;
--   * new links cannot disguise their real host with URL user-info.

begin;

create table if not exists public.pairing_library_permissions (
  pairing_id       uuid primary key references public.pairings (id) on delete cascade,
  sharing_allowed  boolean not null default true,
  reason           text check (reason is null or length(reason) <= 1000),
  updated_by       uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);

create index if not exists pairing_library_permissions_updated_idx
  on public.pairing_library_permissions (updated_at desc);

alter table public.pairing_library_permissions enable row level security;
revoke all on table public.pairing_library_permissions from public, anon, authenticated;

-- Existing suspicious addresses remain available to the Director's plain-text
-- activity ledger, but the browser refuses to make them clickable. The NOT
-- VALID constraint still protects every new or edited row without breaking a
-- migration because of historical data.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_external_url_no_userinfo'
  ) then
    alter table public.materials
      add constraint materials_external_url_no_userinfo
      check (external_url ~* '^https?://[^[:space:]/?#@]+(?::[0-9]+)?(?:[/?#]|$)')
      not valid;
  end if;
end;
$$;

-- One authorization answer for both direct material shares and the atomic
-- private-link RPC. A report alone never changes permission: only an open
-- trial whose subject is one of the paired people does.
create or replace function public.pairing_can_share_library(p_pairing uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1
    from public.pairings as pairing
    join public.profiles as guide on guide.id = pairing.dm_id
    join public.profiles as explorer on explorer.id = pairing.ds_id
    where pairing.id = p_pairing
      and pairing.status = 'active'
      and (pairing.dm_id = (select auth.uid()) or pairing.ds_id = (select auth.uid()))
      and guide.is_approved and guide.suspended_at is null
      and explorer.is_approved and explorer.suspended_at is null
      and guide.church_id is not distinct from explorer.church_id
      and not public.library_blocked(pairing.dm_id)
      and not public.library_blocked(pairing.ds_id)
      and not exists (
        select 1
        from public.pairing_library_permissions as permission
        where permission.pairing_id = pairing.id
          and not permission.sharing_allowed
      )
      and not exists (
        select 1
        from public.trials as trial
        where trial.status = 'open'
          and trial.subject_id in (pairing.dm_id, pairing.ds_id)
      )
  );
$$;

revoke all on function public.pairing_can_share_library(uuid) from public, anon;
grant execute on function public.pairing_can_share_library(uuid) to authenticated;

drop policy if exists shares_create on public.material_shares;
create policy shares_create on public.material_shares
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and public.pairing_can_share_library(pairing_id)
    and public.can_read_material(material_id)
    and exists (
      select 1
      from public.materials as material
      join public.pairings as pairing on pairing.id = pairing_id
      where material.id = material_id
        and material.church_id = public.church_of(pairing.ds_id)
    )
  );

-- A typed link is created unpublished and shared in one transaction. It never
-- becomes a church-wide resource, and a late permission change cannot leave a
-- private orphan between two browser requests.
create or replace function public.share_library_link(
  p_pairing uuid,
  p_title text,
  p_url text,
  p_kind public.material_kind default 'link'
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  actor public.profiles%rowtype;
  pairing public.pairings%rowtype;
  material_id uuid;
  clean_title text := btrim(coalesce(p_title, ''));
  clean_url text := btrim(coalesce(p_url, ''));
begin
  select * into actor from public.profiles where id = (select auth.uid());
  select * into pairing from public.pairings where id = p_pairing;

  if actor.id is null or actor.role not in ('dm', 'ds') then
    raise exception 'Only a Guide or Explorer can share a link in a pairing.' using errcode = '42501';
  end if;
  if pairing.id is null
     or actor.id not in (pairing.dm_id, pairing.ds_id)
     or actor.church_id is distinct from public.church_of(pairing.ds_id) then
    raise exception 'That pairing is not available to you.' using errcode = '42501';
  end if;
  if not public.pairing_can_share_library(p_pairing) then
    raise exception 'Library sharing is not allowed in this pairing right now. Ask your Director if that seems wrong.' using errcode = '42501';
  end if;
  if length(clean_title) not between 1 and 200 then
    raise exception 'Add a short name for this link.';
  end if;
  if clean_url !~* '^https?://[^[:space:]/?#@]+(?::[0-9]+)?(?:[/?#]|$)' then
    raise exception 'Use a complete http:// or https:// address without a hidden username.';
  end if;

  insert into public.materials (
    church_id, added_by, title, kind, external_url, is_published
  ) values (
    actor.church_id, actor.id, clean_title, p_kind, clean_url, false
  ) returning id into material_id;

  insert into public.material_shares (material_id, pairing_id, shared_by)
  values (material_id, p_pairing, actor.id);

  return material_id;
end;
$fn$;

revoke all on function public.share_library_link(uuid, text, text, public.material_kind)
  from public, anon;
grant execute on function public.share_library_link(uuid, text, text, public.material_kind)
  to authenticated;

-- Directors control pairings in their own church. Executive Directors retain
-- their separate responsibility for Director activity and cannot use this RPC
-- to reach through a Director into Guide-Explorer relationships.
create or replace function public.set_pairing_library_sharing(
  p_pairing uuid,
  p_allowed boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  pairing public.pairings%rowtype;
  actor public.profiles%rowtype;
begin
  select * into pairing from public.pairings where id = p_pairing;
  select * into actor from public.profiles where id = (select auth.uid());

  if actor.id is null
     or not actor.is_approved
     or actor.suspended_at is not null
     or actor.role <> 'admin' then
    raise exception 'Only the church Director can change pairing library sharing.' using errcode = '42501';
  end if;
  if pairing.id is null
     or actor.church_id is distinct from public.church_of(pairing.ds_id)
     or actor.church_id is distinct from public.church_of(pairing.dm_id) then
    raise exception 'That pairing is not in your church.' using errcode = '42501';
  end if;

  insert into public.pairing_library_permissions (
    pairing_id, sharing_allowed, reason, updated_by, updated_at
  ) values (
    pairing.id, p_allowed, nullif(btrim(coalesce(p_reason, '')), ''), actor.id, now()
  )
  on conflict (pairing_id) do update
    set sharing_allowed = excluded.sharing_allowed,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  perform public.notify_user(
    pairing.dm_id,
    'library',
    case when p_allowed then 'Library sharing restored' else 'Library sharing paused' end,
    case when p_allowed
      then 'You and your Explorer may share links again.'
      else 'Your Director marked this pairing as not allowed to share links.'
    end
  );
  perform public.notify_user(
    pairing.ds_id,
    'library',
    case when p_allowed then 'Library sharing restored' else 'Library sharing paused' end,
    case when p_allowed
      then 'You and your Guide may share links again.'
      else 'Your Director marked this pairing as not allowed to share links.'
    end
  );

  return 'ok';
end;
$fn$;

create or replace function public.library_sharing_status(p_pairing uuid)
returns table (
  allowed boolean
)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select
    pairing.status = 'active'
      and not coalesce(not permission.sharing_allowed, false)
      and not public.library_blocked(pairing.dm_id)
      and not public.library_blocked(pairing.ds_id)
      and not exists (
        select 1 from public.trials as trial
        where trial.status = 'open'
          and trial.subject_id in (pairing.dm_id, pairing.ds_id)
      )
  from public.pairings as pairing
  left join public.pairing_library_permissions as permission
    on permission.pairing_id = pairing.id
  where pairing.id = p_pairing
    and (
      pairing.dm_id = (select auth.uid())
      or pairing.ds_id = (select auth.uid())
    );
$$;

create or replace function public.library_pairing_controls()
returns table (
  pairing_id uuid,
  guide_name text,
  explorer_name text,
  manually_blocked boolean,
  court_blocked boolean,
  reason text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select
    pairing.id,
    coalesce(guide.full_name, 'Guide'),
    coalesce(explorer.full_name, 'Explorer'),
    coalesce(not permission.sharing_allowed, false),
    exists (
      select 1 from public.trials as trial
      where trial.status = 'open'
        and trial.subject_id in (pairing.dm_id, pairing.ds_id)
    ),
    permission.reason,
    permission.updated_at
  from public.profiles as me
  join public.pairings as pairing on pairing.status = 'active'
  join public.profiles as guide on guide.id = pairing.dm_id
  join public.profiles as explorer on explorer.id = pairing.ds_id
  left join public.pairing_library_permissions as permission
    on permission.pairing_id = pairing.id
  where me.id = (select auth.uid())
    and me.is_approved
    and me.suspended_at is null
    and me.role = 'admin'
    and me.church_id = explorer.church_id
    and guide.church_id = explorer.church_id
  order by guide.full_name, explorer.full_name;
$$;

revoke all on function public.set_pairing_library_sharing(uuid, boolean, text) from public, anon;
revoke all on function public.library_sharing_status(uuid) from public, anon;
revoke all on function public.library_pairing_controls() from public, anon;
grant execute on function public.set_pairing_library_sharing(uuid, boolean, text) to authenticated;
grant execute on function public.library_sharing_status(uuid) to authenticated;
grant execute on function public.library_pairing_controls() to authenticated;

commit;

