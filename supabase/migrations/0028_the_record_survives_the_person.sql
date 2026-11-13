-- A discipline record that outlives the person it is about.
--
-- THE FAULT, found while working out how to count how many people had been
-- removed. remove_member_by_leader() deletes the auth user; the profile goes
-- with it; and every row that references the profile with ON DELETE CASCADE
-- goes with that -- including, as of 0024, the trial that removed them and
-- everything said in it. So the act of carrying out a verdict destroyed the
-- record of the verdict, and the question "who has been removed from this
-- church, and why" had no answer at all. 0021 says in its own header that a
-- record which can be made to disappear is not a record; this is the same
-- mistake one table over.
--
-- THE FIX IS A LOG THAT REFERENCES NOBODY BY FOREIGN KEY for the facts that
-- matter. Names and roles are copied in at the time of the act. person_id is
-- kept as a nullable, ON DELETE SET NULL link so a still-present member can be
-- found, but nothing about the row depends on the person still existing.
--
-- Trials are repaired the same way: subject_id becomes ON DELETE SET NULL and a
-- subject_name snapshot is added, so a closed case remains readable after the
-- person it concerned is gone.

begin;

create table if not exists public.discipline_log (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  person_id   uuid references public.profiles(id) on delete set null,
  person_name text not null,
  person_role text not null,
  action      text not null check (action in ('suspended', 'released', 'removed')),
  reason      text,
  by_id       uuid references public.profiles(id) on delete set null,
  by_name     text not null,
  at          timestamptz not null default now()
);

create index if not exists discipline_log_church_idx
  on public.discipline_log (church_id, at desc);

alter table public.discipline_log enable row level security;

-- Leaders of that church read it. No insert, update or delete policy at all --
-- rows are written by the definer functions below and are never edited.
drop policy if exists discipline_log_read on public.discipline_log;
create policy discipline_log_read on public.discipline_log
  for select using (public.leads_church(church_id));

-- ---------------------------------------------------- trials keep their subject --

alter table public.trials
  add column if not exists subject_name text;

update public.trials t
   set subject_name = coalesce((select full_name from public.profiles p where p.id = t.subject_id), 'Someone')
 where subject_name is null;

alter table public.trials drop constraint if exists trials_subject_id_fkey;
alter table public.trials
  add constraint trials_subject_id_fkey
  foreign key (subject_id) references public.profiles(id) on delete set null;

alter table public.trials alter column subject_id drop not null;

-- ------------------------------------------------- the three acts, now logged --

create or replace function public.suspend_member(p_target uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  verdict text;
  target  public.profiles%rowtype;
  actor   public.profiles%rowtype;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  select * into target from public.profiles where id = p_target;
  select * into actor  from public.profiles where id = (select auth.uid());

  update public.profiles
     set suspended_at = now(),
         suspended_by = actor.id,
         suspended_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_target;

  update auth.users
     set banned_until = now() + interval '100 years', updated_at = now()
   where id = p_target;

  delete from auth.sessions       where user_id = p_target;
  delete from auth.refresh_tokens where user_id = p_target::text;

  update public.pairings set status = 'archived'
   where (dm_id = p_target or ds_id = p_target) and status = 'active';

  insert into public.discipline_log (church_id, person_id, person_name, person_role,
                                     action, reason, by_id, by_name)
  values (target.church_id, target.id, coalesce(target.full_name, 'Someone'), target.role::text,
          'suspended', nullif(btrim(coalesce(p_reason, '')), ''),
          actor.id, coalesce(actor.full_name, 'A leader'));

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'approval', 'A member was suspended',
         coalesce(target.full_name, 'Someone') || ' was suspended by '
         || coalesce(actor.full_name, 'a leader') || '.'
  from public.profiles p
  where p.church_id = target.church_id
    and p.is_approved and p.role in ('admin', 'executive')
    and p.id <> actor.id;

  return 'ok';
end;
$$;

create or replace function public.restore_member(p_target uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  verdict text;
  target  public.profiles%rowtype;
  actor   public.profiles%rowtype;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  select * into target from public.profiles where id = p_target;
  select * into actor  from public.profiles where id = (select auth.uid());

  update public.profiles
     set suspended_at = null, suspended_by = null, suspended_reason = null
   where id = p_target;

  update auth.users set banned_until = null, updated_at = now() where id = p_target;

  insert into public.discipline_log (church_id, person_id, person_name, person_role,
                                     action, by_id, by_name)
  values (target.church_id, target.id, coalesce(target.full_name, 'Someone'), target.role::text,
          'released', actor.id, coalesce(actor.full_name, 'A leader'));

  insert into public.notifications (user_id, type, title, body)
  values (p_target, 'approval', 'Your account is active again',
          'A Director has lifted your suspension. You can sign in as usual.');

  return 'ok';
end;
$$;

create or replace function public.remove_member_by_leader(p_target uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  verdict text;
  target  public.profiles%rowtype;
  actor   public.profiles%rowtype;
begin
  verdict := public.discipline_check(p_target);
  if verdict <> 'ok' then return verdict; end if;

  select * into target from public.profiles where id = p_target;
  select * into actor  from public.profiles where id = (select auth.uid());

  -- Written BEFORE the delete. Afterwards there is nothing left to read the
  -- name and role from -- which is exactly how the old version lost them.
  insert into public.discipline_log (church_id, person_id, person_name, person_role,
                                     action, by_id, by_name)
  values (target.church_id, null, coalesce(target.full_name, 'Someone'), target.role::text,
          'removed', actor.id, coalesce(actor.full_name, 'A leader'));

  delete from public.messages       where sender_id = p_target;
  delete from public.journey_events where changed_by = p_target;
  delete from public.pairings       where dm_id = p_target or ds_id = p_target or created_by = p_target;
  delete from auth.users            where id = p_target;
  return 'ok';
end;
$$;

revoke all on function public.suspend_member(uuid, text)      from public, anon;
revoke all on function public.restore_member(uuid)            from public, anon;
revoke all on function public.remove_member_by_leader(uuid)   from public, anon;
grant execute on function public.suspend_member(uuid, text)    to authenticated;
grant execute on function public.restore_member(uuid)          to authenticated;
grant execute on function public.remove_member_by_leader(uuid) to authenticated;

-- open_trial must record the name as well as the link, for the same reason.
create or replace function public.open_trial(
  p_subject uuid,
  p_summary text,
  p_report  uuid default null,
  p_other   uuid default null
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  me      public.profiles%rowtype;
  subject public.profiles%rowtype;
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

  select * into subject from public.profiles where id = p_subject;

  insert into public.trials (church_id, opened_by, head_judge_id, report_id,
                             subject_id, subject_name, summary)
  values (me.church_id, me.id, me.id, p_report,
          p_subject, coalesce(subject.full_name, 'Someone'), btrim(p_summary))
  returning id into t_id;

  insert into public.trial_parties (trial_id, person_id, part)
  values (t_id, p_subject, 'accused');

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
$fn$;

-- my_trials() now reads the snapshot, so a case about somebody who has since
-- been removed still says who it was about.
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
as $fn$
  select
    t.id, t.summary, t.subject_id,
    coalesce(t.subject_name, s.full_name, 'Someone'),
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
$fn$;

-- open_trial must record the name as well as the link, for the same reason.
create or replace function public.open_trial(
  p_subject uuid,
  p_summary text,
  p_report  uuid default null,
  p_other   uuid default null
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  me      public.profiles%rowtype;
  subject public.profiles%rowtype;
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

  select * into subject from public.profiles where id = p_subject;

  insert into public.trials (church_id, opened_by, head_judge_id, report_id,
                             subject_id, subject_name, summary)
  values (me.church_id, me.id, me.id, p_report,
          p_subject, coalesce(subject.full_name, 'Someone'), btrim(p_summary))
  returning id into t_id;

  insert into public.trial_parties (trial_id, person_id, part)
  values (t_id, p_subject, 'accused');

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
$fn$;

-- my_trials() now reads the snapshot, so a case about somebody who has since
-- been removed still says who it was about.
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
as $fn$
  select
    t.id, t.summary, t.subject_id,
    coalesce(t.subject_name, s.full_name, 'Someone'),
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
$fn$;

commit;
