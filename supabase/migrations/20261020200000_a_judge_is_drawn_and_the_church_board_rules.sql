-- A judge is drawn at random, the hearing ends with a recommendation, and the
-- Church Board gives the final ruling. And the room knows who is in it.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR (20 October 2026), in the owner's words: "The judge will be random
-- picked by the Church Directors base on the case, the final ruling will be
-- outside of the Court and will be presented by the Church Board, they will be
-- the people who will have the final words to say." And: "I want the UI to be
-- some kind of a game avatar for live session court."
--
-- WHAT THIS DOES:
--
--   1. THE JUDGE IS DRAWN. Opening a case no longer makes its opener the
--      judge. The database draws one at random from the leaders free to hear
--      it: the case church's Directors, or, for a case about a Director or an
--      Executive Director, the Executive Directors over that church; never the
--      person it is about, never anybody called to it, never somebody who
--      stepped down from it, and only somebody who can open the court room's
--      door (two-step sign-in set up). Never the Director who brought it,
--      either, unless nobody else is free, and then the record says so.
--
--      THE DRAW CAN BE CHECKED. It is not a secret random number. The pool,
--      sorted, and who was drawn are written on the case's record, and the
--      draw is the SHA-256 of "Hope Beacon judge draw", the case's id and the
--      hash of the record's entry before the draw, taken modulo the size of
--      the pool. Nobody can choose that hash in advance, and anybody on the
--      bench can work the draw out again on their own device.
--
--   2. A JUDGE CAN STEP DOWN, with a reason on the record; another is drawn.
--      If nobody else is free, the seat waits for an Executive Director, who
--      can take it as before.
--
--   3. THE HEARING ENDS WITH A RECOMMENDATION, NOT A VERDICT. The judge
--      closes the hearing recommending dismissal, counsel, suspension or
--      removal. The record is sealed there, nothing more can be said or
--      entered, any leave to answer ends, and NOTHING HAPPENS TO ANYBODY'S
--      ACCOUNT. The case waits for the Church Board.
--
--   4. THE CHURCH BOARD RULES, outside the court room. Its ruling is written
--      down by the judge (or a leader of the church who sat on the case): the
--      outcome, the Board's own words, who presented it and when. It goes on
--      the record after the seal, and only then is a suspension or a removal
--      carried out, if the person writing it down chooses to and the usual
--      rules let them. The old close_trial, which let a judge suspend or
--      remove somebody directly, now refuses and says why.
--
--   5. THE DIRECTOR WHO BROUGHT THE CASE PRESENTS IT. No longer its judge,
--      they may speak and enter exhibits, as the people called to it may.
--
--   6. WHO IS IN THE ROOM NOW. Each open screen says "I am here" every few
--      seconds (court_here); the case shows who has been seen in the last
--      minute and a bit. Presence is not written on the record: reading the
--      case already is.
-- ---------------------------------------------------------------------------

begin;

-- ================================================================ the case ==

alter table public.trials add column if not exists recommendation       text;
alter table public.trials add column if not exists recommendation_note  text;
alter table public.trials add column if not exists heard_at             timestamptz;
alter table public.trials add column if not exists ruling_words         text;
alter table public.trials add column if not exists ruling_presented_by  text;
alter table public.trials add column if not exists ruling_presented_on  date;
alter table public.trials add column if not exists ruling_recorded_by   uuid;
alter table public.trials add column if not exists ruling_recorded_name text;

alter table public.trials drop constraint if exists trials_recommendation_check;
alter table public.trials add constraint trials_recommendation_check
  check (recommendation is null or recommendation in ('dismiss', 'counsel', 'suspend', 'remove'));
alter table public.trials drop constraint if exists trials_ruling_words_check;
alter table public.trials add constraint trials_ruling_words_check
  check (ruling_words is null or length(btrim(ruling_words)) between 1 and 4000);

alter table public.trials drop constraint if exists trials_status_check;
alter table public.trials add constraint trials_status_check
  check (status in ('open', 'with_board', 'closed'));
alter table public.trials drop constraint if exists trials_verdict_check;
alter table public.trials add constraint trials_verdict_check
  check (verdict in ('dismissed', 'counselled', 'suspended', 'removed'));
alter table public.trials drop constraint if exists trials_verdict_matches_status;
alter table public.trials add constraint trials_verdict_matches_status check (
  (status in ('open', 'with_board') and verdict is null and closed_at is null)
  or (status = 'closed' and verdict is not null and closed_at is not null));

alter table public.court_record drop constraint if exists court_record_act_check;
alter table public.court_record add constraint court_record_act_check check (act in (
  'opened', 'summoned', 'statement', 'statement_for',
  'exhibit', 'exhibit_viewed', 'exhibit_matched', 'exhibit_differed',
  'record_opened', 'record_exported', 'gallery_seat', 'setting',
  'judge_called', 'judge_seated', 'verdict',
  'account_deleted', 'leave_granted', 'leave_ended',
  'judge_drawn', 'judge_stepped_down', 'hearing_closed', 'ruling'));

-- ============================================================= the draw ===

/**
 * Who is free to judge this case, sorted by id: the leaders of its church who
 * can open the court room's door, and are not in it. The Director who brought
 * the case is in this list when free; court_draw_judge decides about them.
 */
create or replace function private.court_judge_pool(p_trial uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select tr.*, coalesce(
             (select p.role::text from public.profiles p where p.id = tr.subject_id),
             tr.subject_role) in ('admin', 'executive') as about_lead
      from public.trials tr where tr.id = p_trial
  )
  select coalesce(array_agg(p.id order by p.id::text collate "C"), '{}'::uuid[])
    from public.profiles p, t
   where p.is_approved
     and p.suspended_at is null
     and p.id is distinct from t.subject_id
     and exists (select 1 from auth.mfa_factors f
                  where f.user_id = p.id and f.status::text = 'verified')
     and not exists (select 1 from public.trial_parties tp
                      where tp.trial_id = t.id and tp.person_id = p.id
                        and tp.part in ('accused', 'reporter', 'witness'))
     and not exists (select 1 from public.court_record r
                      where r.trial_id = t.id and r.act = 'judge_stepped_down'
                        and r.actor_id = p.id)
     and (
       (not coalesce(t.about_lead, false) and p.role = 'admin' and p.church_id = t.church_id)
       or (coalesce(t.about_lead, false) and p.role = 'executive'
           and (p.church_id = t.church_id
                or exists (select 1 from public.church_executives ce
                            where ce.executive_id = p.id and ce.church_id = t.church_id)))
     );
$$;

/**
 * Draw this case's judge, seat them, write the draw on the record, and tell
 * them. Returns who was drawn, or null when nobody is free.
 *
 * THE DRAW, so anybody can check it: the pool sorted by id; seed = SHA-256 of
 * "Hope Beacon judge draw", a newline, the case id, a newline, and the hash of
 * the last record entry before the draw (the draw entry's own prev_hash); the
 * one drawn is pool[first 12 hex digits of the seed, as a number, modulo the
 * pool's size]. The entry's `about` is "drawn=<id>;from=<id>,<id>,...".
 */
create or replace function private.court_draw_judge(p_trial uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t        public.trials%rowtype;
  everyone uuid[];
  pool     uuid[];
  n        integer;
  head     text;
  seed     text;
  pick     uuid;
  who      public.profiles%rowtype;
  note     text := '';
begin
  select * into t from public.trials where id = p_trial for update;
  if t.id is null then return null; end if;

  everyone := private.court_judge_pool(p_trial);
  pool := array(select x from unnest(everyone) as x
                 where x is distinct from t.opened_by
                 order by x::text collate "C");
  if cardinality(pool) = 0 and t.opened_by = any(everyone) then
    pool := array[t.opened_by];
    note := '. Nobody else was free to hear it, so the leader who brought it was drawn';
  end if;
  n := cardinality(pool);
  if n = 0 then
    return null;
  end if;

  select r.hash into head from public.court_record r
   where r.trial_id = p_trial order by r.seq desc limit 1;
  head := coalesce(head, encode(extensions.digest(
            'Hope Beacon court record' || chr(10) || p_trial::text, 'sha256'), 'hex'));
  seed := encode(extensions.digest(
            'Hope Beacon judge draw' || chr(10) || p_trial::text || chr(10) || head, 'sha256'), 'hex');
  pick := pool[1 + (('x' || lpad(substr(seed, 1, 12), 16, '0'))::bit(64)::bigint % n)::integer];

  select * into who from public.profiles where id = pick;
  update public.trials
     set head_judge_id = pick, judge_name = coalesce(who.full_name, 'Someone')
   where id = p_trial;
  -- A judge needs no gallery seat.
  delete from public.trial_parties
   where trial_id = p_trial and person_id = pick and part = 'observer';

  perform private.court_append(p_trial, 'judge_drawn',
    'drawn=' || pick::text || ';from=' || array_to_string(pool, ','),
    'Judge drawn at random from ' || n::text || ' free to hear it: '
      || coalesce(who.full_name, 'Someone') || note);

  insert into public.notifications (user_id, type, title, body)
  values (pick, 'trial', 'You have been drawn to judge a case',
          'A case was opened in your church and you were drawn at random to hear it. It is in Admin Reports.');
  return pick;
end;
$$;

-- ====================================================== opening a case ===

/**
 * Open a case. As 20261020160000, except that its judge is drawn
 * (private.court_draw_judge) rather than being whoever opened it.
 */
create or replace function public.open_trial(
  p_subject uuid,
  p_summary text,
  p_report  uuid default null,
  p_other   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  me      public.profiles%rowtype;
  subject public.profiles%rowtype;
  other_  public.profiles%rowtype;
  allowed text;
  t_id    uuid;
  r       record;
  judge   uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved or me.suspended_at is not null then
    raise exception 'Your account cannot open a trial.';
  end if;
  if me.role not in ('admin', 'executive') then
    raise exception 'Only a Director or an Executive Director can open a trial.';
  end if;
  perform private.court_require_door();
  if btrim(coalesce(p_summary, '')) = '' then
    raise exception 'Say what the case is about.';
  end if;
  if length(btrim(p_summary)) > 2000 then
    raise exception 'Say what the case is about in 2000 characters or fewer.';
  end if;

  allowed := public.discipline_check(p_subject);
  if allowed <> 'ok' then raise exception '%', allowed; end if;

  select * into subject from public.profiles where id = p_subject;
  if subject.church_id is null then
    raise exception 'That person is not in a church.';
  end if;

  if p_other is not null and p_other <> p_subject and p_other <> me.id then
    select * into other_ from public.profiles where id = p_other;
    if other_.id is null or other_.church_id is distinct from subject.church_id
       or not other_.is_approved then
      raise exception 'The other person must be a member of the same church.';
    end if;
  end if;

  if p_report is not null and not exists (
    select 1 from public.reports rp
     where rp.id = p_report and rp.church_id = subject.church_id
       and rp.subject_id = p_subject and rp.status = 'open'
  ) then
    raise exception 'That report is not an open report about this person.';
  end if;

  insert into public.trials (church_id, opened_by, head_judge_id, report_id,
                             subject_id, subject_name, summary, opener_name, judge_name)
  values (subject.church_id, me.id, null, p_report,
          p_subject, coalesce(subject.full_name, 'Someone'), btrim(p_summary),
          coalesce(me.full_name, 'Someone'), null)
  returning id into t_id;

  perform private.court_append(t_id, 'opened', private.court_sha256(btrim(p_summary)),
    'Case opened about ' || coalesce(subject.full_name, 'Someone'));

  insert into public.trial_parties (trial_id, person_id, part)
  values (t_id, p_subject, 'accused');

  if other_.id is not null then
    insert into public.trial_parties (trial_id, person_id, part)
    values (t_id, other_.id, 'reporter')
    on conflict do nothing;
  elsif p_report is not null then
    insert into public.trial_parties (trial_id, person_id, part)
    select t_id, rp.reporter_id, 'reporter'
      from public.reports rp
     where rp.id = p_report and rp.reporter_id <> p_subject and rp.reporter_id <> me.id
    on conflict do nothing;
  end if;

  for r in
    select tp.person_id, tp.part, coalesce(p.full_name, 'Someone') as name
      from public.trial_parties tp
      left join public.profiles p on p.id = tp.person_id
     where tp.trial_id = t_id
     order by tp.part
  loop
    perform private.court_append(t_id, 'summoned', r.person_id::text,
      r.name || ' called as ' || case r.part when 'accused' then 'the person the case is about'
                                             when 'reporter' then 'the person who raised it'
                                             else 'a witness' end);
  end loop;

  judge := private.court_draw_judge(t_id);
  if judge is null then
    raise exception 'Nobody is free to judge this case: every leader who could hear it is part of it, or has not set up two-step sign-in.';
  end if;

  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'trial', 'You have been called to a trial room',
         case when tp.part = 'accused'
              then 'A Director has opened a case and you are asked to answer it.'
              else 'A Director has opened a case and asked to hear from you.'
         end
  from public.trial_parties tp
  where tp.trial_id = t_id;

  return t_id;
end;
$fn$;

/** The judge steps down; another is drawn, or the seat waits for an Executive Director. */
create or replace function public.court_step_down(p_trial uuid, p_reason text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t     public.trials%rowtype;
  judge uuid;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge can step down.';
  end if;
  if t.status <> 'open' then return 'This hearing has ended.'; end if;
  if length(coalesce(p_reason, '')) > 500 then
    return 'Say why in 500 characters or fewer.';
  end if;

  perform private.court_append(p_trial, 'judge_stepped_down', '',
    'Stepped down as judge' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), ''));
  update public.trials set head_judge_id = null, judge_name = null where id = p_trial;

  judge := private.court_draw_judge(p_trial);
  if judge is null then
    update public.trials set escalation = 'requested', escalated_at = now() where id = p_trial;
    perform private.court_append(p_trial, 'judge_called', '',
      'Nobody else is free to hear it: the seat waits for an Executive Director');
    insert into public.notifications (user_id, type, title, body)
    select p.id, 'trial', 'A case needs a judge',
           'Nobody else in the church is free to hear a case. You can take the seat in Admin Reports.'
      from public.profiles p
     where p.role = 'executive' and p.is_approved and p.suspended_at is null
       and p.id <> (select auth.uid())
       and p.id is distinct from t.subject_id
       and (p.church_id = t.church_id
            or exists (select 1 from public.church_executives ce
                        where ce.executive_id = p.id and ce.church_id = t.church_id));
  end if;
  return 'ok';
end;
$$;

-- ====================================================== the presenter ===

-- The Director who brought the case presents it: speaks and enters exhibits,
-- as the people called to it do.
create or replace function private.court_may_present(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.court_door_open()
     and exists (select 1 from public.trials t where t.id = p_trial and t.status = 'open')
     and coalesce(private.court_place(p_trial) in ('judge', 'opener', 'accused', 'reporter', 'witness'), false);
$$;

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
                 in ('judge', 'opener', 'accused', 'reporter', 'witness'), false)
  );

/** Say something in a case. As 20261020160000, the presenter included. */
create or replace function public.court_say(p_trial uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.court_require_door();
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'Write what you want to say first.';
  end if;
  if not exists (select 1 from public.trials t where t.id = p_trial and t.status = 'open') then
    raise exception 'This hearing has ended.';
  end if;
  if coalesce(private.court_place(p_trial) not in ('judge', 'opener', 'accused', 'reporter', 'witness'), true) then
    raise exception 'Only the judge and the people called to this case, and the one who brought it, speak in it.'
      using errcode = '42501';
  end if;
  insert into public.trial_statements (trial_id, author_id, body)
  values (p_trial, (select auth.uid()), p_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================ the end of the hearing ===

/**
 * End a leave. As 20261020180000, with a case's end now being the end of
 * its hearing. Write when and why, and if the account is still suspended,
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
                      when 'case_closed' then 'the hearing ended'
                      when 'lifted'      then 'their suspension was lifted'
                      else 'they are no longer called to the case' end);
  exception when others then
    -- The case may be going too; the leave is ended either way.
    null;
  end;
end;
$$;


/**
 * The judge ends the hearing with a recommendation to the Church Board. The
 * record is sealed; nothing more is said or entered; any leave to answer
 * ends; nobody's account is touched.
 */
create or replace function public.court_close_hearing(
  p_trial          uuid,
  p_recommendation text,
  p_note           text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t     public.trials%rowtype;
  seal  text;
  words text;
  l     record;
  about_lead boolean;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge ends the hearing.';
  end if;
  if t.status <> 'open' then return 'This hearing has already ended.'; end if;
  words := case p_recommendation
    when 'dismiss' then 'dismiss the case'
    when 'counsel' then 'counsel, with no change to their account'
    when 'suspend' then 'suspend them'
    when 'remove'  then 'remove them from the church' end;
  if words is null then
    return 'Recommend dismissing the case, counsel, suspension or removal.';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    return 'Say why in 2000 characters or fewer.';
  end if;

  seal := private.court_append(p_trial, 'hearing_closed',
    private.court_sha256(p_recommendation || chr(10) || coalesce(btrim(p_note), '')),
    'Hearing closed. The judge recommends: ' || words
      || coalesce(' -- ' || nullif(btrim(coalesce(p_note, '')), ''), '')
      || '. The final ruling is the Church Board''s.');

  update public.trials
     set status = 'with_board', recommendation = p_recommendation,
         recommendation_note = nullif(btrim(coalesce(p_note, '')), ''),
         heard_at = now(), seal_hash = seal, sealed_at = now()
   where id = p_trial;

  for l in select cl.id from public.court_leave cl
            where cl.trial_id = p_trial and cl.ended_at is null loop
    perform private.court_close_leave(l.id, 'case_closed');
  end loop;

  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'trial', 'The hearing has ended',
         'The judge has ended the hearing. The Church Board will give the final ruling.'
    from public.trial_parties tp
   where tp.trial_id = p_trial and tp.part <> 'observer';

  -- Those who will write the Board's ruling down: the church's leaders who
  -- sat on the case, never the person it is about.
  about_lead := coalesce(t.subject_role in ('admin', 'executive'), false);
  insert into public.notifications (user_id, type, title, body)
  select p.id, 'trial', 'A case is waiting for the Church Board',
         'A hearing has ended with the judge''s recommendation. When the Church Board has ruled, write its ruling down in Admin Reports.'
    from public.profiles p
   where p.is_approved and p.suspended_at is null
     and p.role in ('admin', 'executive')
     and p.id <> (select auth.uid())
     and p.id is distinct from t.subject_id
     and (not about_lead or p.role = 'executive')
     and (p.church_id = t.church_id
          or (p.role = 'executive' and exists (
                select 1 from public.church_executives ce
                 where ce.executive_id = p.id and ce.church_id = t.church_id)));

  return 'ok';
end;
$$;

/**
 * The Church Board's ruling, written down. By the judge, or a leader of the
 * church who sat on the case and may watch it (never anybody called to it).
 * It goes on the record after the seal. A suspension or a removal is carried
 * out only if `p_carry_out`, and only when the usual rules let the person
 * writing it down do that; otherwise nothing is written either.
 */
create or replace function public.court_record_ruling(
  p_trial        uuid,
  p_ruling       text,
  p_words        text,
  p_presented_by text default null,
  p_presented_on date default null,
  p_carry_out    boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.trials%rowtype;
  place   text;
  me      public.profiles%rowtype;
  by_     text := coalesce(nullif(btrim(coalesce(p_presented_by, '')), ''), 'the Church Board');
  on_     date := coalesce(p_presented_on, current_date);
  result  text := 'ok';
  outcome text;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  place := private.court_place(p_trial);
  if t.id is null or place is null
     or not (place = 'judge' or (place in ('opener', 'observer') and private.may_sit_on_trial(p_trial))) then
    return 'Only the judge, or a leader of the church who sat on the case, writes the Board''s ruling down.';
  end if;
  if t.status = 'open' then return 'The hearing has not ended yet.'; end if;
  if t.status = 'closed' then return 'The Church Board''s ruling is already written down.'; end if;
  outcome := case p_ruling
    when 'dismissed'  then 'dismissed'
    when 'counselled' then 'counselled, with no change to their account'
    when 'suspended'  then 'suspended'
    when 'removed'    then 'removed from the church' end;
  if outcome is null then
    return 'The Board''s ruling is one of: dismissed, counselled, suspended, removed.';
  end if;
  if btrim(coalesce(p_words, '')) = '' or length(btrim(p_words)) > 4000 then
    return 'Write the Board''s ruling in its own words (up to 4000 characters).';
  end if;
  if length(by_) > 200 then return 'Say who presented it in 200 characters or fewer.'; end if;
  if on_ > current_date then return 'The ruling cannot be presented on a day still to come.'; end if;

  if p_carry_out and p_ruling in ('suspended', 'removed') then
    if t.subject_id is null then
      return 'The account of the person this case is about has been deleted, so there is nothing to carry out.';
    end if;
    result := public.discipline_check(t.subject_id);
    if result <> 'ok' then return result; end if;
  end if;

  select * into me from public.profiles where id = (select auth.uid());

  perform private.court_append(p_trial, 'ruling',
    private.court_sha256(p_ruling || chr(10) || btrim(p_words)),
    'Ruling of the Church Board, presented on ' || to_char(on_, 'YYYY-MM-DD') || ' by ' || by_
      || ': ' || outcome || '. Written down by ' || coalesce(me.full_name, 'Someone')
      || case when p_carry_out and p_ruling in ('suspended', 'removed') then ', and carried out' else '' end);

  update public.trials
     set status = 'closed', verdict = p_ruling, verdict_note = btrim(p_words),
         ruling_words = btrim(p_words), ruling_presented_by = by_, ruling_presented_on = on_,
         ruling_recorded_by = me.id, ruling_recorded_name = coalesce(me.full_name, 'Someone'),
         closed_at = now()
   where id = p_trial;

  if t.report_id is not null then
    update public.reports
       set status = case when p_ruling = 'dismissed' then 'dismissed' else 'actioned' end,
           decided_by = me.id,
           decided_at = now(),
           outcome = 'Church Board: ' || p_ruling
     where id = t.report_id and status = 'open' and church_id = t.church_id;
  end if;

  -- Everybody called is told; a removed person's note goes with their account.
  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'trial', 'The Church Board has ruled',
         'The Church Board has given its ruling on the case: ' || outcome || '.'
    from public.trial_parties tp
   where tp.trial_id = p_trial and tp.part <> 'observer';

  if p_carry_out and p_ruling = 'suspended' then
    result := public.suspend_member(t.subject_id, btrim(p_words));
  elsif p_carry_out and p_ruling = 'removed' then
    result := public.remove_member_by_leader(t.subject_id);
  end if;
  if result <> 'ok' then
    raise exception '%', result;
  end if;

  return 'ok';
end;
$$;

/** No longer how a case ends: the hearing closes, and the Church Board rules. */
create or replace function public.close_trial(
  p_trial   uuid,
  p_verdict text,
  p_note    text default null
)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  return 'A hearing now ends with the judge''s recommendation, and the Church Board gives the final ruling. Reload the app to see how.';
end;
$$;

/** An Executive Director takes the seat. As 20261020160000, also while the case waits for the Board. */
create or replace function public.take_head_judge(p_trial uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  t  public.trials%rowtype;
  me public.profiles%rowtype;
begin
  if not private.court_door_open() then return 'The court room is locked.'; end if;
  select * into t  from public.trials where id = p_trial;
  select * into me from public.profiles where id = (select auth.uid());

  if t.id is null then return 'That case is not here.'; end if;
  if t.status = 'closed' then return 'That case is already closed.'; end if;
  if me.id is null or not me.is_approved or me.suspended_at is not null or me.role <> 'executive' then
    return 'Only an Executive Director can take the seat.';
  end if;
  if me.church_id is distinct from t.church_id
     and not exists (select 1 from public.church_executives ce
                     where ce.executive_id = me.id and ce.church_id = t.church_id) then
    return 'That case is not in a church you oversee.';
  end if;
  if t.escalation <> 'requested' and t.head_judge_id is not null then
    return 'Nobody has asked for an Executive Director on this case.';
  end if;
  if t.subject_id = me.id then
    return 'You cannot judge a case about yourself.';
  end if;
  if exists (select 1 from public.trial_parties tp
              where tp.trial_id = p_trial and tp.person_id = me.id
                and tp.part in ('accused', 'reporter', 'witness')) then
    return 'You are called to this case, so you cannot judge it.';
  end if;

  update public.trials
     set head_judge_id = me.id, escalation = 'accepted',
         judge_name = coalesce(me.full_name, 'Someone')
   where id = p_trial;
  delete from public.trial_parties
   where trial_id = p_trial and person_id = me.id and part = 'observer';

  if t.opened_by is not null then
    insert into public.notifications (user_id, type, title, body)
    values (t.opened_by, 'trial', 'An Executive Director took your case',
            coalesce(me.full_name, 'An Executive Director') || ' is now head judge.');
  end if;

  perform private.court_append(p_trial, 'judge_seated', '', 'Took the seat as judge');
  return 'ok';
end;
$$;

/**
 * Does the record hold? As 20261020160000, with the seal now set when the
 * hearing closes, and the Board's ruling checked against its fingerprint.
 */
create or replace function public.court_check_record(p_trial uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  entry   public.court_record%rowtype;
  prev    text;
  want    text;
  n       integer := 0;
  broken  integer;
  bad_statements integer;
  bad_exhibits   integer;
  t       public.trials%rowtype;
begin
  perform private.court_require_door();
  if private.court_place(p_trial) is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  select * into t from public.trials where id = p_trial;

  prev := encode(extensions.digest('Hope Beacon court record' || chr(10) || p_trial::text, 'sha256'), 'hex');
  for entry in select * from public.court_record where trial_id = p_trial order by seq loop
    n := n + 1;
    want := encode(extensions.digest(
        prev || chr(10) || entry.seq::text || chr(10) || entry.at_us::text || chr(10) ||
        coalesce(entry.actor_id::text, '') || chr(10) || entry.actor_name || chr(10) ||
        entry.act || chr(10) || entry.about || chr(10) || entry.detail, 'sha256'), 'hex');
    if entry.seq <> n or entry.prev_hash <> prev or entry.hash <> want then
      broken := entry.seq;
      exit;
    end if;
    prev := entry.hash;
  end loop;

  select count(*) into bad_statements
    from public.trial_statements s
   where s.trial_id = p_trial
     and (s.body_sha256 is distinct from private.court_sha256(s.body)
          or not exists (
            select 1 from public.court_record r
             where r.trial_id = p_trial
               and r.act in ('statement', 'statement_for')
               and r.about = s.body_sha256
               and r.detail like 'Statement ' || s.id::text || '%'));

  select count(*) into bad_exhibits
    from public.court_exhibits e
   where e.trial_id = p_trial and e.status = 'entered'
     and ((e.kind = 'writing' and e.sha256 <> private.court_sha256(e.writing))
          or not exists (
            select 1 from public.court_record r
             where r.trial_id = p_trial and r.act = 'exhibit'
               and r.about = e.sha256
               and r.detail like 'Exhibit ' || e.label || ':%'));

  return jsonb_build_object(
    'holds',      broken is null and bad_statements = 0 and bad_exhibits = 0,
    'entries',    n,
    'head',       prev,
    'broken_at',  broken,
    'statements_differing', bad_statements,
    'exhibits_differing',   bad_exhibits,
    'seal',       t.seal_hash,
    'seal_holds', t.seal_hash is null or exists (
                    select 1 from public.court_record r
                     where r.trial_id = p_trial and r.hash = t.seal_hash
                       and r.act in ('verdict', 'hearing_closed')),
    'ruling_holds', t.ruling_words is null or exists (
                    select 1 from public.court_record r
                     where r.trial_id = p_trial and r.act = 'ruling'
                       and r.about = private.court_sha256(t.verdict || chr(10) || t.ruling_words)));
end;
$$;

-- ============================================================ presence ===

create table if not exists public.court_presence (
  trial_id  uuid not null references public.trials(id) on delete cascade,
  person_id uuid not null references public.profiles(id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (trial_id, person_id)
);
alter table public.court_presence enable row level security;
revoke all on public.court_presence from anon, authenticated;

/** "I am here", from an open screen. Only from somebody with a place in the case. */
create or replace function public.court_here(p_trial uuid)
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
  insert into public.court_presence (trial_id, person_id, seen_at)
  values (p_trial, (select auth.uid()), now())
  on conflict (trial_id, person_id) do update set seen_at = excluded.seen_at;
end;
$$;

/** Seen in the case in the last 75 seconds. */
create or replace function private.court_is_here(p_trial uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.court_presence cp
                  where cp.trial_id = p_trial and cp.person_id = p_person
                    and cp.seen_at > now() - interval '75 seconds');
$$;

-- The court room's own calls for an account answering on leave, with "I am
-- here" added. As 20261020180000 otherwise.
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
        '^/rpc/(court_door|court_cases|court_case|court_here|court_say|court_check_record|court_exported|court_exhibit_begin|court_exhibit_seal|court_exhibit_write|court_exhibit_handled)/?$'
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

-- ===================================================== the case, in full ==

/** Every case this person may see. As 20261020180000, with a case waiting for the Board first among the rest. */
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
         case when t.head_judge_id is null and t.judge_name is null then 'Waiting for a judge'
              else private.name_kept(t.head_judge_id, t.judge_name) end,
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
   order by case t.status when 'open' then 0 when 'with_board' then 1 else 2 end, t.touched_at desc;
end;
$$;

/**
 * One case, as the person asking may see it. As 20261020180000, with who is
 * here now, the judge's recommendation (for the bench), the Board's ruling
 * (for everybody in the case), and what this person may do about either.
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
      'opener_id', t.opened_by,
      'opener_name', private.name_kept(t.opened_by, t.opener_name),
      'opener_here', t.opened_by is not null and private.court_is_here(p_trial, t.opened_by),
      'judge_id', t.head_judge_id,
      'judge_name', case when t.head_judge_id is null and t.judge_name is null then 'Waiting for a judge'
                         else private.name_kept(t.head_judge_id, t.judge_name) end,
      'judge_here', t.head_judge_id is not null and private.court_is_here(p_trial, t.head_judge_id),
      'escalation', case when i_lead then t.escalation else null end,
      'gallery_open', t.gallery_open,
      'seal_hash', t.seal_hash, 'sealed_at', t.sealed_at,
      'heard_at', t.heard_at,
      'recommendation', case when bench then t.recommendation else null end,
      'recommendation_note', case when bench then t.recommendation_note else null end,
      'ruling_words', t.ruling_words,
      'ruling_presented_by', t.ruling_presented_by,
      'ruling_presented_on', t.ruling_presented_on,
      'ruling_recorded_name', t.ruling_recorded_name,
      'my_place', place,
      'i_lead', coalesce(i_lead, false),
      'my_leave_until', (select l.ends_at from public.court_leave l
                          where l.trial_id = p_trial and l.person_id = me
                            and l.ended_at is null and l.ends_at > now()),
      'may_speak', t.status = 'open' and place in ('judge', 'opener', 'accused', 'reporter', 'witness'),
      'may_present', t.status = 'open' and place in ('judge', 'opener', 'accused', 'reporter', 'witness'),
      'may_decide', t.status = 'open' and place = 'judge',
      'may_step_down', t.status = 'open' and place = 'judge',
      'may_record_ruling', t.status = 'with_board'
        and (place = 'judge' or (place in ('opener', 'observer') and private.may_sit_on_trial(p_trial)))),
    'people', coalesce((
      select jsonb_agg(q.person order by q.since nulls last)
        from (
          select tp.summoned_at as since, jsonb_build_object(
                   'id', tp.person_id,
                   'name', coalesce(p.full_name, 'Someone'),
                   'part', tp.part,
                   'since', tp.summoned_at,
                   'deleted', false,
                   'here', private.court_is_here(p_trial, tp.person_id),
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
                   'here', false,
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
               'for_id', s.for_person,
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

revoke all on function private.court_judge_pool(uuid)        from public, anon, authenticated;
revoke all on function private.court_draw_judge(uuid)        from public, anon, authenticated;
revoke all on function private.court_is_here(uuid, uuid)     from public, anon, authenticated;

revoke all on function public.court_step_down(uuid, text)                                     from public, anon;
revoke all on function public.court_close_hearing(uuid, text, text)                           from public, anon;
revoke all on function public.court_record_ruling(uuid, text, text, text, date, boolean)      from public, anon;
revoke all on function public.court_here(uuid)                                                from public, anon;
grant execute on function public.court_step_down(uuid, text)                                  to authenticated;
grant execute on function public.court_close_hearing(uuid, text, text)                        to authenticated;
grant execute on function public.court_record_ruling(uuid, text, text, text, date, boolean)   to authenticated;
grant execute on function public.court_here(uuid)                                             to authenticated;

commit;
