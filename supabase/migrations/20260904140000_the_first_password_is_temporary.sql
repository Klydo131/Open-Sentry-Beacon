-- Remember that somebody is still using the password their invitation gave them.
--
-- WHY THIS COLUMN EXISTS. The invitation now creates the account with a
-- password already on it and puts that password in the message, because a
-- one-time link expires, is spent by the first mail scanner that opens it, and
-- fails on the second tap -- which is how twenty-three people ended up stuck at
-- once, each holding an account with no password and a dead link.
--
-- The cost of that trade is real and is not hidden: a password sitting in an
-- inbox can be read by anybody who can read that inbox, and it stays true until
-- it is changed. So the app has to be able to ASK. Without somewhere to record
-- "this one came from an email", the reminder would either nag everybody
-- forever or nobody at all.
--
-- IT IS A NUDGE, NOT A GATE, and that is the owner's decision: a strong note
-- to change it, and the choice left to the person. Nothing in the app refuses to work
-- while this is true. It draws a card that can be dismissed and comes back.
--
-- NOT A SECURITY BOUNDARY. Anybody can set this false on their own row without
-- changing their password, and that is fine: it protects nothing and guards
-- nothing. It is a reminder flag, and treating it as more than that would be
-- the mistake. The real protection is that the password is theirs to change and
-- the app tells them so.

begin;

alter table public.profiles
  add column if not exists password_is_temporary boolean not null default false;

comment on column public.profiles.password_is_temporary is
  'True while this person is still using the password their invitation e-mailed them. A reminder flag, not a permission.';

-- Nobody is retro-flagged. Everybody already in the church chose their own
-- password through the old sign-up form, so flagging them would put a reminder
-- in front of 104 people about something they did months ago.

commit;
