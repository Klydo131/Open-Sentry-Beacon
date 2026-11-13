-- The security record cannot be quietly rewritten, and a tripwire says when
-- somebody is reaching around the app.
--
-- ---------------------------------------------------------------------------
-- WHY (9 November 2026, asked for as.). `security_audit_events` is what a church's leaders read when
-- something has gone wrong: who suspended whom, who opened a message history,
-- who removed a post. It was already closed to everybody but the database's
-- own functions. Two things were still true of it:
--
--   * somebody with the database's own keys (a leaked service key, a
--     careless operator) could edit or delete a line, and nothing would show
--     that it had ever said anything else;
--   * somebody probing the data API with a stolen session, or an insider
--     scripting against it, left no sign in that record at all.
--
-- SO, TWO THINGS:
--
-- 1. A CHAIN. Every line now carries a SHA-256 hash of its own content and of
--    the line before it in the same church: the method a bank's ledger or a
--    certificate log uses. Change one word of one line, or remove one, and
--    every line after it no longer adds up. `security_record_check(church)`
--    walks the chain and says whether it is whole, and if not, where it first
--    breaks; a church's Director or Executive Director may run it. Lines
--    cannot be edited at all, and cannot be deleted except by the database
--    itself when a whole church is removed. The account columns may still be
--    cleared when an account is deleted (they are not in the hash), so the
--    record still outlives the person, as 20260908072146 promised.
--
--    What it cannot stop: an operator who switches the triggers off and
--    rewrites every hash from the break onwards. `security_record_seal`
--    gives the latest line's number and hash; written down outside the
--    database (a printout, an email to oneself), it proves the record up to
--    that line was never rewritten after.
--
-- 2. A TRIPWIRE. `export_all_members()` looks like the most valuable function
--    an attacker could find, and no screen in the app calls it. Calling it
--    returns nothing, and records who called and when: in the church's
--    security record, as urgent, for a signed-in caller; in a private list
--    nobody else can read, for anybody else. Only a person writing their own
--    requests against the database ever calls it. (In a public repository
--    its purpose is no secret to somebody who reads this file first; it is
--    for the many who do not: scanners, stolen sessions, scripts.)
--
-- Existing lines are chained in order as of this update; the chain proves
-- what happens to them from now on.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

-- 1. THE CHAIN -----------------------------------------------------------------

alter table public.security_audit_events
  add column if not exists chain_seq bigint,
  add column if not exists prev_hash bytea,
  add column if not exists row_hash  bytea;

-- What a line says, in one fixed form. The account ids are left out on
-- purpose: the database clears them when an account is deleted, and the
-- names beside them keep what was said.
create or replace function private.security_line_text(e public.security_audit_events)
returns text language sql immutable set search_path = '' as $$
  select concat_ws(chr(31),
    e.id::text, e.church_id::text, e.chain_seq::text,
    e.event_type, e.severity, e.summary,
    e.subject_name, coalesce(e.subject_role, ''),
    e.actor_name, coalesce(e.actor_role, ''),
    to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

create or replace function private.security_line_hash(prev bytea, e public.security_audit_events)
returns bytea language sql immutable set search_path = '' as $$
  select sha256(coalesce(prev, '\x'::bytea) || convert_to(private.security_line_text(e), 'UTF8'))
$$;

-- Chain the lines already there, church by church, oldest first.
do $$
declare
  c uuid;
  r public.security_audit_events;
  prev bytea;
  n bigint;
begin
  for c in select distinct church_id from public.security_audit_events loop
    prev := null;
    n := 0;
    for r in
      select * from public.security_audit_events
       where church_id = c
       order by occurred_at, id
    loop
      n := n + 1;
      r.chain_seq := n;
      r.prev_hash := prev;
      r.row_hash := private.security_line_hash(prev, r);
      update public.security_audit_events
         set chain_seq = r.chain_seq, prev_hash = r.prev_hash, row_hash = r.row_hash
       where id = r.id;
      prev := r.row_hash;
    end loop;
  end loop;
end $$;

alter table public.security_audit_events
  alter column chain_seq set not null,
  alter column row_hash set not null;

create unique index if not exists security_audit_events_chain_idx
  on public.security_audit_events (church_id, chain_seq);

-- A new line joins the end of its church's chain. One line at a time per
-- church (an advisory lock for the length of the transaction), so two lines
-- written at once cannot both claim the same place.
create or replace function private.security_line_joins_the_chain()
returns trigger language plpgsql set search_path = '' as $$
declare
  last public.security_audit_events;
begin
  perform pg_advisory_xact_lock(hashtextextended('security-record:' || new.church_id::text, 0));
  select * into last
    from public.security_audit_events
   where church_id = new.church_id
   order by chain_seq desc
   limit 1;
  new.chain_seq := coalesce(last.chain_seq, 0) + 1;
  new.prev_hash := last.row_hash;
  new.occurred_at := coalesce(new.occurred_at, now());
  new.row_hash := private.security_line_hash(new.prev_hash, new);
  return new;
end $$;

drop trigger if exists security_line_joins_the_chain on public.security_audit_events;
create trigger security_line_joins_the_chain
  before insert on public.security_audit_events
  for each row execute function private.security_line_joins_the_chain();

-- A line is never edited. The database may clear its account columns when an
-- account is deleted (on delete set null); nothing else changes.
create or replace function private.security_line_is_not_edited()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.church_id, new.chain_seq, new.prev_hash, new.row_hash,
      new.event_type, new.severity, new.summary,
      new.subject_name, new.subject_role, new.actor_name, new.actor_role, new.occurred_at)
     is distinct from
     (old.id, old.church_id, old.chain_seq, old.prev_hash, old.row_hash,
      old.event_type, old.severity, old.summary,
      old.subject_name, old.subject_role, old.actor_name, old.actor_role, old.occurred_at)
  or (new.subject_id is distinct from old.subject_id and new.subject_id is not null)
  or (new.actor_id is distinct from old.actor_id and new.actor_id is not null) then
    raise exception 'A line of the security record is never edited.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists security_line_is_not_edited on public.security_audit_events;
create trigger security_line_is_not_edited
  before update on public.security_audit_events
  for each row execute function private.security_line_is_not_edited();

-- A line is never deleted, except by the database removing a whole church
-- (its cascade arrives from inside another trigger).
create or replace function private.security_line_is_not_deleted()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'A line of the security record is never deleted.' using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists security_line_is_not_deleted on public.security_audit_events;
create trigger security_line_is_not_deleted
  before delete on public.security_audit_events
  for each row execute function private.security_line_is_not_deleted();

-- Walk a church's chain: how many lines, and the first that does not add up.
-- VOLATILE, though it changes nothing, on purpose: the app keeps a copy of a
-- STABLE function's answer to show with no signal (lib/live/kept.ts), and a
-- check of the record must always be asked of the record itself, never read
-- back from a copy made before somebody changed it.
create or replace function public.security_record_check(p_church uuid)
returns table (lines bigint, intact boolean, first_break bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.security_audit_events;
  prev bytea := null;
  n bigint := 0;
  broken bigint := null;
begin
  if (select auth.uid()) is not null and not public.manages_church(p_church) then
    raise exception 'Only this church''s leaders may check its security record.' using errcode = '42501';
  end if;
  for r in
    select * from public.security_audit_events
     where church_id = p_church
     order by chain_seq
  loop
    n := n + 1;
    if broken is null and (
         r.chain_seq <> n
      or r.prev_hash is distinct from prev
      or r.row_hash is distinct from private.security_line_hash(prev, r)) then
      broken := r.chain_seq;
    end if;
    prev := r.row_hash;
  end loop;
  return query select n, broken is null, broken;
end $$;

-- The latest line's place and hash: written down outside the database, proof
-- the record up to it was not rewritten later. VOLATILE for the same reason
-- as the check: a seal is only worth writing down if it is the latest.
create or replace function public.security_record_seal(p_church uuid)
returns table (lines bigint, seal text, sealed_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.manages_church(p_church) then
    raise exception 'Only this church''s leaders may seal its security record.' using errcode = '42501';
  end if;
  return query
    select e.chain_seq, encode(e.row_hash, 'hex'), now()
      from public.security_audit_events e
     where e.church_id = p_church
     order by e.chain_seq desc
     limit 1;
end $$;

revoke all on function private.security_line_text(public.security_audit_events) from public, anon, authenticated;
revoke all on function private.security_line_hash(bytea, public.security_audit_events) from public, anon, authenticated;
revoke all on function private.security_line_joins_the_chain() from public, anon, authenticated;
revoke all on function private.security_line_is_not_edited() from public, anon, authenticated;
revoke all on function private.security_line_is_not_deleted() from public, anon, authenticated;
revoke all on function public.security_record_check(uuid) from public, anon;
revoke all on function public.security_record_seal(uuid) from public, anon;
grant execute on function public.security_record_check(uuid) to authenticated;
grant execute on function public.security_record_seal(uuid) to authenticated;

-- 2. THE TRIPWIRE --------------------------------------------------------------

alter table public.security_audit_events
  drop constraint if exists security_audit_events_event_type_check;
alter table public.security_audit_events
  add constraint security_audit_events_event_type_check check (event_type in (
    'profile_change', 'identity_change', 'safeguarding_report',
    'account_suspended', 'account_restored', 'account_removed',
    'approval_changed', 'guild_post_removed', 'message_history_read',
    'tripwire_touched'
  ));

-- Callers with no church to tell: a visitor with the public key, or an account
-- not yet in a church. Readable by nobody but the database's operator.
create table if not exists private.tripwire_hits (
  id         bigint generated always as identity primary key,
  touched    text not null,
  caller     uuid,
  signed_in  boolean not null,
  user_agent text,
  at         timestamptz not null default now()
);
revoke all on private.tripwire_hits from public, anon, authenticated;
create index if not exists tripwire_hits_at_idx on private.tripwire_hits (at);

create or replace function public.export_all_members()
returns table (id uuid, full_name text, email text, phone text, role text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  who uuid := (select auth.uid());
  me public.profiles;
  agent text;
begin
  begin
    agent := left(coalesce(current_setting('request.headers', true)::json ->> 'user-agent', ''), 200);
  exception when others then agent := null;
  end;

  -- BOUNDED, because bait anybody may call is also a way to fill the database
  -- by calling it in a loop. At most 60 hits are written down an hour, and
  -- a hit is kept for 90 days, so the list never holds more than about 130,000
  -- small rows. The first calls of any burst are the ones that matter.
  delete from private.tripwire_hits where at < now() - interval '90 days';
  if (select count(*) from private.tripwire_hits where at > now() - interval '1 hour') < 60 then
    insert into private.tripwire_hits (touched, caller, signed_in, user_agent)
    values ('export_all_members', who, who is not null, agent);
  end if;

  -- The church's record is never trimmed, so an account is written into it at
  -- most once an hour: enough to be seen, not enough to bury the rest.
  if who is not null and not exists (
       select 1 from public.security_audit_events e
        where e.actor_id = who and e.event_type = 'tripwire_touched'
          and e.occurred_at > now() - interval '1 hour') then
    select * into me from public.profiles p where p.id = who;
    if me.church_id is not null and me.role is not null then
      insert into public.security_audit_events (
        church_id, subject_id, subject_name, subject_role,
        actor_id, actor_name, actor_role, event_type, severity, summary)
      values (
        me.church_id, who, coalesce(nullif(me.full_name, ''), 'An account'), me.role::text,
        who, coalesce(nullif(me.full_name, ''), 'An account'), me.role::text,
        'tripwire_touched', 'urgent',
        'This account asked the database for every member''s details through a function no screen in the app uses. '
        || 'Only somebody writing their own requests against the database does that. Nothing was given.');
    end if;
  end if;

  return;
end $$;

-- Open to everybody on purpose, unlike every other new function: it is bait.
revoke all on function public.export_all_members() from public;
grant execute on function public.export_all_members() to anon, authenticated;

commit;
