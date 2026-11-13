-- Safeguarding reports, for the live app.
--
-- The demo has had this since the day it was asked for; the live database has
-- not, which means a real church with real members had no route at all. A Guide
-- and an Explorer talk privately and nobody else can read it — right for the
-- conversation, and exactly the design that needs a way out.
--
-- THE ACCESS RULES ARE THE FEATURE. Get them wrong and this is worse than
-- having nothing, because people will trust it.
--
--   INSERT  through report_person() only, never directly. The church is
--           derived from the reporter's own profile rather than accepted from
--           the browser, and the subject must be in that same church.
--   SELECT  the church's Directors and Executive Directors. Nobody else. NOT
--           the subject, obviously, and not the reporter either — they are
--           told it went through at the time, and every extra read path is
--           another way for the wrong person to see it.
--   UPDATE  the same Directors, to record a decision.
--   DELETE  nobody. There is deliberately no delete policy. A safeguarding
--           record that can be made to disappear is not a record.

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  pairing_id   uuid references public.pairings(id) on delete set null,
  reason       text not null check (reason in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other')),
  detail       text,
  status       text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now(),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  outcome      text,
  -- Reporting yourself is a mis-tap, not a report.
  constraint reports_not_self check (reporter_id <> subject_id)
);

create index if not exists reports_church_open_idx
  on public.reports (church_id, status, created_at desc);

alter table public.reports enable row level security;

-- Directors of THIS church, and only them.
-- `drop policy if exists` before each one, so a migration run that failed
-- halfway can simply be run again. Without it the retry dies on "policy
-- already exists" and a half-applied schema is the worst place to be
-- standing during a setup. Every other migration here already does this.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select using (
    exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive')
        and me.church_id = reports.church_id
    )
  );

drop policy if exists reports_decide on public.reports;
create policy reports_decide on public.reports
  for update using (
    exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.is_approved
        and me.role in ('admin', 'executive')
        and me.church_id = reports.church_id
    )
  );

-- No insert policy and no delete policy, on purpose. Inserts go through the
-- function below so the church cannot be spoofed; deletes do not happen.

/**
 * Raise a report.
 *
 * SECURITY DEFINER because it writes a row the caller may not then read, which
 * is the whole point — and because the church and the reporter are taken from
 * the session rather than from arguments. A browser that could name its own
 * church_id could file a report into somebody else's church.
 */
create or replace function public.report_person(
  p_subject uuid,
  p_reason  text,
  p_detail  text default null,
  p_pairing uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Every Director by name. A report nobody is looking at is worse than no
  -- report: it teaches the person who raised it that speaking up achieves
  -- nothing. The SUBJECT is not notified, and there is no row here that would
  -- reach them — notifications are readable only by their own user_id.
  insert into public.notifications (user_id, type, title, body)
  select p.id,
         'report',
         'A safeguarding report needs your attention',
         v_me.full_name || ' reported ' || coalesce(v_subject.full_name, 'a member') || '.'
  from public.profiles p
  where p.church_id = v_me.church_id
    and p.is_approved
    and p.role in ('admin', 'executive');

  return v_id;
end;
$$;

revoke all on function public.report_person(uuid, text, text, uuid) from public, anon;
grant execute on function public.report_person(uuid, text, text, uuid) to authenticated;

/**
 * A Director closes a report.
 *
 * Definer for one reason: it must also be able to write the decision when the
 * subject has already been removed from the church, which is the commonest way
 * a serious report ends.
 */
create or replace function public.resolve_report(
  p_id      uuid,
  p_status  text,
  p_outcome text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_church uuid;
begin
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'A report is either dealt with or has nothing to answer.';
  end if;

  select church_id into v_church from public.reports where id = p_id;
  if v_church is null then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
      and me.is_approved
      and me.role in ('admin', 'executive')
      and me.church_id = v_church
  ) then
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
$$;

revoke all on function public.resolve_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- The browser writes nothing here directly. Both routes above are definers,
-- and the table's own grants stay narrow so a future policy cannot widen them
-- by accident.
revoke all on table public.reports from anon;
grant select, update on table public.reports to authenticated;
