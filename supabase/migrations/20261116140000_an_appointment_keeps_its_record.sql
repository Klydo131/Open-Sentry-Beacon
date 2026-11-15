-- An appointment keeps its record: took place, or did not.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR ON 16 NOVEMBER 2026: a Guide and an Explorer should both have a
-- record of their appointments, so it is known what was called off, what was
-- deleted and what took place.
--
-- WHAT WAS ALREADY KEPT. Nothing is deleted: since 20261112150000 every
-- change goes through answer_meeting, which records who answered, when and
-- why; "deleting" an appointment is calling it off; a change of time is the
-- old one called off with a note starting "Moved to". The record screen
-- (lib/meeting-record.ts) reads all of that.
--
-- WHAT WAS MISSING: whether an agreed time actually took place. `done` has
-- been in the enum since 0009 and nothing ever wrote it, so "met" could only
-- ever mean "agreed, and the time passed". Now either person may say, once
-- the time has come:
--
--   done    it took place
--   missed  it did not happen (new)
--
-- Only an agreed (`confirmed`) appointment, only after it began, only by one
-- of the two people in it, and once: a marked one is not marked again. Who
-- said it and when are recorded in the same columns as every other answer.
--
-- ONE NOTIFICATION PER ANSWER. answer_meeting tells the other person itself,
-- with the reason if one was given, and 20261116120000's trigger would also
-- have told them about a confirm or a call-off: two notifications for one
-- answer. The trigger now speaks only for a new proposal and a moved time,
-- and answer_meeting's notification now carries where to open it.
--
-- SAFE TO RUN TWICE.
-- ---------------------------------------------------------------------------

-- A new enum value cannot be added and used in one transaction, so this runs
-- on its own, as 'declined' did (20260917160000).
alter type public.meeting_status add value if not exists 'missed' after 'done';

begin;

create or replace function public.answer_meeting(p_meeting uuid, p_answer text, p_note text default null)
returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  me       public.profiles%rowtype;
  m        public.meetings%rowtype;
  pair     public.pairings%rowtype;
  other_id uuid;
  other_role public.user_role;
  said     text;
  what     text;
begin
  select profile.* into me from public.profiles as profile where profile.id = (select auth.uid());
  if me.id is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  if p_answer not in ('confirmed', 'declined', 'cancelled', 'done', 'missed') then
    raise exception 'That is not an answer this app has.' using errcode = '22023';
  end if;

  select * into m from public.meetings where id = p_meeting;
  if m.id is null then
    raise exception 'That appointment is not there any more.' using errcode = '42704';
  end if;

  select * into pair from public.pairings where id = m.pairing_id;
  if pair.id is null or me.id not in (pair.dm_id, pair.ds_id) then
    raise exception 'That is not your appointment.' using errcode = '42501';
  end if;
  other_id := case when pair.dm_id = me.id then pair.ds_id else pair.dm_id end;

  if m.status in ('declined', 'cancelled', 'done', 'missed') then
    raise exception 'That appointment has already been answered.' using errcode = '42501';
  end if;

  -- HOW IT WENT: an agreed time, once it has begun.
  if p_answer in ('done', 'missed') then
    if m.status <> 'confirmed' then
      raise exception 'Only an agreed appointment can be marked as met or not.' using errcode = '42501';
    end if;
    if m.starts_at > now() then
      raise exception 'That appointment has not happened yet.' using errcode = '42501';
    end if;
  end if;

  if p_answer in ('confirmed', 'declined')
     and m.status = 'proposed'
     and m.created_by = me.id then
    raise exception 'You proposed this time. The other person answers it; you can cancel it.'
      using errcode = '42501';
  end if;

  if p_answer in ('confirmed', 'declined') and m.status <> 'proposed' then
    raise exception 'That time is not waiting for an answer.' using errcode = '42501';
  end if;

  update public.meetings
     set status = p_answer::public.meeting_status,
         answered_by = me.id,
         answered_at = now(),
         answer_name = coalesce(me.full_name, 'Somebody'),
         answer_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_meeting;

  what := coalesce(nullif(btrim(m.title), ''), 'your time together');
  said := case p_answer
    when 'confirmed' then format('%s said yes to %s', coalesce(me.full_name, 'They'), what)
    when 'declined'  then format('%s cannot make %s', coalesce(me.full_name, 'They'), coalesce(nullif(btrim(m.title), ''), 'that time'))
    when 'done'      then format('%s marked %s as met', coalesce(me.full_name, 'They'), what)
    when 'missed'    then format('%s said %s did not happen', coalesce(me.full_name, 'They'), what)
    else format('%s called off %s', coalesce(me.full_name, 'They'), what)
  end;

  select role into other_role from public.profiles where id = other_id;
  insert into public.notifications (user_id, type, title, body, data)
  values (other_id, 'meeting', said,
          case when nullif(btrim(coalesce(p_note, '')), '') is null
               then 'Open your appointments to see it.'
               else btrim(p_note) end,
          jsonb_build_object('pairing_id', m.pairing_id,
                             'url', case when other_role = 'dm' then '/dm' else '/ds' end));

  return 'ok';
end;
$fn$;

revoke all on function public.answer_meeting(uuid, text, text) from public, anon;
grant execute on function public.answer_meeting(uuid, text, text) to authenticated;

-- The trigger from 20261116120000, if it is there, now speaks only for what
-- answer_meeting does not: a new proposal and a moved time.
do $$
begin
  if to_regprocedure('private.a_meeting_is_told()') is not null then
    execute $f$
create or replace function private.a_meeting_is_told()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $b$
declare v_dm uuid; v_ds uuid; v_actor uuid; v_other uuid; v_what text; v_role user_role;
begin
  select dm_id, ds_id into v_dm, v_ds from public.pairings where id = new.pairing_id;
  v_actor := coalesce((select auth.uid()), new.created_by);
  v_other := case when v_actor = v_dm then v_ds else v_dm end;
  if tg_op = 'INSERT' then
    v_what := ' suggested a time to meet';
  elsif new.starts_at is distinct from old.starts_at then
    v_what := ' moved a meeting';
  else
    -- An answer (yes, no, called off, met, did not happen) is told by
    -- answer_meeting, with its reason. Telling it here as well doubled it.
    return new;
  end if;
  select role into v_role from public.profiles where id = v_other;
  perform private.tell(v_other, v_actor, 'meeting', private.first_name(v_actor) || v_what,
    left(new.title, 120) || ' · ' || to_char(new.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ' UTC',
    jsonb_build_object('pairing_id', new.pairing_id, 'url', case when v_role = 'dm' then '/dm' else '/ds' end));
  return new;
exception when others then return new;
end;
$b$;
$f$;
    revoke all on function private.a_meeting_is_told() from public, anon, authenticated;
  end if;
end $$;

commit;
