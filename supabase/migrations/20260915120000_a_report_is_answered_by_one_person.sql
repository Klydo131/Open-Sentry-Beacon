-- A report is answered by one person, and never by the person it is about.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED FOR. "Guides and Explorers can chat a live Director on it
-- privately 1 on 1, Directors, EDs, and Head ED can participate but only one
-- can chat such case, it wont be a group chat but a one on one chat, basically
-- if a report comes from Guide and Explorer, Directors are the Front line and
-- we'll see it as a report, any Directors can pick up a Guide and Explorer's
-- report, but if a Director misbehave it will be put on trial with EDs and
-- Head ED."
--
-- THE HAZARD THIS CLOSES, WHICH PREDATES THE REQUEST. `reports_read` in
-- 0021 admits every approved admin and executive of the church, with no
-- exclusion for the person the report is ABOUT. So a Director could already
-- read a report filed against them, and `report_person` notifies every admin
-- and executive, which means they were told about it too.
--
-- On its own that is bad. Combined with "any Director can pick up a report" it
-- becomes a trap: the reported Director could CLAIM the case about themselves
-- and be the only other person in a private thread with the member who spoke
-- up. That is the worst possible outcome for the person this feature exists to
-- protect, and it would happen silently.
--
-- So two rules are structural here rather than left to the screen:
--
--   1. Nobody may handle a report they are the subject of. Not read it, not
--      claim it, not speak in it.
--   2. A report about a Director or an Executive Director is not the Director
--      pool's to handle at all -- it goes to Executive Directors only. This is
--      the owner's own rule ("if a Director misbehave it will be put on trial
--      with EDs and Head ED") applied one step earlier, at the report rather
--      than at the trial. `discipline_check` already refuses to let a Director
--      discipline another Director, so the trial half was right; the report
--      half was not.
--
-- WHY THE CASE IS VISIBLE TO LEADERSHIP BUT THE CONVERSATION IS NOT. "Only one
-- can chat such case" is about the conversation, not about the existence of the
-- case: Directors have to see the queue or nobody could pick anything up, and
-- an Executive who cannot see that a case exists cannot oversee anything. So
-- the report row is readable by whoever may handle it, and report_messages is
-- readable by exactly two people -- the member who reported and the one person
-- who picked it up.
--
-- AND THE ESCAPE HATCH, because a private channel between a Director and a
-- worried member with no oversight is itself a safeguarding risk. If the
-- Director handling a case behaves badly in it, the member reports THEM, and
-- rule 2 sends that second report to Executive Directors only -- out of reach
-- of the Director it concerns. The recourse is a route, not a promise.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- the columns --

alter table public.reports
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.reports
  add column if not exists claimed_at timestamptz;

-- A Director who leaves does not take the case with them: `on delete set null`
-- puts it back in the queue rather than orphaning it. The index is on the
-- unclaimed ones, because "what is waiting for somebody" is the question the
-- queue asks every time it loads.
create index if not exists reports_unclaimed_idx
  on public.reports (church_id, created_at desc) where claimed_by is null and status = 'open';

-- -------------------------------------------------------------- the messages --

create table if not exists public.report_messages (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists report_messages_thread_idx
  on public.report_messages (report_id, created_at);

alter table public.report_messages enable row level security;

-- ------------------------------------------------------------- the two rules --

/**
 * May I handle this report?
 *
 * SECURITY DEFINER because it reads `reports` and `profiles`, and it is called
 * from the policy ON `reports` -- a policy subquery inherits the referenced
 * table's RLS, so without the definer this recurses into itself.
 */
create or replace function private.may_handle_report(p_report uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  me      public.profiles%rowtype;
  r       public.reports%rowtype;
  subject public.profiles%rowtype;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then return false; end if;

  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then return false; end if;
  if me.church_id is distinct from r.church_id then return false; end if;
  if me.role not in ('admin', 'executive') then return false; end if;

  -- RULE 1. Never your own case, whatever your rank.
  if me.id = r.subject_id then return false; end if;

  -- RULE 2. A case about leadership belongs to Executive Directors.
  select * into subject from public.profiles where id = r.subject_id;
  if subject.role in ('admin', 'executive') and me.role <> 'executive' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.may_handle_report(uuid) from public, anon;
grant execute on function private.may_handle_report(uuid) to authenticated;

/** Am I one of the two people in this conversation? */
create or replace function private.in_report(p_report uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report
      and (select auth.uid()) in (r.reporter_id, r.claimed_by)
  );
$$;

revoke all on function private.in_report(uuid) from public, anon;
grant execute on function private.in_report(uuid) to authenticated;

-- ---------------------------------------------------------------- the policies --

-- THE REPORTER READS THEIR OWN REPORT NOW, which they could not before. Without
-- it they file something into silence and have no way to see that anybody
-- picked it up, let alone answer. That was survivable when a report was a
-- one-way flag; it is not, once the whole point is a conversation.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (
    reporter_id = (select auth.uid())
    or private.may_handle_report(id)
  );

-- Deciding is for whoever may handle it. The old policy admitted the subject.
drop policy if exists reports_decide on public.reports;
create policy reports_decide on public.reports
  for update to authenticated using (private.may_handle_report(id));

drop policy if exists report_messages_read on public.report_messages;
-- `to authenticated` on all three. A policy with no role clause applies to
-- every role Postgres has, the signed-out one included, and the guard that
-- catches this refused an earlier version of this migration for exactly that.
create policy report_messages_read on public.report_messages
  for select to authenticated using (private.in_report(report_id));

-- No insert policy: speaking goes through say_in_report below, so the author
-- cannot be spoofed and an unclaimed case cannot be spoken into.
-- No update and no delete, on either table. What was said in a safeguarding
-- case stays said; the guild wall's edit rules deliberately do not apply here.

-- ------------------------------------------------------------------ picking up --

/**
 * Pick up a report. First one there holds it, and only they can speak in it.
 */
create or replace function public.claim_report(p_report uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
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

  -- The member who spoke up is told a person has it. Waiting without knowing
  -- whether anybody is there is most of what makes reporting frightening.
  insert into public.notifications (user_id, type, title, body)
  values (r.reporter_id, 'approval', 'Someone is looking at your report',
          'A Director has picked up what you raised. You can talk to them '
          || 'privately in Settings, under Admin Reports.');
end;
$$;

revoke all on function public.claim_report(uuid) from public, anon;
grant execute on function public.claim_report(uuid) to authenticated;

/** Hand it back, so a case is never stuck with somebody who should not hold it. */
create or replace function public.release_report(p_report uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  me public.profiles%rowtype;
  r  public.reports%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into r  from public.reports  where id = p_report;
  if r.id is null then raise exception 'That report is not here.'; end if;
  if r.claimed_by is distinct from me.id then
    raise exception 'You are not the one holding this.';
  end if;
  update public.reports set claimed_by = null, claimed_at = null where id = p_report;
end;
$$;

revoke all on function public.release_report(uuid) from public, anon;
grant execute on function public.release_report(uuid) to authenticated;

-- -------------------------------------------------------------------- speaking --

create or replace function public.say_in_report(p_report uuid, p_body text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
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

  -- SUSPENSION IS NOT CHECKED, and that is deliberate and the same rule the
  -- trial room already follows: somebody suspended pending an outcome must
  -- keep their side of it. Taking away the answer is not a punishment, it is a
  -- way to lose the truth.
  if not private.in_report(p_report) then
    raise exception 'This conversation is between the person who reported and the one helping.';
  end if;

  if r.claimed_by is null then
    raise exception 'Nobody has picked this up yet. You will be told when somebody does.';
  end if;

  if btrim(coalesce(p_body, '')) = '' then raise exception 'Say something first.'; end if;

  insert into public.report_messages (report_id, author_id, body)
  values (p_report, me.id, btrim(p_body))
  returning id into v_id;

  other := case when me.id = r.reporter_id then r.claimed_by else r.reporter_id end;
  insert into public.notifications (user_id, type, title, body)
  values (other, 'message', 'A new message about a report',
          'There is a reply waiting in Settings, under Admin Reports.');

  return v_id;
end;
$$;

revoke all on function public.say_in_report(uuid, text) from public, anon;
grant execute on function public.say_in_report(uuid, text) to authenticated;

-- ------------------------------------------------------------------ the queue --

/**
 * Every report I am entitled to see, and who has it.
 *
 * Names are resolved here rather than in the browser because a member must be
 * able to see WHO is helping them without being handed a way to read the
 * profiles table for everybody in the church.
 */
create or replace function public.my_reports()
returns table (
  id           uuid,
  reason       text,
  detail       text,
  status       text,
  created_at   timestamptz,
  mine         boolean,
  claimed_by   uuid,
  claimed_name text,
  subject_name text,
  can_handle   boolean,
  messages     bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select r.id, r.reason, r.detail, r.status, r.created_at,
         r.reporter_id = (select auth.uid()) as mine,
         r.claimed_by,
         c.full_name as claimed_name,
         -- The subject's name is for the people who may handle the case. The
         -- reporter already knows who they reported; showing it back to them
         -- costs nothing, but showing it to anybody else would be a leak.
         case when private.may_handle_report(r.id) or r.reporter_id = (select auth.uid())
              then s.full_name end as subject_name,
         private.may_handle_report(r.id) as can_handle,
         (select count(*) from public.report_messages m where m.report_id = r.id) as messages
    from public.reports r
    left join public.profiles c on c.id = r.claimed_by
    left join public.profiles s on s.id = r.subject_id
   where r.reporter_id = (select auth.uid())
      or private.may_handle_report(r.id)
   order by r.status = 'open' desc, r.created_at desc;
$$;

revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;

/** The conversation itself, with names, for the two people in it. */
create or replace function public.report_thread(p_report uuid)
returns table (id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select m.id, m.author_id, p.full_name, m.body, m.created_at
    from public.report_messages m
    join public.profiles p on p.id = m.author_id
   where m.report_id = p_report
     and private.in_report(p_report)
   order by m.created_at;
$$;

revoke all on function public.report_thread(uuid) from public, anon;
grant execute on function public.report_thread(uuid) to authenticated;

-- ---------------------------------------------------------------- keeping up --
--
-- A CHAT SCREEN THAT DOES NOT REFRESH IS NOT A CHAT SCREEN, and the first
-- version of this feature shipped exactly that: the queue and the thread both
-- loaded once and then sat there, so a reply arrived only if somebody thought
-- to reload the page. The guard that catches deaf rooms refused it, which is
-- the second time that check has caught the same defect in this repository.
--
-- `report_messages` goes on the wire with `trial_statements` as the precedent:
-- that table is published and its read policy is `in_trial(id)`, exactly the
-- shape of `in_report(report_id)` here. Realtime evaluates the policy per
-- subscriber, so publishing changes WHEN the two people in a case find out,
-- never WHO may. Nothing in this table is redacted on read, so there is no
-- redaction for the wire to bypass -- which is the reason the guild wall needed
-- a pulse table and this does not.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'report_messages'
  ) then
    alter publication supabase_realtime add table public.report_messages;
  end if;
end $$;
