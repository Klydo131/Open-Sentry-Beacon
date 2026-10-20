-- Leave to answer, a record that outlives the account, and the same rules
-- everywhere.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR (20 October 2026), in the owner's words, after the court room:
--
--   "It will remain admin reports not court room, but it can function as mini
--   court room ... 30 minutes is ok. Suspended person can be summoned if an ED
--   or Director allowed them (permitted by the local church leaders),
--   suspended accounts will have temporary lift of using the account on a
--   permission to use to be summoned on the digital court. You can fix the
--   problems in the system codes if you see any loopholes on it. The admin
--   report is strictly for local church installed only. The only available
--   data can be presented is the court room or admin reports remains, if the
--   person is deleted it is recorded as deleted. We must respect the rules of
--   Data privacy too."
--
-- WHAT THIS DOES:
--
--   1. LEAVE TO ANSWER. The judge of a case (always a Director or an Executive
--      Director) may give somebody called to it, whose account is suspended,
--      leave to sign in and answer: for an hour, a day, three days or a week,
--      and never past the verdict. While it lasts the sign-in service lets
--      them in, and EVERYTHING ELSE STAYS SHUT: the data API answers only the
--      court room's own calls, the live socket and the rest of the file store
--      still refuse them, and inside the court room they reach that one case
--      and nothing else. When it ends -- the judge ends it, its time runs out,
--      the case is decided -- the account is switched off again and every
--      session it holds is ended. Granting and ending are on the case's record
--      and the church's leaders are told.
--
--   2. THE RECORD OUTLIVES THE ACCOUNT, and says the account is gone. A
--      safeguarding report, its conversation and its evidence stay when the
--      account of the person who raised it, or of the person it is about, is
--      deleted, as the privacy notice says ("kept permanently, including after
--      an account is deleted"): the link is set to nothing and the name kept,
--      shown as "(account deleted)". In the court room, a deletion is written
--      on every case the person was in, and they stay among the people called,
--      marked the same way. Nothing else about them is kept: no address, no
--      number, no photo, nothing from the rest of the app.
--
--   3. THE SAME RULES EVERYWHERE. Every action on a report asks the same two
--      rules (private.may_handle_report): never your own, and a report about
--      a Director or an Executive Director is for Executive Directors; that
--      holds after the person's account is gone, from the role kept on the
--      report. The note that a report was filed goes only to those who may
--      handle it. A suspended leader is not leadership anywhere in the court
--      room. And one person's statements, exhibits and alarms in a case have
--      limits no honest hearing reaches.
--
-- THE CHURCH IS STILL THE BOUNDARY. A report is read only by leaders of its
-- own church (private.may_handle_report, unchanged in that); a case only by
-- the people in it and by its church's leadership. Nothing here adds a reader
-- from outside the church the report or the case belongs to.
-- ---------------------------------------------------------------------------

begin;

-- ======================================================== kept names ======

/**
 * A person's name as it should be shown: their name now while their account
 * exists, or the name kept at the time, marked "(account deleted)", once it
 * does not. The mark is what tells a reader the person is gone rather than
 * nameless.
 */
create or replace function private.name_kept(p_id uuid, p_kept text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is not null then coalesce(p.full_name, nullif(btrim(p_kept), ''), 'Someone')
    else coalesce(nullif(btrim(p_kept), ''), 'Someone') || ' (account deleted)'
  end
  from (select 1) as one
  left join public.profiles p on p.id = p_id;
$$;

-- ============================================ reports outlive the account ==

alter table public.reports         add column if not exists reporter_name text;
alter table public.reports         add column if not exists subject_name  text;
alter table public.reports         add column if not exists subject_role  text;
alter table public.report_messages add column if not exists author_name   text;
alter table public.report_files    add column if not exists added_name    text;

update public.reports r
   set reporter_name = coalesce((select p.full_name from public.profiles p where p.id = r.reporter_id), 'Someone')
 where r.reporter_name is null;
update public.reports r
   set subject_name = coalesce((select p.full_name from public.profiles p where p.id = r.subject_id), 'Someone'),
       subject_role = (select p.role::text from public.profiles p where p.id = r.subject_id)
 where r.subject_name is null;
update public.report_messages m
   set author_name = coalesce((select p.full_name from public.profiles p where p.id = m.author_id), 'Someone')
 where m.author_name is null;
update public.report_files f
   set added_name = coalesce((select p.full_name from public.profiles p where p.id = f.added_by), 'Someone')
 where f.added_name is null;

alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.reports alter column reporter_id drop not null;

alter table public.reports drop constraint if exists reports_subject_id_fkey;
alter table public.reports
  add constraint reports_subject_id_fkey
  foreign key (subject_id) references public.profiles(id) on delete set null;
alter table public.reports alter column subject_id drop not null;

alter table public.report_messages drop constraint if exists report_messages_author_id_fkey;
alter table public.report_messages
  add constraint report_messages_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.report_messages alter column author_id drop not null;

alter table public.report_files drop constraint if exists report_files_added_by_fkey;
alter table public.report_files
  add constraint report_files_added_by_fkey
  foreign key (added_by) references public.profiles(id) on delete set null;
alter table public.report_files alter column added_by drop not null;

/** Names go in with the row, whoever writes it, so a later deletion leaves them. */
create or replace function private.report_keeps_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reporter_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.reporter_id), 'Someone');
  new.subject_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.subject_id), 'Someone');
  new.subject_role := (select p.role::text from public.profiles p where p.id = new.subject_id);
  return new;
end;
$$;

create or replace function private.report_message_keeps_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.author_id), 'Someone');
  return new;
end;
$$;

create or replace function private.report_file_keeps_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.added_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.added_by), 'Someone');
  return new;
end;
$$;

drop trigger if exists report_keeps_names on public.reports;
create trigger report_keeps_names
  before insert on public.reports
  for each row execute function private.report_keeps_names();
drop trigger if exists report_message_keeps_name on public.report_messages;
create trigger report_message_keeps_name
  before insert on public.report_messages
  for each row execute function private.report_message_keeps_name();
drop trigger if exists report_file_keeps_name on public.report_files;
create trigger report_file_keeps_name
  before insert on public.report_files
  for each row execute function private.report_file_keeps_name();

/**
 * As an account goes, the names on its reports are brought up to date, so the
 * name kept is the last one it had. Runs before the row goes; the links are
 * then set to nothing by the foreign keys.
 */
create or replace function private.reports_remember_the_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports
     set reporter_name = coalesce(old.full_name, reporter_name, 'Someone')
   where reporter_id = old.id;
  update public.reports
     set subject_name = coalesce(old.full_name, subject_name, 'Someone'),
         subject_role = coalesce(old.role::text, subject_role)
   where subject_id = old.id;
  update public.report_messages
     set author_name = coalesce(old.full_name, author_name, 'Someone')
   where author_id = old.id;
  update public.report_files
     set added_name = coalesce(old.full_name, added_name, 'Someone')
   where added_by = old.id;
  return old;
end;
$$;

drop trigger if exists reports_remember_the_departed on public.profiles;
create trigger reports_remember_the_departed
  before delete on public.profiles
  for each row execute function private.reports_remember_the_departed();

-- ================================================== who handles a report ==

/**
 * As 20260915120000, with two more things said. A suspended leader handles
 * nothing. And the rule that a case about leadership is for Executive
 * Directors reads the role kept on the report once the person's account is
 * gone.
 */
create or replace function private.may_handle_report(p_report uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me      public.profiles%rowtype;
  r       public.reports%rowtype;
  subject public.profiles%rowtype;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then return false; end if;

  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved or me.suspended_at is not null then return false; end if;
  if me.church_id is distinct from r.church_id then return false; end if;
  if me.role not in ('admin', 'executive') then return false; end if;

  -- RULE 1. Never your own case, whatever your rank.
  if me.id = r.subject_id then return false; end if;

  -- RULE 2. A case about leadership belongs to Executive Directors.
  select * into subject from public.profiles where id = r.subject_id;
  if coalesce(subject.role::text, r.subject_role) in ('admin', 'executive') and me.role <> 'executive' then
    return false;
  end if;

  return true;
end;
$function$;

/**
 * Tell the people who may handle a report that it is there: the leaders of
 * its church, never the person it is about, and only Executive Directors when
 * it is about a Director or an Executive Director. One home for the rule,
 * asked by all three ways of filing a report.
 */
create or replace function private.tell_report_handlers(p_report uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r          public.reports%rowtype;
  about_lead boolean;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then return; end if;
  about_lead := coalesce(
    (select p.role::text from public.profiles p where p.id = r.subject_id), r.subject_role)
    in ('admin', 'executive');

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'report', 'A safeguarding report needs your attention', p_body
    from public.profiles p
   where p.church_id = r.church_id
     and p.is_approved
     and p.suspended_at is null
     and p.role in ('admin', 'executive')
     and p.id is distinct from r.subject_id
     and (not coalesce(about_lead, false) or p.role = 'executive');
end;
$$;

/** As 0021 and its successors; the note goes only to those who may handle it. */
create or replace function public.report_person(p_subject uuid, p_reason text, p_detail text default null, p_pairing uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me      public.profiles%rowtype;
  v_subject public.profiles%rowtype;
  v_id      uuid;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'You need an approved account to report somebody.';
  end if;

  select * into v_subject from public.profiles where id = p_subject;
  -- Same church, or this becomes a way to file reports against strangers —
  -- and, through the error message, to discover that they exist.
  if v_subject.id is null or v_subject.church_id is distinct from v_me.church_id then
    raise exception 'That person is not in your church.';
  end if;
  if v_subject.id = v_me.id then
    raise exception 'You cannot report yourself.';
  end if;
  if p_reason not in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other') then
    raise exception 'Unknown reason.';
  end if;

  insert into public.reports (church_id, reporter_id, subject_id, pairing_id, reason, detail)
  values (v_me.church_id, v_me.id, p_subject, p_pairing, p_reason, nullif(btrim(coalesce(p_detail, '')), ''))
  returning id into v_id;

  -- Everybody who may handle it, by name. A report nobody is looking at is
  -- worse than no report. The SUBJECT is never told, whatever their rank.
  perform private.tell_report_handlers(v_id,
    coalesce(v_me.full_name, 'A member') || ' reported ' || coalesce(v_subject.full_name, 'a member') || '.');

  return v_id;
end;
$function$;

/** As 20260929120000-era; the note goes only to those who may handle it. */
create or replace function private.report_guild_post(p_post uuid, p_reason text, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_me     public.profiles%rowtype;
  v_post   public.guild_activity_posts%rowtype;
  v_words  text;
  v_id     uuid;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'You need an approved account to report a post.' using errcode = '42501';
  end if;

  select * into v_post from public.guild_activity_posts where id = p_post;
  if v_post.id is null or not private.active_guild_member(v_post.guild_id) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;
  if v_post.author_id = v_me.id then
    raise exception 'You can delete your own post instead of reporting it.';
  end if;
  if p_reason not in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other') then
    raise exception 'Unknown reason.';
  end if;

  v_words := v_post.body;
  if v_post.deleted_at is not null then
    select r.body into v_words from public.guild_activity_revisions r
     where r.post_id = v_post.id and r.reason = 'deleted'
     order by r.recorded_at desc limit 1;
  end if;

  insert into public.reports
    (church_id, reporter_id, subject_id, reason, detail, guild_post_id, guild_post_body)
  values
    (v_post.church_id, v_me.id, v_post.author_id, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), v_post.id, coalesce(v_words, ''))
  returning id into v_id;

  perform private.tell_report_handlers(v_id,
    coalesce(v_me.full_name, 'A member') || ' reported a post in the Guild Room.');

  return v_id;
end;
$function$;

/** As before; the note goes only to those who may handle it. */
create or replace function private.report_prayer_request(p_request uuid, p_reason text, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- The notification names who reported and what kind of thing, not whom: a
  -- notification is not a place to name somebody who has not been looked at yet.
  perform private.tell_report_handlers(v_id,
    coalesce(v_me.full_name, 'A member') || ' reported a prayer request.');

  return v_id;
end;
$function$;

/**
 * Decide a report. It asks the same two rules as every other report action
 * (private.may_handle_report): never your own, and a report about a Director
 * or an Executive Director is for Executive Directors.
 */
create or replace function public.resolve_report(p_id uuid, p_status text, p_outcome text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'A report is either dealt with or has nothing to answer.';
  end if;
  if not private.may_handle_report(p_id) then
    return false;
  end if;

  update public.reports
     set status = p_status,
         decided_by = (select auth.uid()),
         decided_at = now(),
         outcome = nullif(btrim(coalesce(p_outcome, '')), '')
   where id = p_id;
  return true;
end;
$function$;

/** As 20260915120000; the person who raised it is told only while they have an account. */
create or replace function public.claim_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me public.profiles%rowtype;
  r  public.reports%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into r  from public.reports  where id = p_report;
  if r.id is null then raise exception 'That report is not here.'; end if;

  if not private.may_handle_report(p_report) then
    -- Deliberately one message for every refusal. Telling somebody "you cannot
    -- take this because it is about you" confirms a report exists about them,
    -- which is the one thing the subject must not learn from the app.
    raise exception 'That report is not yours to pick up.';
  end if;

  if r.status <> 'open' then raise exception 'That report is already closed.'; end if;

  if r.claimed_by is not null and r.claimed_by <> me.id then
    raise exception 'Somebody is already helping with this one.';
  end if;

  update public.reports
     set claimed_by = me.id, claimed_at = coalesce(claimed_at, now())
   where id = p_report;

  if r.reporter_id is not null then
    insert into public.notifications (user_id, type, title, body)
    values (r.reporter_id, 'report', 'Someone is looking at your report',
            'A Director has picked up what you raised. You can talk to them '
            || 'privately in Settings, under Admin Reports.');
  end if;
end;
$function$;

/** As 20260915120000; a conversation with somebody whose account is gone stays as it was. */
create or replace function public.say_in_report(p_report uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me   public.profiles%rowtype;
  r    public.reports%rowtype;
  v_id uuid;
  other uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then
    raise exception 'Your account cannot do this.';
  end if;

  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'That report is not here.'; end if;

  if not private.in_report(p_report) then
    raise exception 'This conversation is between the person who reported and the one helping.';
  end if;

  if r.claimed_by is null then
    raise exception 'Nobody has picked this up yet. You will be told when somebody does.';
  end if;
  if r.reporter_id is null then
    raise exception 'The person who raised this has deleted their account, so nobody would read a reply.';
  end if;

  if btrim(coalesce(p_body, '')) = '' then raise exception 'Say something first.'; end if;

  insert into public.report_messages (report_id, author_id, body)
  values (p_report, me.id, btrim(p_body))
  returning id into v_id;

  other := case when me.id = r.reporter_id then r.claimed_by else r.reporter_id end;
  insert into public.notifications (user_id, type, title, body)
  values (other, 'report', 'A new message about a report',
          'There is a reply waiting in Settings, under Admin Reports.');

  return v_id;
end;
$function$;

/** The reports this person may see. As 20260915120000, with a deleted account shown as deleted. */
create or replace function public.my_reports()
returns table (id uuid, reason text, detail text, status text, created_at timestamptz, mine boolean,
               claimed_by uuid, claimed_name text, subject_name text, can_handle boolean, messages bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.reason, r.detail, r.status, r.created_at,
         r.reporter_id = (select auth.uid()) as mine,
         r.claimed_by,
         c.full_name as claimed_name,
         -- The subject's name is for the people who may handle the case. The
         -- reporter already knows who they reported; showing it back to them
         -- costs nothing, but showing it to anybody else would be a leak.
         case when private.may_handle_report(r.id) or r.reporter_id = (select auth.uid())
              then private.name_kept(r.subject_id, r.subject_name) end as subject_name,
         private.may_handle_report(r.id) as can_handle,
         (select count(*) from public.report_messages m where m.report_id = r.id) as messages
    from public.reports r
    left join public.profiles c on c.id = r.claimed_by
   where r.reporter_id = (select auth.uid())
      or private.may_handle_report(r.id)
   order by r.status = 'open' desc, r.created_at desc;
$function$;

/** A report's conversation. As before, keeping what a deleted account said, marked deleted. */
create or replace function public.report_thread(p_report uuid)
returns table (id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.id, m.author_id, private.name_kept(m.author_id, m.author_name), m.body, m.created_at
    from public.report_messages m
   where m.report_id = p_report
     and private.in_report(p_report)
   order by m.created_at;
$function$;

-- ======================================= the court record outlives it too ==

alter table public.court_record drop constraint if exists court_record_act_check;
alter table public.court_record add constraint court_record_act_check check (act in (
  'opened', 'summoned', 'statement', 'statement_for',
  'exhibit', 'exhibit_viewed', 'exhibit_matched', 'exhibit_differed',
  'record_opened', 'record_exported', 'gallery_seat', 'setting',
  'judge_called', 'judge_seated', 'verdict',
  'account_deleted', 'leave_granted', 'leave_ended'));

-- The role of the person a case is about, kept, for the same reason as a
-- report's: so a deletion does not open a case about a leader to Directors.
alter table public.trials add column if not exists subject_role text;
update public.trials t
   set subject_role = (select p.role::text from public.profiles p where p.id = t.subject_id)
 where t.subject_role is null and t.subject_id is not null;

create or replace function private.court_trial_keeps_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.subject_role := coalesce(
    (select p.role::text from public.profiles p where p.id = new.subject_id), new.subject_role);
  return new;
end;
$$;

drop trigger if exists court_trial_keeps_role on public.trials;
create trigger court_trial_keeps_role
  before insert on public.trials
  for each row execute function private.court_trial_keeps_role();

-- Who was called to a case and has since gone. trial_parties keys on the
-- person, so their row cannot stay once the account goes; this keeps their
-- name and part instead, and nothing else.
create table if not exists public.court_departed (
  trial_id    uuid not null references public.trials(id) on delete cascade,
  person_id   uuid not null,
  person_name text not null,
  part        text not null check (part in ('accused', 'reporter', 'witness', 'observer')),
  summoned_at timestamptz,
  departed_at timestamptz not null default now(),
  primary key (trial_id, person_id)
);
alter table public.court_departed enable row level security;
revoke all on public.court_departed from anon, authenticated;

/**
 * An account is being deleted: write it on every case the person was in --
 * called to it, watching it, judging it, or having opened it -- and keep their
 * place among the people called. Runs before the row goes.
 *
 * NEVER IN THE WAY OF A DELETION. A deletion is either the person's own right
 * or a verdict being carried out, and refusing it to protect a log line would
 * be the wrong way round, so each case is written in its own step and a
 * failure costs that one entry, not the deletion.
 */
create or replace function private.court_remembers_the_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_name text := coalesce(old.full_name, 'Someone');
begin
  for r in
    select tp.trial_id, tp.part, tp.summoned_at, true as called
      from public.trial_parties tp
     where tp.person_id = old.id
    union all
    select t.id, case when t.head_judge_id = old.id then 'judge' else 'opener' end, null::timestamptz, false
      from public.trials t
     where (t.head_judge_id = old.id or t.opened_by = old.id)
       and not exists (select 1 from public.trial_parties tp
                        where tp.trial_id = t.id and tp.person_id = old.id)
  loop
    if r.called then
      begin
        insert into public.court_departed (trial_id, person_id, person_name, part, summoned_at)
        values (r.trial_id, old.id, v_name, r.part, r.summoned_at)
        on conflict (trial_id, person_id) do nothing;
      exception when others then
        null;
      end;
    end if;
    begin
      perform private.court_append(r.trial_id, 'account_deleted', old.id::text,
        v_name || '''s account was deleted ('
          || case r.part when 'judge' then 'the judge'
                         when 'opener' then 'who opened the case'
                         when 'accused' then 'the person the case is about'
                         when 'reporter' then 'the person who raised it'
                         when 'witness' then 'a witness'
                         else 'watching from the gallery' end
          || '). What the record holds of them stays.');
    exception when others then
      null;
    end;
  end loop;
  return old;
end;
$$;

drop trigger if exists court_remembers_the_departed on public.profiles;
create trigger court_remembers_the_departed
  before delete on public.profiles
  for each row execute function private.court_remembers_the_departed();

-- ========================================================== leave to answer ==

create table if not exists public.court_leave (
  id           uuid primary key default gen_random_uuid(),
  trial_id     uuid not null references public.trials(id) on delete cascade,
  person_id    uuid not null references public.profiles(id) on delete cascade,
  -- No link to a profile, so the grant reads the same after the judge goes.
  granted_by   uuid,
  granted_name text not null,
  granted_at   timestamptz not null default now(),
  ends_at      timestamptz not null,
  ended_at     timestamptz,
  ended_why    text check (ended_why is null or ended_why in
                 ('ended', 'ran_out', 'case_closed', 'lifted', 'not_called')),
  check (ends_at > granted_at)
);
-- One case at a time: leave opens one door, never two.
create unique index if not exists court_leave_one_at_a_time
  on public.court_leave (person_id) where ended_at is null;
create index if not exists court_leave_by_trial on public.court_leave (trial_id);
alter table public.court_leave enable row level security;
revoke all on public.court_leave from anon, authenticated;

/** The case the caller has leave to answer, while it lasts; null otherwise. */
create or replace function private.court_leave_case()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.trial_id from public.court_leave l
   where l.person_id = (select auth.uid()) and l.ended_at is null and l.ends_at > now()
   limit 1;
$$;

/** When the caller's leave to answer ends; null if they have none. */
create or replace function private.court_leave_ends()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select l.ends_at from public.court_leave l
   where l.person_id = (select auth.uid()) and l.ended_at is null and l.ends_at > now()
   limit 1;
$$;

/**
 * Answering on leave right now: suspended, with leave that has not run out,
 * on a session that is still live and has finished any second step. What the
 * file store asks before it lets a suspended account near the exhibits.
 */
create or replace function private.court_answering()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.suspended_at is not null)
     and private.court_leave_case() is not null
     and private.my_session_is_live()
     and private.my_second_step_is_done();
$$;

/**
 * When the caller's pass to the court room runs out. As 20261020160000, with
 * leave to answer: a suspended account has a pass only while its leave lasts,
 * and never past the leave's end. A suspended leader counts as somebody called
 * to a case, not as leadership.
 */
create or replace function private.court_pass_until()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims    jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  leader    boolean;
  suspended boolean;
  leave_end timestamptz;
  latest    bigint;
  pass_end  timestamptz;
begin
  if coalesce(claims ->> 'role', '') <> 'authenticated' or (select auth.uid()) is null then
    return null;
  end if;

  select p.role in ('admin', 'executive') and p.suspended_at is null,
         p.suspended_at is not null
    into leader, suspended
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_approved;
  if leader is null then
    return null;
  end if;

  if suspended then
    leave_end := private.court_leave_ends();
    if leave_end is null then
      return null;
    end if;
  end if;

  if leader and coalesce(claims ->> 'aal', '') <> 'aal2' then
    return null;
  end if;

  select max((e ->> 'timestamp')::bigint) into latest
    from jsonb_array_elements(
           case when jsonb_typeof(claims -> 'amr') = 'array'
                then claims -> 'amr' else '[]'::jsonb end) as e
   where coalesce(e ->> 'timestamp', '') ~ '^[0-9]{1,12}$'
     and (not leader or e ->> 'method' = 'totp');

  if latest is null then
    return null;
  end if;
  pass_end := to_timestamp(latest) + make_interval(mins => private.court_pass_minutes());
  if suspended then
    pass_end := least(pass_end, leave_end);
  end if;
  return pass_end;
end;
$$;

/**
 * This person's place in a case. As 20261020160000, except for a suspended
 * account: its place is the part it was called to in the one case it has
 * leave to answer, and nothing anywhere else -- not the bench, not the
 * gallery, not another case it is called to.
 */
create or replace function private.court_place(p_trial uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when me.suspended_at is not null then
      case when private.court_leave_case() = t.id
                and tp.part in ('accused', 'reporter', 'witness')
           then tp.part end
    when t.head_judge_id = (select auth.uid()) then 'judge'
    when tp.part is not null then tp.part
    when t.opened_by = (select auth.uid()) then 'opener'
    else null
  end
  from public.trials t
  left join public.profiles me on me.id = (select auth.uid())
  left join public.trial_parties tp
    on tp.trial_id = t.id and tp.person_id = (select auth.uid())
  where t.id = p_trial;
$$;

/** In this case at all, through the door: a place in it, or entitled to a gallery seat. */
create or replace function public.in_trial(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.court_door_open()
     and (private.court_place(p_trial) is not null or private.may_sit_on_trial(p_trial));
$$;

/**
 * May this person watch a hearing? As 20260916130000, except that a suspended
 * leader is not leadership, and a case about a leader stays with Executive
 * Directors after that leader's account has gone.
 */
create or replace function private.may_sit_on_trial(p_trial uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me      public.profiles%rowtype;
  t       public.trials%rowtype;
  accused public.profiles%rowtype;
begin
  select * into t from public.trials where id = p_trial;
  if t.id is null then return false; end if;

  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved or me.suspended_at is not null then return false; end if;
  if me.role not in ('admin', 'executive') then return false; end if;

  -- The church, with the executive link as well as the column, because an
  -- Executive Director oversees a church without necessarily belonging to it.
  if not (
    (me.role = 'admin' and me.church_id = t.church_id)
    or (me.role = 'executive' and (
          me.church_id = t.church_id
          or exists (select 1 from public.church_executives ce
                     where ce.executive_id = me.id and ce.church_id = t.church_id)))
  ) then
    return false;
  end if;

  -- NEVER YOUR OWN CASE FROM THE BENCH. They keep their seat as the accused.
  if me.id = t.subject_id then return false; end if;

  -- A CASE ABOUT LEADERSHIP IS EXECUTIVE DIRECTORS'.
  select * into accused from public.profiles where id = t.subject_id;
  if coalesce(accused.role::text, t.subject_role) in ('admin', 'executive') and me.role <> 'executive' then
    return false;
  end if;

  return true;
end;
$function$;

-- Speaking by posting directly: the same place rule as court_say, so leave to
-- answer one case is never a voice in another.
drop policy if exists trial_statements_speak on public.trial_statements;
create policy trial_statements_speak on public.trial_statements
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and private.court_door_open()
    and exists (
      select 1 from public.trials t
      where t.id = trial_statements.trial_id and t.status = 'open'
    )
    and coalesce(private.court_place(trial_statements.trial_id)
                 in ('judge', 'accused', 'reporter', 'witness'), false)
  );

/**
 * End a leave: write when and why, and if the account is still suspended,
 * switch it off again and end every session it holds -- the same three steps
 * a suspension takes, so nothing it signed in with outlives the leave.
 */
create or replace function private.court_close_leave(p_leave uuid, p_why text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l      public.court_leave%rowtype;
  person public.profiles%rowtype;
begin
  update public.court_leave
     set ended_at = now(), ended_why = p_why
   where id = p_leave and ended_at is null
  returning * into l;
  if l.id is null then
    return;
  end if;

  select * into person from public.profiles where id = l.person_id;
  if person.suspended_at is not null then
    update auth.users
       set banned_until = now() + interval '100 years', updated_at = now()
     where id = l.person_id;
    delete from auth.sessions       where user_id = l.person_id;
    delete from auth.refresh_tokens where user_id = l.person_id::text;
  end if;

  begin
    perform private.court_append(l.trial_id, 'leave_ended', l.person_id::text,
      coalesce(person.full_name, 'Someone') || '''s leave to answer ended: '
        || case p_why when 'ended'       then 'the judge ended it'
                      when 'ran_out'     then 'its time ran out'
                      when 'case_closed' then 'the case was decided'
                      when 'lifted'      then 'their suspension was lifted'
                      else 'they are no longer called to the case' end);
  exception when others then
    -- The case may be going too; the leave is ended either way.
    null;
  end;
end;
$$;

/**
 * The judge gives somebody called to the case, whose account is suspended,
 * leave to sign in and answer it: for 1, 24, 72 or 168 hours, and never past
 * the verdict. Answers 'ok' or the reason it would not.
 */
create or replace function public.court_grant_leave(p_trial uuid, p_person uuid, p_hours integer default 24)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t        public.trials%rowtype;
  person   public.profiles%rowtype;
  judge    public.profiles%rowtype;
  current_ public.court_leave%rowtype;
  v_ends   timestamptz;
  about_lead boolean;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge gives leave to answer.';
  end if;
  if t.status <> 'open' then return 'This case is closed.'; end if;
  if coalesce(p_hours, 0) not in (1, 24, 72, 168) then
    return 'Leave lasts an hour, a day, three days or a week.';
  end if;

  select * into person from public.profiles where id = p_person;
  if person.id is null or not exists (
    select 1 from public.trial_parties tp
     where tp.trial_id = p_trial and tp.person_id = p_person
       and tp.part in ('accused', 'reporter', 'witness')
  ) then
    return 'Only somebody called to this case can be given leave to answer it.';
  end if;
  if person.suspended_at is null then
    return 'Their account is not suspended, so they can already answer.';
  end if;
  if not person.is_approved then
    return 'Their account was never approved, so it cannot be let in.';
  end if;

  select * into current_ from public.court_leave
   where person_id = p_person and ended_at is null;
  if current_.id is not null and current_.trial_id <> p_trial then
    if current_.ends_at > now() then
      return 'They have leave to answer another case. That leave must end first.';
    end if;
    perform private.court_close_leave(current_.id, 'ran_out');
    current_ := null;
  end if;

  v_ends := now() + make_interval(hours => p_hours);
  select * into judge from public.profiles where id = (select auth.uid());

  if current_.id is not null then
    update public.court_leave set ends_at = v_ends where id = current_.id;
  else
    insert into public.court_leave (trial_id, person_id, granted_by, granted_name, ends_at)
    values (p_trial, p_person, judge.id, coalesce(judge.full_name, 'Someone'), v_ends);
  end if;

  -- THE TEMPORARY LIFT. The sign-in service lets the account in again; the
  -- suspension itself (profiles.suspended_at) is untouched, and it is what
  -- every other door in the app still asks.
  update auth.users set banned_until = null, updated_at = now() where id = p_person;

  perform private.court_append(p_trial, 'leave_granted', p_person::text,
    coalesce(person.full_name, 'Someone') || ' given leave to sign in and answer this case until '
      || to_char(v_ends at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
      || '. The rest of the app stays closed to them.');

  insert into public.notifications (user_id, type, title, body)
  values (p_person, 'trial', 'You may sign in to answer a case',
          'A church leader has let you sign in to answer a case in the court room. '
          || 'Only the court room opens; the rest of the app stays closed.');

  -- The church's leaders are told, so an account is never let in quietly.
  about_lead := coalesce(t.subject_role in ('admin', 'executive'), false);
  insert into public.notifications (user_id, type, title, body)
  select p.id, 'trial', 'A suspended member may answer a case',
         coalesce(judge.full_name, 'The judge') || ' let ' || coalesce(person.full_name, 'a suspended member')
           || ' sign in to answer a case, until '
           || to_char(v_ends at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC. Nothing else opens for them.'
    from public.profiles p
   where p.is_approved and p.suspended_at is null
     and p.role in ('admin', 'executive')
     and p.id <> judge.id
     and p.id is distinct from t.subject_id
     and p.id <> p_person
     and (not about_lead or p.role = 'executive')
     and (p.church_id = t.church_id
          or (p.role = 'executive' and exists (
                select 1 from public.church_executives ce
                 where ce.executive_id = p.id and ce.church_id = t.church_id)));

  return 'ok';
end;
$$;

/** The judge ends somebody's leave before its time. */
create or replace function public.court_end_leave(p_trial uuid, p_person uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_leave uuid;
begin
  perform private.court_require_door();
  if coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge ends leave to answer.';
  end if;
  select l.id into v_leave from public.court_leave l
   where l.trial_id = p_trial and l.person_id = p_person and l.ended_at is null;
  if v_leave is null then
    return 'They have no leave to answer this case.';
  end if;
  perform private.court_close_leave(v_leave, 'ended');
  return 'ok';
end;
$$;

/**
 * End every leave whose reason has gone: its time ran out, its case was
 * decided, the suspension was lifted, or the person is no longer called to the
 * case. Run every minute. Until it runs, an expired leave already opens
 * nothing (every check asks for one that has not run out); this is what
 * switches the account off again and ends its sessions.
 */
create or replace function private.court_leave_sweep()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l   record;
  n   integer := 0;
  why text;
begin
  for l in
    select cl.id, cl.ends_at, t.status, p.suspended_at,
           exists (select 1 from public.trial_parties tp
                    where tp.trial_id = cl.trial_id and tp.person_id = cl.person_id
                      and tp.part in ('accused', 'reporter', 'witness')) as called
      from public.court_leave cl
      join public.trials t on t.id = cl.trial_id
      left join public.profiles p on p.id = cl.person_id
     where cl.ended_at is null
  loop
    why := case
      when l.ends_at <= now() then 'ran_out'
      when l.status <> 'open' then 'case_closed'
      when l.suspended_at is null then 'lifted'
      when not l.called then 'not_called'
    end;
    if why is not null then
      perform private.court_close_leave(l.id, why);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

select cron.schedule('court-leave-runs-out', '* * * * *', 'select private.court_leave_sweep()');

/**
 * Before every request to the data API. As 20261013140000, with one door left
 * ajar: an account answering a case on leave may make the court room's own
 * calls, and nothing else. Which call it is comes from the address the data
 * API was asked (`request.path`), which it sets itself; nothing the caller
 * sends can change it. The checks for an ended session and a second step
 * still apply to that account, as to everybody.
 */
create or replace function public.refuse_suspended_requests()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- Signed out (no uid) or not suspended: carry on. This runs before EVERY
  -- request, so it does one indexed lookup and nothing else.
  if exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.suspended_at is not null
  ) then
    if not (
      coalesce(current_setting('request.path', true), '') ~
        '^/rpc/(court_door|court_cases|court_case|court_say|court_check_record|court_exported|court_exhibit_begin|court_exhibit_seal|court_exhibit_write|court_exhibit_handled)/?$'
      and private.court_leave_case() is not null
    ) then
      raise exception 'This account is suspended.'
        using errcode = '42501',
              hint = 'A leader has suspended this account. Sign-in is closed until they lift it.';
    end if;
  end if;
  -- And a session that has been ended is ended now, not when its pass expires.
  if not private.my_session_is_live() then
    raise exception 'This sign-in has ended.'
      using errcode = 'PT401',
            hint = 'It was signed out, or its password was changed. Sign in again.';
  end if;
  -- And somebody who set up two-step sign-in has finished both steps.
  if not private.my_second_step_is_done() then
    raise exception 'Two-step sign-in is needed.'
      using errcode = 'PT403',
            hint = 'Enter the six-digit code from your authenticator app to finish signing in.';
  end if;
end;
$function$;

grant execute on function public.refuse_suspended_requests() to anon, authenticated;

-- The file store: as 20260923173000, except that an account answering on
-- leave reaches the court room's exhibits (and the exhibit rules then decide
-- which), and nothing else that is stored.
drop policy if exists a_suspended_account_sees_nothing on storage.objects;
create policy a_suspended_account_sees_nothing on storage.objects
  as restrictive for all to authenticated
  using ((select private.i_am_not_suspended())
         or (bucket_id = 'court-exhibits' and (select private.court_answering())))
  with check ((select private.i_am_not_suspended())
              or (bucket_id = 'court-exhibits' and (select private.court_answering())));

/**
 * What the door needs from this person. As 20261020160000, and it also says
 * who is asking (their own name and role), whether their account is
 * suspended, and what leave to answer they hold, so the court room can be
 * drawn for somebody whose profile is otherwise closed to them.
 */
create or replace function public.court_door()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me        public.profiles%rowtype;
  until_    timestamptz := private.court_pass_until();
  two_step  boolean;
  open_     boolean;
  leave_on  uuid := private.court_leave_case();
  suspended boolean;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    return jsonb_build_object('open', false, 'needs', 'sign_in');
  end if;
  suspended := me.suspended_at is not null;
  two_step := exists (
    select 1 from auth.mfa_factors f
     where f.user_id = me.id and f.status::text = 'verified');
  open_ := coalesce(until_ > now(), false);
  return jsonb_build_object(
    'open',      open_,
    'until',     until_,
    'minutes',   private.court_pass_minutes(),
    'leader',    me.role in ('admin', 'executive') and not suspended,
    'two_step',  two_step,
    'suspended', suspended,
    'leave',     case when leave_on is null then null
                      else jsonb_build_object('case', leave_on, 'until', private.court_leave_ends()) end,
    'me',        jsonb_build_object('id', me.id, 'name', coalesce(me.full_name, ''), 'role', me.role),
    'needs', case
      when open_ then null
      when suspended and leave_on is null then 'suspended'
      when me.role in ('admin', 'executive') and not suspended and not two_step then 'two_step'
      when two_step then 'code'
      else 'password'
    end);
end;
$$;

-- ================================================ one person's share, limited ===

/**
 * Stamp a statement as it goes in, whoever sends it. As 20261020160000, with
 * a limit no honest hearing reaches: thirty statements by one person in one
 * case in ten minutes. It is here, in the one place every statement passes,
 * so posting directly does not get round it.
 */
create or replace function private.court_statement_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.trial_statements s
       where s.trial_id = new.trial_id and s.author_id = new.author_id
         and s.created_at > clock_timestamp() - interval '10 minutes') >= 30 then
    raise exception 'That is a great deal in a few minutes. Wait a little, then add the rest.';
  end if;
  new.id          := gen_random_uuid();
  new.created_at  := clock_timestamp();
  new.body_sha256 := private.court_sha256(new.body);
  new.author_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.author_id), 'Someone');
  if new.for_person is not null then
    new.for_name := coalesce(
      (select p.full_name from public.profiles p where p.id = new.for_person), new.for_name, 'Someone');
  end if;
  return new;
end;
$$;

/** Thirty exhibits by one person in one case in an hour, entered or waiting. */
create or replace function private.court_exhibit_room(p_trial uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.court_exhibits e
       where e.trial_id = p_trial and e.entered_by = (select auth.uid())
         and e.entered_at > now() - interval '1 hour') >= 30 then
    raise exception 'That is a great many exhibits in an hour. Wait a little, then enter the rest.';
  end if;
end;
$$;

/** Begin entering a file as an exhibit. As 20261020160000, with the limit above. */
create or replace function public.court_exhibit_begin(
  p_trial     uuid,
  p_title     text,
  p_file_name text,
  p_mime      text,
  p_size      bigint,
  p_sha256    text,
  p_note      text default null,
  p_shown_to  text default 'everyone'
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_path text;
begin
  perform private.court_require_door();
  if not private.court_may_present(p_trial) then
    raise exception 'Only the judge and the people called to this case can enter an exhibit.'
      using errcode = '42501';
  end if;
  if p_sha256 is null or lower(p_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'The file''s fingerprint is missing. Choose the file again.';
  end if;
  if p_size is null or p_size < 1 or p_size > 26214400 then
    raise exception 'An exhibit can be up to 25 MB.';
  end if;
  if (select count(*) from public.court_exhibits
       where trial_id = p_trial and entered_by = (select auth.uid()) and status = 'pending') >= 10 then
    raise exception 'Finish the exhibits already started before adding more.';
  end if;
  perform private.court_exhibit_room(p_trial);

  v_path := p_trial::text || '/' || v_id::text;
  insert into public.court_exhibits
    (id, trial_id, kind, title, note, file_name, mime, size_bytes, sha256, path,
     shown_to, entered_by, entered_name)
  values
    (v_id, p_trial, 'file', btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
     left(btrim(coalesce(p_file_name, 'file')), 200), nullif(btrim(coalesce(p_mime, '')), ''),
     p_size, lower(p_sha256), v_path,
     case when p_shown_to = 'bench' then 'bench' else 'everyone' end,
     (select auth.uid()),
     coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), 'Someone'));

  return jsonb_build_object('id', v_id, 'bucket', 'court-exhibits', 'path', v_path);
end;
$$;

/** Enter something written as an exhibit. As 20261020160000, with the limit above. */
create or replace function public.court_exhibit_write(
  p_trial    uuid,
  p_title    text,
  p_writing  text,
  p_note     text default null,
  p_shown_to text default 'everyone'
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  perform private.court_require_door();
  if not private.court_may_present(p_trial) then
    raise exception 'Only the judge and the people called to this case can enter an exhibit.'
      using errcode = '42501';
  end if;
  perform private.court_exhibit_room(p_trial);
  insert into public.court_exhibits
    (id, trial_id, kind, title, note, writing, sha256, shown_to, entered_by, entered_name)
  values
    (v_id, p_trial, 'writing', btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
     p_writing, private.court_sha256(p_writing),
     case when p_shown_to = 'bench' then 'bench' else 'everyone' end,
     (select auth.uid()),
     coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), 'Someone'));
  return private.court_enter_exhibit(v_id);
end;
$$;

/**
 * Somebody opened an exhibit, or checked its fingerprint. As 20261020160000,
 * with "it differed" also written once per person per exhibit per pass: the
 * first tells the judge at once; repeating it from the same device adds
 * nothing the judge does not already know.
 */
create or replace function public.court_exhibit_handled(p_exhibit uuid, p_what text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e   public.court_exhibits%rowtype;
  v_act text;
begin
  perform private.court_require_door();
  select * into e from public.court_exhibits where id = p_exhibit;
  if e.id is null or not private.court_may_see_exhibit(p_exhibit) then
    raise exception 'That exhibit is not one you can see.' using errcode = '42501';
  end if;
  v_act := case p_what when 'viewed' then 'exhibit_viewed'
                     when 'matched' then 'exhibit_matched'
                     when 'differed' then 'exhibit_differed' end;
  if v_act is null then
    raise exception 'Say viewed, matched or differed.';
  end if;

  if exists (
    select 1 from public.court_record r
     where r.trial_id = e.trial_id and r.act = v_act
       and r.actor_id = (select auth.uid()) and r.about = e.id::text
       and r.at > now() - make_interval(mins => private.court_pass_minutes())
  ) then
    return;
  end if;

  perform private.court_append(e.trial_id, v_act, e.id::text,
    'Exhibit ' || e.label || ': ' || e.title
      || case v_act when 'exhibit_matched' then ', fingerprint matches the record'
                  when 'exhibit_differed' then ', fingerprint DOES NOT match the record'
                  else '' end);

  if v_act = 'exhibit_differed' then
    insert into public.notifications (user_id, type, title, body)
    select t.head_judge_id, 'trial', 'An exhibit did not match its fingerprint',
           'Exhibit ' || e.label || ' was checked on a device and its bytes were not the ones recorded. Open the case.'
      from public.trials t
     where t.id = e.trial_id and t.head_judge_id is not null;
  end if;
end;
$$;

/** The record was printed or saved. Written down once a minute per person, however often it is asked. */
create or replace function public.court_exported(p_trial uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.court_require_door();
  if private.court_place(p_trial) is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.court_record r
     where r.trial_id = p_trial and r.act = 'record_exported'
       and r.actor_id = (select auth.uid()) and r.at > now() - interval '1 minute'
  ) then
    return;
  end if;
  perform private.court_append(p_trial, 'record_exported', '', 'A copy of the record was saved');
end;
$$;

-- ============================================= calling, and deciding, again ==

/**
 * Call a witness: a member of the case's church, told at once. As
 * 20261020160000, except that a suspended member may now be called; the judge
 * then gives them leave to answer, or writes down what they say.
 */
create or replace function public.court_summon(p_trial uuid, p_person uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t      public.trials%rowtype;
  person public.profiles%rowtype;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge calls a witness.';
  end if;
  if t.status <> 'open' then return 'This case is closed.'; end if;
  select * into person from public.profiles where id = p_person;
  if person.id is null or person.church_id is distinct from t.church_id or not person.is_approved then
    return 'That person is not a member of this church who can be called.';
  end if;
  if person.id = t.head_judge_id then
    return 'The judge cannot also be a witness.';
  end if;
  if exists (select 1 from public.trial_parties tp
              where tp.trial_id = p_trial and tp.person_id = p_person) then
    return 'They are already in this case.';
  end if;

  insert into public.trial_parties (trial_id, person_id, part)
  values (p_trial, p_person, 'witness');

  insert into public.notifications (user_id, type, title, body)
  values (p_person, 'trial', 'You have been called to a trial room',
          'A Director has opened a case and asked to hear from you.');

  perform private.court_append(p_trial, 'summoned', p_person::text,
    coalesce(person.full_name, 'Someone') || ' called as a witness'
      || case when person.suspended_at is not null then ' (their account is suspended)' else '' end);
  return 'ok';
end;
$$;

/**
 * Decide the case. As 20261020160000, in the order the record should read:
 * whether the verdict can be carried out is asked first, then the verdict is
 * sealed, then any leave to answer ends, then the verdict is carried out. A
 * verdict that cannot be carried out is never sealed; one that fails while
 * being carried out undoes everything, the seal included.
 */
create or replace function public.close_trial(
  p_trial   uuid,
  p_verdict text,
  p_note    text default null
)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  t      public.trials%rowtype;
  result text := 'ok';
  seal   text;
  l      record;
begin
  if not private.court_door_open() then return 'The court room is locked.'; end if;
  select * into t from public.trials where id = p_trial;
  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if t.head_judge_id is distinct from (select auth.uid()) then
    return 'Only the head judge can decide this case.';
  end if;
  if p_verdict not in ('dismissed', 'suspended', 'removed') then
    return 'A case ends dismissed, suspended or removed.';
  end if;

  if p_verdict in ('suspended', 'removed') then
    if t.subject_id is null then
      return 'The account of the person this case is about has been deleted, so the case can only be dismissed.';
    end if;
    result := public.discipline_check(t.subject_id);
    if result <> 'ok' then return result; end if;
  end if;

  seal := private.court_append(p_trial, 'verdict',
    private.court_sha256(p_verdict || chr(10) || coalesce(btrim(p_note), '')),
    'Verdict: ' || p_verdict
      || coalesce(' -- ' || nullif(btrim(coalesce(p_note, '')), ''), ''));

  update public.trials
     set status = 'closed', verdict = p_verdict,
         verdict_note = nullif(btrim(coalesce(p_note, '')), ''),
         closed_at = now(),
         seal_hash = seal, sealed_at = now()
   where id = p_trial;

  for l in select cl.id from public.court_leave cl
            where cl.trial_id = p_trial and cl.ended_at is null loop
    perform private.court_close_leave(l.id, 'case_closed');
  end loop;

  if p_verdict = 'suspended' then
    result := public.suspend_member(t.subject_id, coalesce(p_note, t.summary));
  elsif p_verdict = 'removed' then
    result := public.remove_member_by_leader(t.subject_id);
  end if;
  if result <> 'ok' then
    raise exception '%', result;
  end if;

  if t.report_id is not null then
    update public.reports
       set status = case when p_verdict = 'dismissed' then 'dismissed' else 'actioned' end,
           decided_by = (select auth.uid()),
           decided_at = now(),
           outcome = 'Trial: ' || p_verdict
     where id = t.report_id and status = 'open' and church_id = t.church_id;
  end if;

  if p_verdict <> 'removed' then
    insert into public.notifications (user_id, type, title, body)
    select tp.person_id, 'trial', 'The trial room reached a decision',
           'The case was ' || p_verdict || '.'
    from public.trial_parties tp
    where tp.trial_id = p_trial and tp.part <> 'observer';
  end if;

  return 'ok';
end;
$$;

-- ======================================================= the case, in full ==

/**
 * Every case this person may see. As 20261020160000, with an account that has
 * gone shown as deleted.
 */
create or replace function public.court_cases()
returns table (
  id            uuid,
  summary       text,
  status        text,
  verdict       text,
  verdict_note  text,
  opened_at     timestamptz,
  closed_at     timestamptz,
  subject_name  text,
  subject_role  text,
  opener_name   text,
  judge_name    text,
  escalation    text,
  gallery_open  boolean,
  seal_hash     text,
  my_place      text,
  may_watch     boolean,
  watching      bigint,
  exhibits      bigint,
  statements    bigint,
  touched_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i_lead boolean;
begin
  perform private.court_require_door();
  select p.role in ('admin', 'executive') and p.suspended_at is null into i_lead
    from public.profiles p where p.id = (select auth.uid());

  return query
  select t.id, t.summary, t.status, t.verdict, t.verdict_note, t.opened_at, t.closed_at,
         case when t.subject_id is null then private.name_kept(null, t.subject_name)
              else coalesce(t.subject_name, s.full_name, 'Someone') end,
         case when i_lead then coalesce(s.role::text, t.subject_role) else null end,
         private.name_kept(t.opened_by, t.opener_name),
         private.name_kept(t.head_judge_id, t.judge_name),
         case when i_lead then t.escalation else null end,
         t.gallery_open,
         t.seal_hash,
         private.court_place(t.id),
         private.court_place(t.id) is null and t.status = 'open' and t.gallery_open,
         case when i_lead then (select count(*) from public.trial_parties tp
                                 where tp.trial_id = t.id and tp.part = 'observer') else null end,
         (select count(*) from public.court_exhibits e
           where e.trial_id = t.id and e.status = 'entered'
             and (e.shown_to = 'everyone' or private.court_on_the_bench(t.id))),
         (select count(*) from public.trial_statements st where st.trial_id = t.id),
         t.touched_at
    from public.trials t
    left join public.profiles s on s.id = t.subject_id
   where private.court_place(t.id) is not null or private.may_sit_on_trial(t.id)
   order by t.status = 'open' desc, t.touched_at desc;
end;
$$;

/**
 * One case, as the person asking may see it. As 20261020160000, with an
 * account that has gone shown as deleted wherever its name appears, those
 * called who have gone kept among the people, and for the bench, who is
 * suspended and who holds leave to answer.
 */
create or replace function public.court_case(p_trial uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t      public.trials%rowtype;
  place  text;
  bench  boolean;
  i_lead boolean;
  me     uuid := (select auth.uid());
  subject_suspended boolean;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  place := private.court_place(p_trial);
  if t.id is null or place is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  bench := place in ('judge', 'opener', 'observer');
  select p.role in ('admin', 'executive') and p.suspended_at is null into i_lead
    from public.profiles p where p.id = me;
  select p.suspended_at is not null into subject_suspended
    from public.profiles p where p.id = t.subject_id;

  if not exists (
    select 1 from public.court_record r
     where r.trial_id = p_trial and r.act = 'record_opened' and r.actor_id = me
       and r.at > now() - make_interval(mins => private.court_pass_minutes())
  ) then
    perform private.court_append(p_trial, 'record_opened', '', 'Opened the case');
  end if;

  return jsonb_build_object(
    'case', jsonb_build_object(
      'id', t.id, 'summary', t.summary, 'status', t.status,
      'verdict', t.verdict, 'verdict_note', t.verdict_note,
      'opened_at', t.opened_at, 'closed_at', t.closed_at,
      'subject_id', t.subject_id,
      'subject_name', case when t.subject_id is null then private.name_kept(null, t.subject_name)
                           else coalesce(t.subject_name, 'Someone') end,
      'subject_deleted', t.subject_id is null,
      'subject_suspended', case when bench then coalesce(subject_suspended, false) else null end,
      'opener_name', private.name_kept(t.opened_by, t.opener_name),
      'judge_id', t.head_judge_id,
      'judge_name', private.name_kept(t.head_judge_id, t.judge_name),
      'escalation', case when i_lead then t.escalation else null end,
      'gallery_open', t.gallery_open,
      'seal_hash', t.seal_hash, 'sealed_at', t.sealed_at,
      'my_place', place,
      'i_lead', coalesce(i_lead, false),
      'my_leave_until', (select l.ends_at from public.court_leave l
                          where l.trial_id = p_trial and l.person_id = me
                            and l.ended_at is null and l.ends_at > now()),
      'may_speak', t.status = 'open' and place in ('judge', 'accused', 'reporter', 'witness'),
      'may_present', t.status = 'open' and place in ('judge', 'accused', 'reporter', 'witness'),
      'may_decide', t.status = 'open' and place = 'judge'),
    'people', coalesce((
      select jsonb_agg(q.person order by q.since nulls last)
        from (
          select tp.summoned_at as since, jsonb_build_object(
                   'id', tp.person_id,
                   'name', coalesce(p.full_name, 'Someone'),
                   'part', tp.part,
                   'since', tp.summoned_at,
                   'deleted', false,
                   'suspended', case when bench then p.suspended_at is not null else null end,
                   'leave_until', case when bench then (
                       select l.ends_at from public.court_leave l
                        where l.trial_id = p_trial and l.person_id = tp.person_id
                          and l.ended_at is null and l.ends_at > now()) else null end) as person
            from public.trial_parties tp
            left join public.profiles p on p.id = tp.person_id
           where tp.trial_id = p_trial and (tp.part <> 'observer' or bench)
          union all
          select d.summoned_at, jsonb_build_object(
                   'id', d.person_id,
                   'name', private.name_kept(null, d.person_name),
                   'part', d.part,
                   'since', d.summoned_at,
                   'deleted', true,
                   'suspended', null,
                   'leave_until', null)
            from public.court_departed d
           where d.trial_id = p_trial and (d.part <> 'observer' or bench)
        ) q), '[]'::jsonb),
    'statements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'author_id', s.author_id,
               'author_name', case when s.author_id is null then private.name_kept(null, s.author_name)
                                   else coalesce(s.author_name, 'Someone') end,
               'for_name', case when s.for_person is not null
                                     and not exists (select 1 from public.profiles fp where fp.id = s.for_person)
                                then private.name_kept(null, s.for_name)
                                else s.for_name end,
               'body', s.body,
               'sha256', s.body_sha256,
               'at', s.created_at) order by s.created_at, s.id)
        from public.trial_statements s
       where s.trial_id = p_trial), '[]'::jsonb),
    'exhibits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'label', e.label, 'kind', e.kind, 'title', e.title,
               'note', e.note, 'file_name', e.file_name, 'mime', e.mime,
               'size_bytes', e.size_bytes, 'writing', e.writing,
               'sha256', e.sha256, 'path', e.path, 'shown_to', e.shown_to,
               'entered_name', case when e.entered_by is not null
                                         and not exists (select 1 from public.profiles ep where ep.id = e.entered_by)
                                    then private.name_kept(null, e.entered_name)
                                    else e.entered_name end,
               'entered_at', e.entered_at)
             order by e.entered_at)
        from public.court_exhibits e
       where e.trial_id = p_trial and e.status = 'entered'
         and (e.shown_to = 'everyone' or bench)), '[]'::jsonb),
    'record', case when bench then coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', r.seq, 'at', r.at, 'at_us', r.at_us,
               'actor_id', r.actor_id, 'actor_name', r.actor_name,
               'act', r.act, 'about', r.about, 'detail', r.detail,
               'prev_hash', r.prev_hash, 'hash', r.hash) order by r.seq)
        from public.court_record r
       where r.trial_id = p_trial), '[]'::jsonb) else null end);
end;
$$;

-- ================================================================== grants ==

revoke all on function private.name_kept(uuid, text)                     from public, anon, authenticated;
revoke all on function private.report_keeps_names()                     from public, anon, authenticated;
revoke all on function private.report_message_keeps_name()              from public, anon, authenticated;
revoke all on function private.report_file_keeps_name()                 from public, anon, authenticated;
revoke all on function private.reports_remember_the_departed()          from public, anon, authenticated;
revoke all on function private.tell_report_handlers(uuid, text)         from public, anon, authenticated;
revoke all on function private.court_trial_keeps_role()                 from public, anon, authenticated;
revoke all on function private.court_remembers_the_departed()           from public, anon, authenticated;
revoke all on function private.court_leave_case()                       from public, anon, authenticated;
revoke all on function private.court_leave_ends()                       from public, anon, authenticated;
revoke all on function private.court_answering()                        from public, anon;
revoke all on function private.court_close_leave(uuid, text)            from public, anon, authenticated;
revoke all on function private.court_leave_sweep()                      from public, anon, authenticated;
revoke all on function private.court_exhibit_room(uuid)                 from public, anon, authenticated;

-- Asked by the file store's rule, as the person. The others are asked only
-- from inside the court's own functions, as their owner.
grant execute on function private.court_answering() to authenticated;

revoke all on function public.court_grant_leave(uuid, uuid, integer) from public, anon;
revoke all on function public.court_end_leave(uuid, uuid)            from public, anon;
grant execute on function public.court_grant_leave(uuid, uuid, integer) to authenticated;
grant execute on function public.court_end_leave(uuid, uuid)            to authenticated;

-- Restated for every function this replaced, as the one it replaced had them.
revoke all on function public.court_door()                                       from public, anon;
revoke all on function public.court_cases()                                      from public, anon;
revoke all on function public.court_case(uuid)                                   from public, anon;
revoke all on function public.court_summon(uuid, uuid)                           from public, anon;
revoke all on function public.court_exported(uuid)                               from public, anon;
revoke all on function public.court_exhibit_begin(uuid, text, text, text, bigint, text, text, text) from public, anon;
revoke all on function public.court_exhibit_write(uuid, text, text, text, text)  from public, anon;
revoke all on function public.court_exhibit_handled(uuid, text)                  from public, anon;
revoke all on function public.in_trial(uuid)                                     from public, anon;
revoke all on function public.close_trial(uuid, text, text)                      from public, anon;
grant execute on function public.court_door()                                       to authenticated;
grant execute on function public.court_cases()                                      to authenticated;
grant execute on function public.court_case(uuid)                                   to authenticated;
grant execute on function public.court_summon(uuid, uuid)                           to authenticated;
grant execute on function public.court_exported(uuid)                               to authenticated;
grant execute on function public.court_exhibit_begin(uuid, text, text, text, bigint, text, text, text) to authenticated;
grant execute on function public.court_exhibit_write(uuid, text, text, text, text)  to authenticated;
grant execute on function public.court_exhibit_handled(uuid, text)                  to authenticated;
grant execute on function public.in_trial(uuid)                                     to authenticated;
grant execute on function public.close_trial(uuid, text, text)                      to authenticated;

commit;
