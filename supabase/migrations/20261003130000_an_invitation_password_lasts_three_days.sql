-- An invitation password lasts three days, not seven.
--
-- ---------------------------------------------------------------------------
-- CHOSEN BY THE OWNER ON 3 OCTOBER 2026, after that day's security audit:
-- "do both options for the password". The password an
-- invitation e-mails is now three words and a number
-- (supabase/functions/invite/password.ts), and it lasts three days. Anybody
-- who can read that mailbox can sign in until the person chooses their own
-- password; a shorter window is less time for that, and less time for anybody
-- guessing.
--
-- WHAT CHANGES. Only how long a NEW invitation's password lasts. Everything
-- else in 20260929100000_an_invitation_password_runs_out.sql stands: the
-- hourly job that ends a password that has run out, the trigger that forgets
-- it once the person chooses their own, and that nobody's chosen password is
-- ever touched.
--
-- WHAT DOES NOT CHANGE: passwords already sent keep the seven days they were
-- promised in their e-mail. Cutting them short would lock out somebody who was
-- told they had a week, with nothing on their screen to say why.
--
-- The grants are stated again because replacing a function in `public` can
-- reset them (lock_new_functions); this one is for the invitation service only.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.start_temporary_password(p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  ends timestamptz := now() + interval '3 days';
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

commit;
