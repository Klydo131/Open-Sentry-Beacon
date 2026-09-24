-- A Guide can ask the people they walk with to pray for them, too.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED FOR: "a feature where both Guide and Explorer can pray [for]
-- each other". Until now prayer ran one way. An Explorer asked, their Guide
-- said "I am praying for this", and the Explorer was told. A Guide carrying
-- something of their own had nowhere to put it.
--
-- THE SHAPE. A request still lives with ONE relationship, and `ds_id` still
-- names the Explorer in it. What is new is `author_id`, who wrote it:
--
--     the Explorer asks            author_id = ds_id = the Explorer
--     their Guide asks them        author_id = the Guide, ds_id = the Explorer
--
-- One row per Explorer a Guide asks, never one row for "all of them". The
-- status is a single value -- one person asks, one person answers "I am
-- praying" -- and a row shared by five Explorers would let the first of them
-- answer for all five while the other four's replies went nowhere. It also
-- means an Explorer paired with this Guide next month does not inherit a
-- history of the Guide's own requests written for other people.
--
-- WHO SEES A REQUEST, written out as the read rule below:
--
--     whoever wrote it, always;
--     the Explorer it was written to, while they still walk with its author;
--     an Explorer's own request, by the Guide(s) walking with them now.
--
-- The third arm is today's rule unchanged. The second is new, and it is narrow
-- on purpose: a second Guide of the same Explorer does not see the first
-- Guide's request, and when a pairing ends the Explorer stops seeing it.
--
-- WHAT EITHER SIDE MAY DO TO THE OTHER'S REQUEST: say "I am praying for this",
-- which moves it from open to praying and tells the author. Nothing else.
-- Whether a prayer was answered is the asker's to say, and a request that is
-- already being prayed for cannot be flipped back to "open" to send the author
-- a second notification. The words never change; the browser has only ever
-- been able to write `status` (20260910090000).
--
-- EITHER SIDE CAN REPORT THE OTHER'S REQUEST, from the request itself
-- (report_prayer_request below). A request is somebody's words arriving on
-- somebody else's screen, which is a room, and AGENTS.md is plain about what a
-- room needs: a report route on the same screen, a named looker who is told,
-- and a record that outlives the people in it. The function copies the words
-- into the report, so a request withdrawn a moment after it was reported still
-- reads in the Director's queue.
--
-- AND BOTH SIDES ARE TOLD WHEN THE OTHER ASKS. The live app never told a Guide
-- that an Explorer had asked (the sample app always did); a Guide learned it
-- from a badge, if they opened the page. Now each ask sends one notification
-- to the other side of the relationship. No prayer text in it: a notification
-- becomes a pop-up on a locked phone, and the thing a person confided is the
-- one thing that must not appear there.
--
-- A SECOND DOOR, CLOSED ON THE WAY. The browser could insert `status`,
-- `praying_at` and `praying_by`, so a row could arrive already "being prayed
-- for" by somebody who never saw it. The insert grant is now the four columns
-- the app writes; the author is filled in by the database from the session and
-- cannot be named by the browser at all.
--
-- PROVEN against the live database in a transaction that was discarded; the
-- figures are in the commit that added this file.
-- ---------------------------------------------------------------------------

begin;

create schema if not exists private;

-- WHO WROTE IT ----------------------------------------------------------------
alter table public.prayer_requests
  add column if not exists author_id uuid references public.profiles (id) on delete cascade;

-- Every request so far was written by the Explorer it belongs to.
update public.prayer_requests set author_id = ds_id where author_id is null;

alter table public.prayer_requests
  alter column author_id set default auth.uid(),
  alter column author_id set not null;

create index if not exists prayer_requests_author_idx
  on public.prayer_requests (author_id, created_at desc);

-- The Explorers the caller guides in an active pairing, while approved: the
-- Guide half of people_i_walk_with(). An Explorer gets nobody from it.
create or replace function private.my_explorers()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.ds_id from public.pairings p
   where p.status = 'active' and p.dm_id = (select auth.uid())
     and (select public.is_approved_user());
$$;

revoke all on function private.my_explorers() from public, anon;
grant execute on function private.my_explorers() to authenticated, service_role;

-- THE RULES -------------------------------------------------------------------
drop policy if exists prayer_read on public.prayer_requests;
create policy prayer_read on public.prayer_requests
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (ds_id = (select auth.uid()) and author_id in (select private.people_i_walk_with()))
    or (author_id = ds_id and ds_id in (select private.my_explorers()))
  );

-- Exactly the people who can read it, and the trigger below decides what they
-- may change it to.
drop policy if exists prayer_update on public.prayer_requests;
create policy prayer_update on public.prayer_requests
  for update to authenticated
  using (
    author_id = (select auth.uid())
    or (ds_id = (select auth.uid()) and author_id in (select private.people_i_walk_with()))
    or (author_id = ds_id and ds_id in (select private.my_explorers()))
  )
  with check (
    author_id = (select auth.uid())
    or (ds_id = (select auth.uid()) and author_id in (select private.people_i_walk_with()))
    or (author_id = ds_id and ds_id in (select private.my_explorers()))
  );

-- Asking for yourself, as before; or a Guide asking one Explorer they walk
-- with. A Guide's request never goes on the church wall: the wall is the
-- asker's own choice about their own words, and a Guide's words to one
-- Explorer are not a notice for the congregation.
drop policy if exists prayer_create on public.prayer_requests;
create policy prayer_create on public.prayer_requests
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and church_id = (select public.my_church_id())
    and (
      ds_id = (select auth.uid())
      or (ds_id in (select private.my_explorers()) and not share_with_church)
    )
  );

-- Only the author withdraws. For every existing row that is the same person
-- as before.
drop policy if exists prayer_delete on public.prayer_requests;
create policy prayer_delete on public.prayer_requests
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- The browser writes these four columns and nothing else on insert.
revoke insert on public.prayer_requests from authenticated;
grant insert (ds_id, church_id, body, share_with_church) on public.prayer_requests to authenticated;

-- WHAT THE OTHER SIDE MAY DO: open -> praying, and nothing else ---------------
create or replace function private.a_prayer_moves_by_its_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (select auth.uid()) is distinct from old.author_id
     and new.status is distinct from old.status
     and not (old.status = 'open' and new.status = 'praying') then
    raise exception 'Only the person who asked can change that.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.a_prayer_moves_by_its_rules() from public, anon, authenticated;

-- Named to sort before prayer_praying_tells_the_author, so a refused change is
-- refused before anybody is told about it.
drop trigger if exists prayer_a_status_moves_by_its_rules on public.prayer_requests;
create trigger prayer_a_status_moves_by_its_rules
  before update of status on public.prayer_requests
  for each row execute function private.a_prayer_moves_by_its_rules();

-- "SOMEBODY IS PRAYING" GOES TO WHOEVER ASKED --------------------------------
create or replace function public.prayer_says_somebody_is_praying()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  who text;
begin
  -- Only the moment it BECOMES praying. Re-saving a row that is already
  -- praying must not send the message again.
  if new.status is distinct from 'praying' or old.status is not distinct from 'praying' then
    return new;
  end if;

  new.praying_at := coalesce(new.praying_at, now());
  new.praying_by := coalesce(new.praying_by, auth.uid());

  -- Marking your OWN request needs no message about it.
  if new.author_id = auth.uid() then
    return new;
  end if;

  select coalesce(nullif(btrim(split_part(full_name, ' ', 1)), ''), 'Someone you walk with')
    into who
  from profiles where id = auth.uid();

  -- NO PRAYER TEXT IN THE MESSAGE: it becomes a pop-up on a locked phone.
  perform notify_user(
    new.author_id,
    'prayer',
    coalesce(who, 'Someone you walk with') || ' is praying with you',
    'They have seen what you asked prayer for.'
  );

  return new;
end;
$$;

-- THE OTHER SIDE IS TOLD THAT SOMEBODY ASKED ---------------------------------
create or replace function private.prayer_asked_tells_the_other_side()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who   text;
  guide uuid;
begin
  select coalesce(nullif(btrim(split_part(p.full_name, ' ', 1)), ''), 'Someone you walk with')
    into who
  from public.profiles p where p.id = new.author_id;
  who := coalesce(who, 'Someone you walk with');

  if new.author_id = new.ds_id then
    -- An Explorer asked: each Guide walking with them now.
    for guide in
      select distinct pr.dm_id from public.pairings pr
       where pr.ds_id = new.ds_id and pr.status = 'active'
    loop
      perform public.notify_user(guide, 'prayer', who || ' asked for prayer',
                                 'Open Prayer in the app to read it.');
    end loop;
  else
    -- A Guide asked one Explorer.
    perform public.notify_user(new.ds_id, 'prayer', who || ' asked you to pray for them',
                               'Open Prayer in the app to read it.');
  end if;
  return new;
end;
$$;

revoke all on function private.prayer_asked_tells_the_other_side() from public, anon, authenticated;

drop trigger if exists prayer_asked_tells_the_other_side on public.prayer_requests;
create trigger prayer_asked_tells_the_other_side
  after insert on public.prayer_requests
  for each row execute function private.prayer_asked_tells_the_other_side();

-- Each ask now sends a notification, so the same ceiling as a conversation.
drop trigger if exists hold_the_pace on public.prayer_requests;
create trigger hold_the_pace
  before insert on public.prayer_requests
  for each row execute function private.hold_the_pace('author_id');

-- ENCOURAGEMENT FOLLOWS THE AUTHOR TOO ----------------------------------------
-- The read rule on prayer_encouragements asks for the request through RLS, so
-- it already follows the new read rule. Its notification did not: it treated
-- ds_id as "whoever asked", which a Guide's request is not.
create or replace function public.prayer_encouragement_notifies_participant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  request public.prayer_requests%rowtype;
  who     text;
  guide   record;
begin
  select * into request from public.prayer_requests where id = new.request_id;
  if request.id is null then
    return new;
  end if;

  if new.author_id = request.author_id then
    if request.author_id = request.ds_id then
      for guide in
        select distinct pairing.dm_id
        from public.pairings pairing
        where pairing.ds_id = request.ds_id
          and pairing.status = 'active'
      loop
        perform public.notify_user(
          guide.dm_id,
          'prayer',
          'A prayer conversation has a new message',
          'Open the private prayer request to read it.'
        );
      end loop;
    else
      perform public.notify_user(
        request.ds_id,
        'prayer',
        'A prayer conversation has a new message',
        'Open the private prayer request to read it.'
      );
    end if;
  else
    select coalesce(nullif(btrim(split_part(full_name, ' ', 1)), ''), 'Someone you walk with')
      into who
    from public.profiles where id = new.author_id;
    perform public.notify_user(
      request.author_id,
      'prayer',
      case when request.author_id = request.ds_id
           then 'Your Guide sent encouragement'
           else coalesce(who, 'Someone you walk with') || ' sent encouragement' end,
      'Open your private prayer request to read it.'
    );
  end if;

  return new;
end;
$$;

-- REPORTING A REQUEST ---------------------------------------------------------
create or replace function private.report_prayer_request(
  p_request uuid,
  p_reason  text,
  p_detail  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me      public.profiles%rowtype;
  v_request public.prayer_requests%rowtype;
  v_pairing uuid;
  v_detail  text;
  v_id      uuid;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'You need an approved account to report somebody.' using errcode = '42501';
  end if;

  select * into v_request from public.prayer_requests where id = p_request;
  -- Only somebody the request was written TO may report it: the Explorer a
  -- Guide asked, or the Guide of an Explorer who asked. The error is the same
  -- whether the request exists or not.
  if v_request.id is null
     or v_request.author_id = v_me.id
     or not (
          (v_request.ds_id = v_me.id
             and v_request.author_id in (select private.people_i_walk_with()))
       or (v_request.author_id = v_request.ds_id
             and v_request.ds_id in (select private.my_explorers()))
     ) then
    raise exception 'That prayer request is not one you can report.' using errcode = '42501';
  end if;
  if p_reason not in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other') then
    raise exception 'Unknown reason.';
  end if;

  select pr.id into v_pairing from public.pairings pr
   where pr.status = 'active'
     and ((pr.dm_id = v_me.id and pr.ds_id = v_request.author_id)
       or (pr.ds_id = v_me.id and pr.dm_id = v_request.author_id))
   limit 1;

  -- THE WORDS GO INTO THE REPORT. A request can be withdrawn a moment after it
  -- is reported; the Director must still be able to read what was said.
  v_detail := concat_ws(
    E'\n\n',
    nullif(btrim(coalesce(p_detail, '')), ''),
    'The prayer request, as it read when it was reported:' || E'\n' || '"' || v_request.body || '"'
  );

  insert into public.reports (church_id, reporter_id, subject_id, pairing_id, reason, detail)
  values (v_request.church_id, v_me.id, v_request.author_id, v_pairing, p_reason, v_detail)
  returning id into v_id;

  -- Every Director, as report_person does. The notification names who
  -- reported and what kind of thing, not whom: a notification is not a place
  -- to name somebody who has not been looked at yet.
  insert into public.notifications (user_id, type, title, body)
  select p.id,
         'report',
         'A safeguarding report needs your attention',
         coalesce(v_me.full_name, 'A member') || ' reported a prayer request.'
  from public.profiles p
  where p.church_id = v_request.church_id
    and p.is_approved
    and p.role in ('admin', 'executive');

  return v_id;
end;
$fn$;

create or replace function public.report_prayer_request(
  p_request uuid,
  p_reason  text,
  p_detail  text default null
)
returns uuid
language sql
set search_path to public, private, pg_temp
as $$ select private.report_prayer_request(p_request, p_reason, p_detail); $$;

revoke all on function private.report_prayer_request(uuid, text, text) from public, anon;
revoke all on function public.report_prayer_request(uuid, text, text) from public, anon;
grant execute on function private.report_prayer_request(uuid, text, text) to authenticated;
grant execute on function public.report_prayer_request(uuid, text, text) to authenticated;

commit;
