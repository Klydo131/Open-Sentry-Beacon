-- A notification reaches the phone, not just the screen it was made on.
--
-- ---------------------------------------------------------------------------
-- REPORTED: "notifications still doesn't work to all devices."
--
-- WHY A TRIGGER AND NOT A LINE OF JAVASCRIPT. Every notification in this app is
-- already a row in `notifications`, written from a dozen places: a Guide
-- messages an Explorer, a report is filed, a Director appoints somebody, a
-- study is published. Pushing from the browser would mean finding all dozen and
-- remembering the thirteenth, forever, and would only work when the person who
-- caused the notification happened to have a tab open at the time.
--
-- A notification arrives on a phone because it was CREATED. That is the whole
-- of the design, and it is why this lives next to the data rather than next to
-- a button.
--
-- WHY IT CANNOT BLOCK ANYTHING. `net.http_post` queues the request and returns;
-- pg_net delivers it out of band. So a push service having a bad afternoon
-- slows nothing down, and the exception handler at the bottom means that even
-- an outright failure inside this function leaves the notification itself
-- written. A notification that did not reach a lock screen is a nuisance; one
-- that was never saved because the lock screen was unreachable is a bug.
--
-- THE TWO SECRETS ARE NOT IN THIS FILE, AND MUST NOT BE. This repository is
-- public. The function reads them from the church's own Vault by name, so the
-- migration can be read by anybody and still be useless to them. Until they are
-- set, this does nothing at all and says so in the catalogue below rather than
-- failing: a church that has not set up push yet keeps working exactly as
-- before.
--
-- To switch it on, once, in the SQL editor:
--
--   select vault.create_secret('<service role key>', 'notify_service_key');
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/notify',
--                              'notify_function_url');
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.push_a_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  service_key text;
  function_url text;
  target text;
begin
  -- A CHURCH THAT HAS NOT SET THIS UP IS NOT BROKEN. Both secrets absent means
  -- push is not configured, and the notification is saved exactly as it always
  -- was. No error, no noise in the log, no half-state.
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'notify_service_key' limit 1;
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'notify_function_url' limit 1;

  if service_key is null or function_url is null then
    return new;
  end if;

  -- WHERE TAPPING IT SHOULD LAND. The row already carries a `data` blob with a
  -- screen in it for the in-app bell; the same value serves here. Anything that
  -- is not a path within this app is refused in favour of home -- the service
  -- worker refuses it a second time, because a notification payload choosing
  -- the SITE rather than the SCREEN is the one way a push can do real harm.
  target := coalesce(new.data->>'url', new.data->>'href', '/');
  if target !~ '^/[^/]' and target <> '/' then
    target := '/';
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'owner_id', new.user_id,
      'title', new.title,
      'body', new.body,
      'url', target
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  -- THE NOTIFICATION IS THE POINT; THE PUSH IS THE COURTESY. Anything that goes
  -- wrong here is swallowed so the row is still written and the bell still
  -- lights up the next time the person opens the app.
  return new;
end;
$$;

revoke all on function public.push_a_notification() from public, anon, authenticated;

drop trigger if exists notifications_reach_devices on public.notifications;
create trigger notifications_reach_devices
  after insert on public.notifications
  for each row execute function public.push_a_notification();
