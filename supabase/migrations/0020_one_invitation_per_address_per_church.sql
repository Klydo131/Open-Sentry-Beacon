-- One invitation per address per church, guaranteed by the database.
--
-- The old index was `unique (church_id, lower(btrim(email))) where redeemed_at
-- is null`. Its condition stopped being true the moment an invitation was sent,
-- because that is when the account row — and therefore redeemed_at — is
-- created. So the index policed nothing, and inviting the same person twice
-- inserted a second row rather than raising the conflict the Edge Function was
-- written to catch. The function's whole resend path hung off that conflict, so
-- pressing Re-send found no open invitation, sent nothing, and reported
-- success.
--
-- Unconditional now. Re-inviting somebody refreshes their invitation instead of
-- adding another, which is what the Invitations screen has always claimed to
-- show.
delete from public.invites a
 using public.invites b
 where a.church_id = b.church_id
   and lower(btrim(a.email)) = lower(btrim(b.email))
   and a.created_at < b.created_at;

drop index if exists public.invites_one_open_per_email;

create unique index if not exists invites_one_per_email_per_church
  on public.invites (church_id, lower(btrim(email)));
