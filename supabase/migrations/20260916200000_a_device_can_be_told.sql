-- Where a device says how to reach it, so a notification can arrive when the
-- app is shut.
--
-- ---------------------------------------------------------------------------
-- REPORTED: "notifications still doesn't work to all devices, can we make it
-- work to all devices please. Find a way to make it happen."
--
-- WHAT WAS ACTUALLY WRONG, because "notifications do not work" covers two very
-- different things and only one of them was true. The app already raises real
-- system notifications, and has for a long time. But it raises them ITSELF, in
-- the browser, from data the page already has. That means it can only tell you
-- something while the app is open and running. Close the tab, lock the phone,
-- and nothing can reach you, because nothing is sending: there was no record
-- anywhere of how to reach a device, and nothing that ever tried.
--
-- This table is that record. A device subscribes once, keeps its endpoint here,
-- and the send-notification function posts to it. That is the whole of the
-- difference between a notification you see because you were already looking
-- and one that arrives because somebody needed you.
--
-- WHAT IT DOES NOT FIX, said here because it is a platform rule and not a bug
-- to be worked around: on an iPhone, web push only exists for an app that has
-- been added to the Home Screen, on iOS 16.4 or later. Safari in a tab cannot
-- receive one, whatever this table holds. The app asks people to install it and
-- says why; that is the only lever there is.
--
-- ONE ROW PER DEVICE, NOT PER PERSON. A person has a phone and a laptop and
-- sometimes a shared machine at the church, and each has its own endpoint. The
-- endpoint is the identity: it is unique per browser installation, it is what
-- the push service is addressed by, and it is what goes stale when somebody
-- clears their data. So it is the key, and a device that comes back with a new
-- endpoint simply adds a row rather than fighting an old one.
--
-- AND IT IS NOT A SECRET WORTH KEEPING FOREVER. An endpoint plus its keys lets
-- the holder push to that device and nothing else -- it cannot read anything,
-- cannot sign in as anybody, and stops working the moment the browser rotates
-- it. It is still nobody's business but its owner's, so the policies below are
-- owner-only on all four verbs, exactly like the study room.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  owner_id   uuid not null references public.profiles(id) on delete cascade,

  -- The URL the push service gave this browser. Long, opaque, and the primary
  -- key: two devices never share one, and one device never has two.
  endpoint   text not null,

  -- The two halves of the encryption the Web Push standard requires. Without
  -- them a payload cannot be encrypted for this device and the push is refused
  -- by the service before it ever reaches a phone.
  p256dh     text not null,
  auth       text not null,

  -- Only so somebody can recognise a device in a list and retire the one they
  -- no longer own. Never used to decide anything.
  label      text,

  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  primary key (owner_id, endpoint),

  -- A CEILING, BECAUSE THE FREE TIER IS 500 MB FOR THE WHOLE CHURCH. Endpoints
  -- are long but bounded; anything past this is not a subscription.
  constraint push_subscriptions_endpoint_fits check (length(endpoint) <= 2000)
);

alter table public.push_subscriptions enable row level security;

-- ONE POLICY PER VERB, each naming `authenticated`, and each dropped first so
-- this migration can be run again without failing. A policy with no TO clause
-- also applies to `anon`, which is not what any of these mean.
drop policy if exists push_subscriptions_read on public.push_subscriptions;
create policy push_subscriptions_read
  on public.push_subscriptions for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists push_subscriptions_write on public.push_subscriptions;
create policy push_subscriptions_write
  on public.push_subscriptions for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists push_subscriptions_edit on public.push_subscriptions;
create policy push_subscriptions_edit
  on public.push_subscriptions for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- SOMEBODY MUST BE ABLE TO STOP BEING REACHED. Turning notifications off is not
-- a setting that only hides a switch; it deletes the way to reach the device.
drop policy if exists push_subscriptions_drop on public.push_subscriptions;
create policy push_subscriptions_drop
  on public.push_subscriptions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- The sender reads every row for one person at a time, and only ever by owner.
create index if not exists push_subscriptions_by_owner
  on public.push_subscriptions (owner_id);
