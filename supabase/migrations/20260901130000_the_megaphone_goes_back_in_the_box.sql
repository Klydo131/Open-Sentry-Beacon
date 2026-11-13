-- Nobody calls `notify_user` from a browser, so nobody should be able to.
--
-- `notify_user(user, type, title, body)` writes a row straight into somebody
-- else's notification bell, with a title and a body chosen by the caller. It
-- guards itself against the obvious abuse — its own comment says "without this
-- the function is a megaphone" — by refusing to write to anybody outside the
-- caller's church.
--
-- That check is real, and it is the wrong shape for what the function turned
-- out to be. It asks WHERE the recipient is, never WHO is asking. Any approved
-- member could put any words in front of any other member of their church,
-- under the app's own chrome, and the bell gives those words the app's
-- authority. "Your account needs to be re-verified" is a convincing message
-- when it arrives in the same place as "Your Guide is praying with you."
--
-- The fix is not a better check. It is noticing that the grant was never needed:
-- the browser has no call site at all. The only caller is
-- `prayer_says_somebody_is_praying`, a SECURITY DEFINER trigger, which runs as
-- the owner and does not need the `authenticated` grant to reach it. Taking the
-- grant away removes the whole surface and changes no feature.
--
-- BOTH HALVES WERE PROVED against the live database, in a rolled-back
-- transaction, because a refusal means nothing until the permitted case is
-- shown still working:
--
--   an Explorer calls notify_user() directly            refused 42501
--   a Guide marks a prayer 'praying'                    19 -> 20 notifications
--
-- The first attempt at that control was worthless and looked fine: it updated
-- `praying_at` instead of `status`, which is what the trigger actually keys on,
-- so it recorded "the trigger stopped working" — a failure the revoke had
-- nothing to do with. Re-running the same control WITHOUT the revoke gave the
-- identical result, which is the only reason it was caught.

begin;

revoke all on function public.notify_user(uuid, text, text, text) from authenticated;

commit;
