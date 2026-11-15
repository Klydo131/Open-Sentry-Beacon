-- A Guide signs their commitments, and leaders can see who has.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 16 NOVEMBER 2026: Guide compliance, simple to do and serious in
-- intent. A Guide walks with people who may be young or vulnerable, so before
-- the work they read a short list of safeguarding commitments (lib/guide-
-- commitments.ts), tick each one, and sign with their own full name. It is
-- renewed every year, and when the list changes its version changes, so a
-- signature always belongs to the words that were actually shown.
--
-- WHAT IS KEPT: who signed, which version, the name they typed, and when.
-- Nothing else. A signature cannot be changed or deleted from the app: there
-- is no update or delete policy, and the only way in is sign_guide_commitments,
-- which signs for the caller and nobody else.
--
-- WHO READS IT: the Guide their own; the Directors and Executive Directors of
-- their church all of them, so a leader can see who has not signed yet.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.guide_commitments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  church_id   uuid not null references public.churches (id) on delete cascade,
  version     text not null check (version ~ '^[a-z0-9-]{1,32}$'),
  signed_name text not null check (length(btrim(signed_name)) between 2 and 120),
  signed_at   timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.guide_commitments is
  'A Guide''s signed safeguarding commitments: who, which version, the name typed and when. Written only by sign_guide_commitments.';

create index if not exists guide_commitments_church on public.guide_commitments (church_id, version);

alter table public.guide_commitments enable row level security;
revoke all on public.guide_commitments from anon, authenticated;
grant select on public.guide_commitments to authenticated;

drop policy if exists guide_commitments_read on public.guide_commitments;
create policy guide_commitments_read on public.guide_commitments for select to authenticated
  using (
    user_id = (select auth.uid())
    or (church_id = (select public.my_church_id()) and ((select public.is_admin()) or (select public.is_executive())))
  );

create or replace function public.sign_guide_commitments(p_version text, p_name text)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_me     uuid := (select auth.uid());
  v_church uuid;
  v_name   text;
  v_at     timestamptz;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select church_id, full_name into v_church, v_name
    from public.profiles
   where id = v_me and is_approved and suspended_at is null
     and role in ('dm', 'admin', 'executive');
  if v_church is null then
    raise exception 'Only an approved Guide or leader signs the Guide commitments.' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[a-z0-9-]{1,32}$' then
    raise exception 'That is not a version of the commitments.';
  end if;
  -- THE NAME IS THE SIGNATURE: it must be the person's own name, as the
  -- church has it, so a tick-through is not mistaken for a commitment.
  if lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
     <> lower(regexp_replace(btrim(coalesce(v_name, '')), '\s+', ' ', 'g')) then
    raise exception 'Type your full name exactly as it appears on your profile.';
  end if;
  insert into public.guide_commitments (user_id, church_id, version, signed_name)
  values (v_me, v_church, p_version, btrim(p_name))
  on conflict (user_id, version) do update set signed_at = now(), signed_name = excluded.signed_name
  returning signed_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.sign_guide_commitments(text, text) from public, anon;
grant execute on function public.sign_guide_commitments(text, text) to authenticated;

commit;
