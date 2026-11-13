-- The three storage policies the first sweep missed.
--
-- `close_the_doors_nobody_uses` named the roles on thirteen policies in the
-- public schema and then a new guardrail, reading the migrations rather than
-- the database, found three more it had not looked at: the conversation
-- attachment policies on `storage.objects`, written in 0022 with no `TO`
-- clause. They apply to PUBLIC, and `anon` holds every privilege on
-- `storage.objects` by default, so the signed-out role reaches them.
--
-- It found them because the check was written to sweep every migration instead
-- of the list of tables the audit happened to look at. That is the whole
-- argument for sweeping rather than listing, and it earned its keep on the
-- first run.
--
-- Nothing is leaking through them either, for the same arithmetic reason as
-- before: `in_pairing(...)` and `owner = auth.uid()` are both false when nobody
-- is signed in.
--
-- WHY NOT JUST REVOKE `anon` FROM `storage.objects`, the way the public schema
-- was handled. Because `storage` is Supabase's schema, not this app's. Its
-- grants are part of how the storage service itself serves public buckets and
-- signed URLs, and taking them away is a change whose blast radius is somebody
-- else's code. Naming the roles on our own policies gets the same result for
-- this bucket without touching machinery we do not own.

begin;

alter policy pairing_media_object_read   on storage.objects to authenticated;
alter policy pairing_media_object_add    on storage.objects to authenticated;
alter policy pairing_media_object_remove on storage.objects to authenticated;

commit;
