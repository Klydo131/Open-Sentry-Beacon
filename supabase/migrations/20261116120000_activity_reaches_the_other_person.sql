-- What one person does now reaches the other person.
--
-- ---------------------------------------------------------------------------
-- REPORTED 16 NOVEMBER 2026: notifications felt stale. A Guide could post,
-- share, assign a lesson or arrange a meeting, and an Explorer could read a
-- lesson or finish a study, and the other person was told nothing until they
-- happened to open the right screen. Until today the only things that made a
-- notification were prayer, reports, approvals and suspensions.
--
-- WHY TRIGGERS. A notification exists because something happened, so it is
-- made next to the data, the way 20260916210000 already pushes every
-- notification row to the person's devices. Each trigger below writes one row;
-- that existing trigger carries it to the phone. Nothing here is callable from
-- a browser: every function is SECURITY DEFINER, owned by the database, and
-- granted to nobody.
--
-- WHAT IS NEVER IN ONE. The words of a message, a prayer or a post. A lock
-- screen is read by whoever is holding the phone; a title says who and what,
-- never the content.
--
-- NOT A FLOOD. A conversation of twenty messages is one notification until it
-- is read: a new message notification is skipped while the same person still
-- has an unread one from the same conversation in the last 30 minutes. The
-- Guides' room behaves the same way per reader. Nobody is ever told about
-- their own action.
--
-- A notification failing never stops the thing that caused it: each trigger
-- catches its own errors and returns the row.
-- ---------------------------------------------------------------------------

begin;

-- One place that writes a row, so every trigger keeps the same rules.
create or replace function private.tell(
  p_user uuid, p_actor uuid, p_type text, p_title text, p_body text, p_data jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  -- Only an approved, active member is told anything.
  if not exists (
    select 1 from public.profiles
     where id = p_user and is_approved and suspended_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user, p_type, left(p_title, 200), left(coalesce(p_body, ''), 500), coalesce(p_data, '{}'::jsonb));
end;
$$;
revoke all on function private.tell(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function private.first_name(p_id uuid) returns text
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'Someone')
    from public.profiles where id = p_id
$$;
revoke all on function private.first_name(uuid) from public, anon, authenticated;

-- 1. A MESSAGE ---------------------------------------------------------------
create or replace function private.a_message_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_other uuid;
  v_role  user_role;
begin
  select case when p.dm_id = new.sender_id then p.ds_id else p.dm_id end
    into v_other from public.pairings p where p.id = new.pairing_id;
  if v_other is null then return new; end if;
  if exists (
    select 1 from public.notifications n
     where n.user_id = v_other and n.type = 'message' and n.read_at is null
       and n.data->>'pairing_id' = new.pairing_id::text
       and n.created_at > now() - interval '30 minutes'
  ) then
    return new;
  end if;
  select role into v_role from public.profiles where id = v_other;
  perform private.tell(v_other, new.sender_id, 'message',
    private.first_name(new.sender_id) || ' sent you a message', 'Open the conversation to read it.',
    jsonb_build_object('pairing_id', new.pairing_id, 'url', case when v_role = 'dm' then '/dm' else '/ds' end));
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_message_is_told() from public, anon, authenticated;
drop trigger if exists a_message_is_told on public.messages;
create trigger a_message_is_told after insert on public.messages
  for each row execute function private.a_message_is_told();

-- 2. A RESOURCE SHARED ------------------------------------------------------
create or replace function private.a_share_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_ds uuid; v_title text;
begin
  select ds_id into v_ds from public.pairings where id = new.pairing_id;
  select title into v_title from public.materials where id = new.material_id;
  perform private.tell(v_ds, new.shared_by, 'share',
    private.first_name(new.shared_by) || ' shared something with you', coalesce(left(v_title, 120), 'A new resource'),
    jsonb_build_object('pairing_id', new.pairing_id, 'url', '/library'));
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_share_is_told() from public, anon, authenticated;
drop trigger if exists a_share_is_told on public.material_shares;
create trigger a_share_is_told after insert on public.material_shares
  for each row execute function private.a_share_is_told();

-- 3. A STUDY ASSIGNED, AND A STUDY FINISHED -----------------------------------
create or replace function private.a_study_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_dm uuid; v_ds uuid; v_title text;
begin
  select dm_id, ds_id into v_dm, v_ds from public.pairings where id = new.pairing_id;
  select title into v_title from public.lesson_series where id = new.series_id;
  if tg_op = 'INSERT' then
    perform private.tell(v_ds, new.assigned_by, 'lesson',
      private.first_name(new.assigned_by) || ' gave you a study', coalesce(left(v_title, 120), 'A new study'),
      jsonb_build_object('pairing_id', new.pairing_id, 'url', '/study'));
  elsif new.completed_at is not null and old.completed_at is null then
    perform private.tell(v_dm, v_ds, 'lesson',
      private.first_name(v_ds) || ' finished a study', coalesce(left(v_title, 120), 'A study'),
      jsonb_build_object('pairing_id', new.pairing_id, 'url', '/dm'));
  end if;
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_study_is_told() from public, anon, authenticated;
drop trigger if exists a_study_is_told on public.lesson_assignments;
create trigger a_study_is_told after insert or update of completed_at on public.lesson_assignments
  for each row execute function private.a_study_is_told();

-- 4. A LESSON READ by an Explorer: their Guide hears, once per lesson -------
create or replace function private.a_reading_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare r record; v_title text;
begin
  if (select role from public.profiles where id = new.user_id) <> 'ds' then return new; end if;
  select title into v_title from public.lessons where id = new.lesson_id;
  for r in select id, dm_id from public.pairings where ds_id = new.user_id and status = 'active' loop
    perform private.tell(r.dm_id, new.user_id, 'lesson',
      private.first_name(new.user_id) || ' read a lesson', coalesce(left(v_title, 120), 'A lesson'),
      jsonb_build_object('pairing_id', r.id, 'url', '/dm'));
  end loop;
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_reading_is_told() from public, anon, authenticated;
drop trigger if exists a_reading_is_told on public.lesson_reads;
create trigger a_reading_is_told after insert on public.lesson_reads
  for each row execute function private.a_reading_is_told();

-- 5. A MEETING arranged, confirmed or cancelled ------------------------------
create or replace function private.a_meeting_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_dm uuid; v_ds uuid; v_actor uuid; v_other uuid; v_what text; v_role user_role;
begin
  select dm_id, ds_id into v_dm, v_ds from public.pairings where id = new.pairing_id;
  v_actor := coalesce((select auth.uid()), new.created_by);
  v_other := case when v_actor = v_dm then v_ds else v_dm end;
  if tg_op = 'INSERT' then
    v_what := ' suggested a time to meet';
  elsif new.status is distinct from old.status and new.status in ('confirmed', 'cancelled') then
    v_what := case new.status when 'confirmed' then ' confirmed your meeting' else ' cancelled a meeting' end;
  elsif new.starts_at is distinct from old.starts_at then
    v_what := ' moved a meeting';
  else
    return new;
  end if;
  select role into v_role from public.profiles where id = v_other;
  perform private.tell(v_other, v_actor, 'meeting', private.first_name(v_actor) || v_what,
    left(new.title, 120) || ' · ' || to_char(new.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ' UTC',
    jsonb_build_object('pairing_id', new.pairing_id, 'url', case when v_role = 'dm' then '/dm' else '/ds' end));
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_meeting_is_told() from public, anon, authenticated;
drop trigger if exists a_meeting_is_told on public.meetings;
create trigger a_meeting_is_told after insert or update of status, starts_at on public.meetings
  for each row execute function private.a_meeting_is_told();

-- 6. A NEW PAIRING: both people hear who they are walking with ---------------
create or replace function private.a_pairing_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_actor uuid := coalesce((select auth.uid()), new.created_by);
begin
  perform private.tell(new.ds_id, v_actor, 'pairing', 'You have a Guide: ' || private.first_name(new.dm_id),
    'Say hello in your conversation.', jsonb_build_object('pairing_id', new.id, 'url', '/ds'));
  perform private.tell(new.dm_id, v_actor, 'pairing', 'You are now walking with ' || private.first_name(new.ds_id),
    'Their conversation is open on your desk.', jsonb_build_object('pairing_id', new.id, 'url', '/dm'));
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_pairing_is_told() from public, anon, authenticated;
drop trigger if exists a_pairing_is_told on public.pairings;
create trigger a_pairing_is_told after insert on public.pairings
  for each row execute function private.a_pairing_is_told();

-- 7. A GUIDE'S POST, when it is published: the Explorers it is for -----------
create or replace function private.a_post_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if new.visibility <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.visibility = 'published' then return new; end if;
  for r in
    select p.ds_id as who from public.pairings p
     where p.dm_id = new.author_id and p.status = 'active'
       and (new.audience = 'all'
            or exists (select 1 from public.blog_audience a where a.post_id = new.id and a.ds_id = p.ds_id))
  loop
    perform private.tell(r.who, new.author_id, 'post',
      private.first_name(new.author_id) || ' posted something for you', left(new.title, 120),
      jsonb_build_object('post_id', new.id, 'url', '/church'));
  end loop;
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_post_is_told() from public, anon, authenticated;
drop trigger if exists a_post_is_told on public.blog_posts;
create trigger a_post_is_told after insert or update of visibility on public.blog_posts
  for each row execute function private.a_post_is_told();

-- 8. A CHURCH NOTICE: every approved member of the church --------------------
create or replace function private.a_notice_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  for r in select id from public.profiles where church_id = new.church_id and is_approved and suspended_at is null loop
    perform private.tell(r.id, new.author_id, 'announcement', 'New church notice', left(new.title, 120),
      jsonb_build_object('announcement_id', new.id, 'url', '/church'));
  end loop;
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_notice_is_told() from public, anon, authenticated;
drop trigger if exists a_notice_is_told on public.announcements;
create trigger a_notice_is_told after insert on public.announcements
  for each row execute function private.a_notice_is_told();

-- 9. THE GUIDES' ROOM: Guides and leaders, once per half hour each -----------
create or replace function private.a_guide_room_post_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  for r in
    select p.id, p.role from public.profiles p
     where p.church_id = new.church_id and p.is_approved and p.suspended_at is null
       and p.role in ('dm', 'admin', 'executive')
       and not exists (
         select 1 from public.notifications n
          where n.user_id = p.id and n.type = 'guide_room' and n.read_at is null
            and n.created_at > now() - interval '30 minutes')
  loop
    perform private.tell(r.id, new.author_id, 'guide_room',
      private.first_name(new.author_id) || ' wrote in the Guides’ room', 'Open the Guides’ room to read it.',
      jsonb_build_object('url', '/office'));
  end loop;
  return new;
exception when others then return new;
end;
$$;
revoke all on function private.a_guide_room_post_is_told() from public, anon, authenticated;
drop trigger if exists a_guide_room_post_is_told on public.guide_room_messages;
create trigger a_guide_room_post_is_told after insert on public.guide_room_messages
  for each row execute function private.a_guide_room_post_is_told();

-- Finding a person's unread notifications of a kind, fast, for the checks above.
create index if not exists notifications_unread_by_type
  on public.notifications (user_id, type, created_at desc) where read_at is null;

commit;
