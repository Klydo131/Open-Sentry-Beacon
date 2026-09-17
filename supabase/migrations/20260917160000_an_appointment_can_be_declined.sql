-- A yes is recorded. So is a no.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "If there is a record for acceptance in appointment, there must be
-- a record for cancel too so that Guides and Explorers are informed who
-- accepted and who declined."
--
-- WHAT WAS THERE, AND IT WAS WORSE THAN A MISSING BUTTON. Confirming wrote
-- `status = 'confirmed'`; cancelling wrote `status = 'cancelled'`; and the list
-- on the screen then filtered cancelled ones out. So a Guide who proposed a
-- time and had it called off did not see a refusal. They saw the CARD VANISH,
-- which reads as a bug rather than as an answer, and nobody was told anything
-- either way. The old comment in the screen said the news was carried by "the
-- message in the conversation". No message was ever sent.
--
-- DECLINED IS NOT CANCELLED, and keeping them apart is the point. Declined is
-- "I cannot make the time you proposed". Cancelled is "the time we agreed is
-- off". Collapsing the two loses the one fact the other person actually wants,
-- which is whether there was ever an agreement to break.
--
-- ONE FUNCTION RATHER THAN THREE TABLE WRITES, because the record and the
-- telling have to happen in the same transaction or neither is reliable. It
-- also refuses the two answers that mean nothing: accepting your own proposal,
-- which says only that you still want what you asked for, and answering
-- something that has already been answered.
--
-- THE NAME IS COPIED, NOT LOOKED UP. `answer_name` holds the answerer's name as
-- it was at the moment they answered, so the record still reads properly after
-- that account is deleted -- the same rule the discipline log already follows.
-- ---------------------------------------------------------------------------

-- Postgres will not let a new enum value be added and used in one transaction,
-- so this runs on its own. `if not exists` makes the file safe to re-apply.
alter type public.meeting_status add value if not exists 'declined' after 'confirmed';

alter table public.meetings
  add column if not exists answered_by uuid references public.profiles(id) on delete set null,
  add column if not exists answered_at timestamptz,
  add column if not exists answer_note text,
  add column if not exists answer_name text;

comment on column public.meetings.answer_name is
  'The answerer''s name as it was when they answered, so the record survives the account being deleted.';

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
  said     text;
begin
  select profile.* into me from public.profiles as profile where profile.id = (select auth.uid());
  if me.id is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  if p_answer not in ('confirmed', 'declined', 'cancelled') then
    raise exception 'That is not an answer this app has.' using errcode = '22023';
  end if;

  select * into m from public.meetings where id = p_meeting;
  if m.id is null then
    raise exception 'That appointment is not there any more.' using errcode = '42704';
  end if;

  -- dm_id AND ds_id ARE THE COLUMN NAMES. Guide and Explorer are what the app
  -- calls the people; they have never been what the table calls the columns,
  -- and this function shipped once with the friendly words in it.
  select * into pair from public.pairings where id = m.pairing_id;
  if pair.id is null or me.id not in (pair.dm_id, pair.ds_id) then
    raise exception 'That is not your appointment.' using errcode = '42501';
  end if;
  other_id := case when pair.dm_id = me.id then pair.ds_id else pair.dm_id end;

  if m.status in ('declined', 'cancelled') then
    raise exception 'That appointment has already been answered.' using errcode = '42501';
  end if;

  -- ACCEPTING YOUR OWN PROPOSAL SAYS NOTHING. The whole value of a confirmed
  -- time is that the OTHER person agreed to it, and the same is true of a
  -- refusal: declining your own proposal is withdrawing it, which is a cancel.
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

  -- AND THE OTHER PERSON IS TOLD, WHICHEVER WAY IT WENT. A yes already reached
  -- them because the card changed; a no used to make the card disappear.
  said := case p_answer
    when 'confirmed' then format('%s said yes to %s',
           coalesce(me.full_name, 'They'), coalesce(nullif(btrim(m.title), ''), 'your time together'))
    when 'declined'  then format('%s cannot make %s',
           coalesce(me.full_name, 'They'), coalesce(nullif(btrim(m.title), ''), 'that time'))
    else format('%s called off %s',
           coalesce(me.full_name, 'They'), coalesce(nullif(btrim(m.title), ''), 'your time together'))
  end;

  insert into public.notifications (user_id, type, title, body)
  values (other_id, 'meeting', said,
          case when nullif(btrim(coalesce(p_note, '')), '') is null
               then 'Open your appointments to see it.'
               else btrim(p_note) end);

  return 'ok';
end;
$fn$;

revoke all on function public.answer_meeting(uuid, text, text) from public, anon;
grant execute on function public.answer_meeting(uuid, text, text) to authenticated;
