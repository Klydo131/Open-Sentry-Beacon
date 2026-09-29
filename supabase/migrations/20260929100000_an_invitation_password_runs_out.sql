-- The password an invitation e-mails runs out, and only that password.
--
-- ---------------------------------------------------------------------------
-- ASKED ON 29 SEPTEMBER 2026, in these words:
--
--   "If access to user's password is changed, can I still access the account
--    in the invitation letter? Hackers might exploit that system in the long
--    run if they saw the code in the open source code. We must find a better
--    security system where the user is in control with it's data and password
--    security even if everyone can the the open source code and systems."
--
-- WHAT WAS TRUE. Changing a password replaces its hash, so the password in the
-- letter stops signing anybody in the moment the person chooses their own. But
-- two things were not closed:
--
--   1. A letter nobody acted on worked FOREVER. The invitation made the
--      account with a password in it, and the only thing asking the person to
--      change it was a reminder flag they (or anybody signed in as them) could
--      switch off. Every inbox that ever held the letter, every forward, and the
--      Director who saw it on screen held a key with no end date.
--   2. A device already signed in with the letter stayed signed in after the
--      password was changed. That half is fixed in the app (lib/live/data.ts
--      signs out every other device when a password is chosen).
--
-- WHAT THIS DOES. The password an invitation sets now lasts seven days. After
-- that the database replaces it with one nobody knows and signs out every
-- device that used it, so the letter is only a way in for a week. Somebody who
-- missed the week taps "Forgot your password" and chooses their own, which is
-- the person in control; a Director can re-send to anybody who never signed in.
--
-- WHY IT CANNOT HURT A PASSWORD SOMEBODY CHOSE. The reminder flag is not
-- trustworthy (the reset-by-e-mail door never cleared it, and anybody can clear
-- it), so this does not read it. It keeps the HASH the invitation set, and on
-- the day it runs out it acts only if the account still has exactly that hash.
-- A password changed by any door -- the Password page, a reset e-mail, an
-- admin -- has a different hash, and nothing happens to it.
--
-- WHY THE CODE BEING PUBLIC DOES NOT MATTER HERE. Nothing below is a secret.
-- The table is readable by no browser at all, the functions that write it are
-- the service role's only, and the one a member may call answers about
-- themselves alone. Knowing exactly how this works tells an attacker that an
-- old letter is useless, which is the point.
--
-- NOBODY ALREADY INVITED IS STARTED ON A CLOCK HERE. On the day this was
-- written 40 accounts were still flagged as using their e-mailed password,
-- including the owner's own. Starting them without the owner's word could lock
-- the owner out of their own account, so this migration applies to invitations
-- sent from now on, and docs/SECURITY.md says how to include the rest.
-- ---------------------------------------------------------------------------

begin;

-- Where the week is counted. pg_cron is preloaded on every Supabase project;
-- this only switches it on.
create extension if not exists pg_cron;

create table if not exists public.temporary_passwords (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- The hash as the invitation left it, to tell its password from a new one.
  hash       text not null,
  set_at     timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.temporary_passwords is
  'An invitation password that has not been replaced yet, and when it runs out. No browser can read or write it.';

alter table public.temporary_passwords enable row level security;
-- No policies at all, on purpose: RLS with nothing allowed. And no grants.
revoke all on table public.temporary_passwords from public, anon, authenticated;
grant select, insert, update, delete on table public.temporary_passwords to service_role;

-- The invitation calls this right after it sets the password. Seven days is
-- the one number to change, here, if a church wants another.
create or replace function public.start_temporary_password(p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  ends timestamptz := now() + interval '7 days';
  current_hash text;
begin
  select u.encrypted_password into current_hash from auth.users u where u.id = p_user;
  if current_hash is null or current_hash = '' then
    return null;
  end if;
  insert into public.temporary_passwords (user_id, hash, set_at, expires_at)
  values (p_user, current_hash, now(), ends)
  on conflict (user_id) do update
    set hash = excluded.hash, set_at = excluded.set_at, expires_at = excluded.expires_at;
  return ends;
end;
$$;

revoke all on function public.start_temporary_password(uuid) from public, anon, authenticated;
grant execute on function public.start_temporary_password(uuid) to service_role;

-- When the invitation password runs out, for the person it belongs to, so the
-- app can say the date. Null once they have chosen their own, whichever door
-- they used, because the hash no longer matches.
create or replace function public.my_temporary_password_ends()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select t.expires_at
  from public.temporary_passwords t
  join auth.users u on u.id = t.user_id
  where t.user_id = (select auth.uid())
    and u.encrypted_password = t.hash;
$$;

revoke all on function public.my_temporary_password_ends() from public, anon;
grant execute on function public.my_temporary_password_ends() to authenticated;

-- Choosing any new password ends the week early: the row goes, so nothing is
-- left to run out. Fired by every door that changes a password, because they
-- all end in the same column.
create or replace function public.a_chosen_password_ends_the_letter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from public.temporary_passwords t
    where t.user_id = new.id and t.hash is distinct from new.encrypted_password;
  end if;
  return new;
end;
$$;

revoke all on function public.a_chosen_password_ends_the_letter() from public, anon, authenticated;

drop trigger if exists a_chosen_password_ends_the_letter on auth.users;
create trigger a_chosen_password_ends_the_letter
  after update of encrypted_password on auth.users
  for each row execute function public.a_chosen_password_ends_the_letter();

-- The week is up: a password nobody knows, and every device signed out. Only
-- where the account still has the invitation's hash.
create or replace function public.end_expired_temporary_passwords()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer := 0;
  r record;
begin
  for r in
    select t.user_id
    from public.temporary_passwords t
    join auth.users u on u.id = t.user_id
    where t.expires_at <= now()
      and u.encrypted_password = t.hash
    for update of t skip locked
  loop
    update auth.users
       set encrypted_password = extensions.crypt(
             encode(extensions.gen_random_bytes(32), 'hex'),
             extensions.gen_salt('bf'))
     where id = r.user_id;
    -- Refresh tokens belong to sessions and go with them.
    delete from auth.sessions where user_id = r.user_id;
    ended := ended + 1;
  end loop;
  -- Rows whose password was changed some other way have nothing left to do.
  delete from public.temporary_passwords where expires_at <= now();
  return ended;
end;
$$;

revoke all on function public.end_expired_temporary_passwords() from public, anon, authenticated;

-- Every hour, at a minute nobody else is using. Scheduling by name replaces a
-- job of the same name, so running this again does not add a second one.
select cron.schedule(
  'invitation-passwords-run-out',
  '17 * * * *',
  'select public.end_expired_temporary_passwords()'
);

commit;
