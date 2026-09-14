-- "Invited" must mean an invitation was sent.
--
-- REPORTED AS: "what happens to this if it was invite, does it automatically
-- send a letter? How come there was no confirm in my mailbox as a Head ED?"
-- The answer was that nothing had been sent, so there was nothing to confirm.
--
-- decideRecommendation() set this column and stopped. The row then read
-- INVITED, the Guide who put the name forward saw INVITED, and no invitation
-- row, no account and no email existed. Checked against the live table: the
-- only invitation for that address had been created sixteen days earlier and
-- had expired two days before the button was pressed.
--
-- WORSE THAN A NO-OP, because the panel draws only `status = 'pending'`. One
-- click sent nothing, hid the person, AND destroyed the only place their
-- address appeared on any screen -- so the Director could not even invite them
-- by hand afterwards. Reported the moment it happened: "How can I invite if I
-- no longer see the e-mail when I click ok on the recommendation?"
--
-- THE APP IS FIXED IN THE SAME COMMIT: it sends the invitation first and writes
-- the status only if that succeeded. This trigger is the floor under it. The
-- app runs in a browser somebody may not have reloaded for days, and while it
-- is stale the old code is still live and still destroying records. A guard in
-- the database takes effect for everybody at once, and keeps holding if some
-- future caller writes the column directly.
--
-- It refuses rather than silently repairing: the Director sees what did not
-- happen and is told where to go instead, and the card -- with the address on
-- it -- stays where it was.
--
-- Declining is untouched. "Not now" is a decision that needs nothing sent.

begin;

create or replace function private.invited_means_invited()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'invited' and old.status is distinct from 'invited' then
    if not exists (
      select 1 from public.invites i
       where lower(btrim(i.email)) = lower(btrim(new.email))
         and i.created_at > new.created_at
    ) then
      raise exception
        'Nothing was sent, so this has not been marked invited. Invite % from the Invitations screen instead.',
        new.email
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists invited_means_invited on public.recommendations;
create trigger invited_means_invited
  before update on public.recommendations
  for each row execute function private.invited_means_invited();

commit;
