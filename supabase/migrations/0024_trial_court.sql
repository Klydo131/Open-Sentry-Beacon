-- The trial room becomes a court.
--
-- 0023 gave a leader two buttons: suspend and remove. That is enough to stop
-- something and not nearly enough to be fair about it. A report is one person's
-- account of what happened; acting on it alone means the other side is judged
-- without ever being heard, by somebody who never asked them anything.
--
-- WHAT A TRIAL IS HERE. A case with a written record: who opened it, who was
-- summoned, what each side said in their own words, who judged it, and what was
-- decided. Both sides speak into the same thread. The verdict is attached to
-- the statements that produced it, so a decision can be re-read months later by
-- somebody who was not in the room.
--
-- WHO JUDGES, AND THE RULE THAT MATTERS MOST:
--
--   The Director who opens the trial is the head judge from the first moment.
--   They may CALL for an Executive Director to take the seat instead. If an
--   Executive answers, the seat changes hands. If none ever answers, nothing
--   happens and the Director judges the case -- which is the rule the owner
--   asked for, expressed as the resting state rather than as a countdown.
--
-- There is no timer anywhere in this migration, and that is the point. A
-- deadline would need a scheduler, would fire at some hour nobody chose, and
-- would leave a case in limbo until it did. "The Director is head judge unless
-- an Executive takes over" needs no clock and cannot get stuck.
--
-- A SUSPENDED PERSON MAY STILL SPEAK IN THEIR OWN TRIAL. 0023 stops a suspended
-- member from messaging, on purpose. If that also silenced them here, then
-- suspending somebody pending a hearing would remove their defence, and every
-- trial after a precautionary suspension would be one-sided by construction.
-- The statements policy therefore does not consult suspended_at. They can speak
-- to the court and to nobody else.
--
-- VERDICTS GO THROUGH 0023's FUNCTIONS rather than writing to profiles here.
-- The authority rules live in discipline_check() and must have exactly one
-- home; a court that could suspend somebody the Director is not allowed to
-- suspend would be a way around the hierarchy, not an addition to it.

begin;

-- ---------------------------------------------------------------- the case --

create table if not exists public.trials (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches(id) on delete cascade,
  opened_by      uuid not null references public.profiles(id) on delete cascade,
  head_judge_id  uuid not null references public.profiles(id) on delete cascade,
  report_id      uuid references public.reports(id) on delete set null,
  subject_id     uuid not null references public.profiles(id) on delete cascade,
  summary        text not null check (length(btrim(summary)) between 1 and 2000),
  -- 'none' until a Director asks for an Executive; 'requested' while the call
  -- stands; 'accepted' once one takes the seat. There is deliberately no
  -- 'timed_out' -- an unanswered call simply stays 'requested' for ever and the
  -- Director keeps the seat they already had.
  escalation     text not null default 'none'
                 check (escalation in ('none', 'requested', 'accepted')),
  escalated_at   timestamptz,
  status         text not null default 'open' check (status in ('open', 'closed')),
  verdict        text check (verdict in ('dismissed', 'suspended', 'removed')),
  verdict_note   text,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  -- A closed trial has a verdict; an open one does not.
  constraint trials_verdict_matches_status check (
    (status = 'open'   and verdict is null and closed_at is null) or
    (status = 'closed' and verdict is not null and closed_at is not null)
  )
);

create index if not exists trials_church_idx on public.trials (church_id, status, opened_at desc);

-- Everyone called into the case. The accused is a party like any other, which
-- is what gives them the right to read it and answer it.
create table if not exists public.trial_parties (
  trial_id   uuid not null references public.trials(id) on delete cascade,
  person_id  uuid not null references public.profiles(id) on delete cascade,
  part       text not null check (part in ('accused', 'reporter', 'witness')),
  summoned_at timestamptz not null default now(),
  primary key (trial_id, person_id)
);

create table if not exists public.trial_statements (
  id         uuid primary key default gen_random_uuid(),
  trial_id   uuid not null references public.trials(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists trial_statements_trial_idx
  on public.trial_statements (trial_id, created_at);

alter table public.trials            enable row level security;
alter table public.trial_parties     enable row level security;
alter table public.trial_statements  enable row level security;

-- ------------------------------------------------------------- who may see --

/**
 * A party to the case, or a leader of the church it belongs to.
 *
 * SECURITY DEFINER because a party must be able to read a trial row in order
 * to be told they are on trial, and the check itself reads trial_parties --
 * which is the table the policy is protecting. Without the definer this
 * recurses.
 */
create or replace function public.in_trial(p_trial uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.trial_parties tp
    where tp.trial_id = p_trial and tp.person_id = (select auth.uid())
  ) or exists (
    -- Leaders of the church the case belongs to. An executive is matched on
    -- the church_executives link as well as on church_id, because an executive
    -- oversees a church without necessarily belonging to it -- the same fault
    -- that once showed an executive a single profile out of twenty-four.
    select 1
    from public.trials t
    join public.profiles me on me.id = (select auth.uid())
    where t.id = p_trial
      and me.is_approved
      and (
        (me.role = 'admin' and me.church_id = t.church_id)
        or (me.role = 'executive' and (
              me.church_id = t.church_id
              or exists (select 1 from public.church_executives ce
                         where ce.executive_id = me.id and ce.church_id = t.church_id)))
      )
  );
$$;

revoke all on function public.in_trial(uuid) from public, anon;
grant execute on function public.in_trial(uuid) to authenticated;

-- `drop policy if exists` before each one, so a migration run that failed
-- halfway can simply be run again. Without it the retry dies on "policy
-- already exists" and a half-applied schema is the worst place to be
-- standing during a setup. Every other migration here already does this.
drop policy if exists trials_read on public.trials;
create policy trials_read on public.trials
  for select using (public.in_trial(id));

drop policy if exists trial_parties_read on public.trial_parties;
create policy trial_parties_read on public.trial_parties
  for select using (public.in_trial(trial_id));

drop policy if exists trial_statements_read on public.trial_statements;
create policy trial_statements_read on public.trial_statements
  for select using (public.in_trial(trial_id));

-- Speaking is the one thing a party does directly. Everything else -- opening,
-- summoning, escalating, judging -- goes through a function, because each of
-- those has an authority rule attached and a policy cannot express them.
--
-- Note what is NOT here: no check on suspended_at. See the header.
drop policy if exists trial_statements_speak on public.trial_statements;
create policy trial_statements_speak on public.trial_statements
  for insert with check (
    author_id = (select auth.uid())
    and public.in_trial(trial_id)
    and exists (select 1 from public.trials t where t.id = trial_id and t.status = 'open')
  );

-- No update and no delete policy on any of the three tables. A statement that
-- can be edited after a verdict is not a record of what was said.

-- ------------------------------------------------------------ opening a case --

/**
 * Open a trial against one person, optionally from the report that prompted it,
 * and summon the other side with them.
 *
 * The opener must be allowed to discipline the subject -- checked with the same
 * discipline_check() the verdict will use. Opening a case you could never
 * decide would be a way for a Director to put an Executive Director in the dock
 * for show.
 */
create or replace function public.open_trial(
  p_subject uuid,
  p_summary text,
  p_report  uuid default null,
  p_other   uuid default null
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  me      public.profiles%rowtype;
  allowed text;
  t_id    uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then
    raise exception 'Your account cannot open a trial.';
  end if;
  if me.role not in ('admin', 'executive') then
    raise exception 'Only a Director or an Executive Director can open a trial.';
  end if;
  if btrim(coalesce(p_summary, '')) = '' then
    raise exception 'Say what the case is about.';
  end if;

  allowed := public.discipline_check(p_subject);
  if allowed <> 'ok' then raise exception '%', allowed; end if;

  insert into public.trials (church_id, opened_by, head_judge_id, report_id, subject_id, summary)
  values (me.church_id, me.id, me.id, p_report, p_subject, btrim(p_summary))
  returning id into t_id;

  insert into public.trial_parties (trial_id, person_id, part)
  values (t_id, p_subject, 'accused');

  -- The other side. Named explicitly, or taken from the report if one started
  -- this. Either way they are a party, so they can read the case and answer it.
  if p_other is not null and p_other <> p_subject then
    insert into public.trial_parties (trial_id, person_id, part)
    values (t_id, p_other, 'reporter')
    on conflict do nothing;
  elsif p_report is not null then
    insert into public.trial_parties (trial_id, person_id, part)
    select t_id, r.reporter_id, 'reporter'
    from public.reports r
    where r.id = p_report and r.reporter_id <> p_subject
    on conflict do nothing;
  end if;

  -- Tell the people who have been called. A summons nobody sees is not one.
  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'approval', 'You have been called to a trial room',
         case when tp.part = 'accused'
              then 'A Director has opened a case and you are asked to answer it.'
              else 'A Director has opened a case and asked to hear from you.'
         end
  from public.trial_parties tp
  where tp.trial_id = t_id;

  return t_id;
end;
$$;

-- ------------------------------------------------------- calling for a judge --

/**
 * A Director asks for an Executive Director to take the seat.
 *
 * This does NOT vacate the seat. The Director stays head judge for as long as
 * the call goes unanswered, which is exactly the rule: no Executive, no delay.
 */
create or replace function public.call_head_judge(p_trial uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare t public.trials%rowtype;
begin
  select * into t from public.trials where id = p_trial;
  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if t.head_judge_id <> (select auth.uid()) then
    return 'Only the head judge of this case can call for an Executive Director.';
  end if;
  if t.escalation = 'accepted' then
    return 'An Executive Director is already the head judge here.';
  end if;

  update public.trials
     set escalation = 'requested', escalated_at = now()
   where id = p_trial;

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'approval', 'A Director has asked you to judge a case',
         'You can take the seat as head judge, or leave it and the Director will decide it.'
  from public.profiles p
  where p.role = 'executive'
    and p.is_approved
    and p.id <> (select auth.uid())
    and (p.church_id = t.church_id
         or exists (select 1 from public.church_executives ce
                    where ce.executive_id = p.id and ce.church_id = t.church_id));

  return 'ok';
end;
$$;

/** An Executive Director answers the call and takes the seat. */
create or replace function public.take_head_judge(p_trial uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  t  public.trials%rowtype;
  me public.profiles%rowtype;
begin
  select * into t  from public.trials where id = p_trial;
  select * into me from public.profiles where id = (select auth.uid());

  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if me.id is null or not me.is_approved or me.role <> 'executive' then
    return 'Only an Executive Director can take the seat.';
  end if;
  if me.church_id is distinct from t.church_id
     and not exists (select 1 from public.church_executives ce
                     where ce.executive_id = me.id and ce.church_id = t.church_id) then
    return 'That case is not in a church you oversee.';
  end if;
  if t.escalation <> 'requested' then
    return 'Nobody has asked for an Executive Director on this case.';
  end if;
  -- The judge cannot be the accused.
  if t.subject_id = me.id then
    return 'You cannot judge a case about yourself.';
  end if;

  update public.trials
     set head_judge_id = me.id, escalation = 'accepted'
   where id = p_trial;

  insert into public.notifications (user_id, type, title, body)
  values (t.opened_by, 'approval', 'An Executive Director took your case',
          coalesce(me.full_name, 'An Executive Director') || ' is now head judge.');

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------- the verdict --

/**
 * Close the case. Only the head judge, and the verdict is carried out by
 * 0023's functions so the authority rules are asked exactly once, in one place.
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
  result text;
begin
  select * into t from public.trials where id = p_trial;
  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if t.head_judge_id <> (select auth.uid()) then
    return 'Only the head judge can decide this case.';
  end if;
  if p_verdict not in ('dismissed', 'suspended', 'removed') then
    return 'A case ends dismissed, suspended or removed.';
  end if;

  if p_verdict = 'suspended' then
    result := public.suspend_member(t.subject_id, coalesce(p_note, t.summary));
    if result <> 'ok' then return result; end if;
  elsif p_verdict = 'removed' then
    result := public.remove_member_by_leader(t.subject_id);
    if result <> 'ok' then return result; end if;
  end if;

  update public.trials
     set status = 'closed', verdict = p_verdict,
         verdict_note = nullif(btrim(coalesce(p_note, '')), ''),
         closed_at = now()
   where id = p_trial;

  -- The report that started it is answered by the verdict, so a Director is
  -- not left with an open report about a case that has already been decided.
  if t.report_id is not null then
    update public.reports
       set status = case when p_verdict = 'dismissed' then 'dismissed' else 'actioned' end,
           decided_by = (select auth.uid()),
           decided_at = now(),
           outcome = 'Trial: ' || p_verdict
     where id = t.report_id and status = 'open';
  end if;

  -- 'removed' deletes the person, so there is nobody left to notify.
  if p_verdict <> 'removed' then
    insert into public.notifications (user_id, type, title, body)
    select tp.person_id, 'approval', 'The trial room reached a decision',
           'The case was ' || p_verdict || '.'
    from public.trial_parties tp
    where tp.trial_id = p_trial;
  end if;

  return 'ok';
end;
$$;

/** Every case this person may see, newest first, with the names spelled out. */
create or replace function public.my_trials()
returns table (
  id            uuid,
  summary       text,
  subject_id    uuid,
  subject_name  text,
  opened_by     uuid,
  opener_name   text,
  head_judge_id uuid,
  judge_name    text,
  escalation    text,
  status        text,
  verdict       text,
  verdict_note  text,
  opened_at     timestamptz,
  closed_at     timestamptz,
  my_part       text,
  am_judge      boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    t.id, t.summary, t.subject_id,
    coalesce(s.full_name, 'Someone'),
    t.opened_by, coalesce(o.full_name, 'Someone'),
    t.head_judge_id, coalesce(j.full_name, 'Someone'),
    t.escalation, t.status, t.verdict, t.verdict_note,
    t.opened_at, t.closed_at,
    (select tp.part from public.trial_parties tp
      where tp.trial_id = t.id and tp.person_id = (select auth.uid())),
    t.head_judge_id = (select auth.uid())
  from public.trials t
  left join public.profiles s on s.id = t.subject_id
  left join public.profiles o on o.id = t.opened_by
  left join public.profiles j on j.id = t.head_judge_id
  where public.in_trial(t.id)
  order by t.status, t.opened_at desc;
$$;

revoke all on function public.open_trial(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.call_head_judge(uuid)              from public, anon;
revoke all on function public.take_head_judge(uuid)              from public, anon;
revoke all on function public.close_trial(uuid, text, text)      from public, anon;
revoke all on function public.my_trials()                        from public, anon;

grant execute on function public.open_trial(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.call_head_judge(uuid)              to authenticated;
grant execute on function public.take_head_judge(uuid)              to authenticated;
grant execute on function public.close_trial(uuid, text, text)      to authenticated;
grant execute on function public.my_trials()                        to authenticated;

commit;
