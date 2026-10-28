-- What somebody agreed to is recorded, and the church is named in the notice.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 28 October 2026: "update our UI for agreeing on 'Terms' and
-- 'Privacy Policy'. I want all of those to be handled professionally so that
-- we won't face any legalities in the future." The owner chose to do it in
-- this app, and that a church's legal name and Data Protection Officer are a
-- setting its Director fills in, so no person's name goes into the public
-- source.
--
-- WHAT WAS AGREED, AND WHEN. Each profile now records the version of the Terms
-- of Use and of the Privacy Notice its person agreed to (lib/legal.ts names
-- the current ones), and when. The time is the database's: a trigger stamps
-- it whenever a version changes, so a phone with a wrong clock cannot date an
-- agreement. Only the person themself can agree: anybody else's attempt to
-- change these columns is refused. (`consent_at`, the permission to
-- keep sensitive information, stays its own column and its own question.)
--
-- THE CHURCH, NAMED. `churches` gains the church's legal name and registered
-- address and its Data Protection Officer's name and email (the two blanks the
-- privacy notice carried until now), written by its Director under the
-- existing churches_write rule. A privacy notice must be readable before
-- somebody signs in, so `church_privacy_contact(church)` answers those, and
-- the church's name, to anybody holding the church's id; nothing else about
-- the church, and nothing about any person in it but the officer the law
-- requires it to name.
--
-- NOT LEGAL ADVICE. The documents these record agreement to are drafts for a
-- lawyer to read (docs/DATA-PROTECTION.md).
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

alter table public.profiles
  add column if not exists terms_version   text,
  add column if not exists privacy_version text,
  add column if not exists terms_agreed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_agreement_versions_short;
alter table public.profiles add constraint profiles_agreement_versions_short
  check ((terms_version is null or length(terms_version) <= 40)
     and (privacy_version is null or length(privacy_version) <= 40));

comment on column public.profiles.terms_version is
  'The Terms of Use this person agreed to (lib/legal.ts TERMS_VERSION). Only they can set it.';
comment on column public.profiles.privacy_version is
  'The Privacy Notice this person agreed to (lib/legal.ts PRIVACY_VERSION). Only they can set it.';
comment on column public.profiles.terms_agreed_at is
  'When they agreed, by the database clock. Stamped by a trigger, never by a client.';

create or replace function private.profiles_agreement_is_their_own()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  who uuid := (select auth.uid());
begin
  -- A statement with no signed-in user is the church's operator at the
  -- database (or the server's own role), who may correct a record.
  if who is null then
    return new;
  end if;
  -- Somebody else's agreement is not theirs to give, in the words the guard
  -- on the rest of a profile uses (aa_guard_profile_writes).
  if who is distinct from new.id then
    if new.terms_version is distinct from old.terms_version
      or new.privacy_version is distinct from old.privacy_version
      or new.terms_agreed_at is distinct from old.terms_agreed_at then
      raise exception 'Somebody else''s agreement is theirs to give.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  -- Your own: the time is the database's whenever a version changes, and
  -- otherwise stays as it was.
  if new.terms_version is distinct from old.terms_version
    or new.privacy_version is distinct from old.privacy_version then
    new.terms_agreed_at := now();
  else
    new.terms_agreed_at := old.terms_agreed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_agreement_is_their_own on public.profiles;
create trigger profiles_agreement_is_their_own before update on public.profiles
  for each row execute function private.profiles_agreement_is_their_own();
revoke all on function private.profiles_agreement_is_their_own() from public, anon, authenticated;

-- The profile's update grant names each column the app writes
-- (20261007130000); without these two the whole update is refused, consent and
-- all. `terms_agreed_at` is not granted: only the trigger writes it.
grant update (terms_version, privacy_version) on public.profiles to authenticated;

alter table public.churches
  add column if not exists legal_name    text,
  add column if not exists legal_address text,
  add column if not exists dpo_name      text,
  add column if not exists dpo_email     text;

alter table public.churches drop constraint if exists churches_legal_identity_shape;
alter table public.churches add constraint churches_legal_identity_shape
  check ((legal_name is null or length(btrim(legal_name)) between 1 and 200)
     and (legal_address is null or length(btrim(legal_address)) between 1 and 300)
     and (dpo_name is null or length(btrim(dpo_name)) between 1 and 120)
     and (dpo_email is null or (length(dpo_email) <= 200 and dpo_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')));

comment on column public.churches.legal_name is
  'The church''s registered legal name, as its Privacy Notice and Terms of Use name it.';
comment on column public.churches.legal_address is
  'Where the church is registered, as its Privacy Notice and Terms of Use give it.';
comment on column public.churches.dpo_name is
  'Its Data Protection Officer, whom the Data Privacy Act requires the notice to name.';
comment on column public.churches.dpo_email is
  'Where privacy questions and requests go.';

-- Readable before sign-in, because the notice must be. Only what a privacy
-- notice is required to say. (Dropped first: a function's columns cannot be
-- changed in place.)
drop function if exists public.church_privacy_contact(uuid);
create function public.church_privacy_contact(p_church uuid)
returns table (name text, legal_name text, legal_address text, dpo_name text, dpo_email text)
language sql stable security definer set search_path to 'public' as $$
  select c.name, c.legal_name, c.legal_address, c.dpo_name, c.dpo_email
    from public.churches c
   where c.id = p_church;
$$;
revoke all on function public.church_privacy_contact(uuid) from public;
grant execute on function public.church_privacy_contact(uuid) to anon, authenticated;

commit;
