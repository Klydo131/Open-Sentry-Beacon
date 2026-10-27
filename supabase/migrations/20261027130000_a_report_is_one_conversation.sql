-- A report is one conversation: the person who raised it, the Admins, and,
-- once an Admin brings them in, the person it is about.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 27 October 2026, with the court room closed (20261027120000):
-- "It will be just faster if Admins can see reports, see the problems and
-- reports and be transparent to both Guide and Explorer users by chatting them
-- as Admins." Asked how: one shared chat per report, in which everyone sees
-- every message, and nobody is the Admin on a report about themselves.
--
-- AND ASKED ONE MORE THING, because the report form has always promised the
-- person reporting that the person they report "is not told. No message, no
-- notification, nothing they could notice", and the person reporting may be a
-- child reporting their Guide. Asked when the person a report is about should
-- join, the owner chose: when the Admin holding the report brings them in,
-- having read it first. So:
--
--   * The report reaches the Admins as before, and the person it is about is
--     told nothing when it is filed.
--   * Every Admin who may handle it (20260915120000's two rules, unchanged:
--     never your own case; a case about a Director or an Executive Director is
--     for Executive Directors) reads the conversation. One of them picks it up
--     and speaks for the church in it, as before.
--   * The Admin holding it can bring the person it is about in, with one
--     button. From then on they read the report, the whole conversation from
--     its first message, and can answer; the person who raised it is told when
--     that happens, and so is the person brought in.
--   * A REPORT FILED BEFORE TODAY CANNOT BE OPENED TO THE PERSON IT IS ABOUT. It
--     was filed under the old promise and the promise is kept for it:
--     `subject_may_join` is false on every existing row and true on every new
--     one, and the form now says what happens before anybody sends.
--   * Evidence files stay with the Admins (report_files is not touched).
-- ---------------------------------------------------------------------------

begin;

-- --------------------------------------------------------------- the columns --

-- Added false, so every report that exists now keeps its promise; then the
-- default turns true, so every report filed from here on is filed under the new
-- form. Nothing that files a report has to change.
alter table public.reports
  add column if not exists subject_may_join boolean not null default false;
alter table public.reports
  alter column subject_may_join set default true;

alter table public.reports
  add column if not exists subject_joined_at timestamptz;
alter table public.reports
  add column if not exists subject_joined_by uuid references public.profiles(id) on delete set null;

-- Brought in means it may be. A row cannot say one without the other.
alter table public.reports drop constraint if exists reports_joined_only_if_it_may;
alter table public.reports add constraint reports_joined_only_if_it_may
  check (subject_joined_at is null or subject_may_join);

-- ------------------------------------------------------------ who is in it --

/**
 * Am I in this report's conversation?
 *
 * The person who raised it; every Admin who may handle it (so the church's
 * leadership can see what is said, which is the transparency asked for); and
 * the person it is about, once the Admin holding it has brought them in.
 * report_messages' read policy is this function, so the live socket follows it
 * too: publishing a row changes when somebody finds out, never who may.
 */
create or replace function private.in_report(p_report uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.reports r
     where r.id = p_report
       and (
         (select auth.uid()) = r.reporter_id
         or ((select auth.uid()) = r.subject_id and r.subject_joined_at is not null)
         or private.may_handle_report(r.id)
       )
  );
$$;

revoke all on function private.in_report(uuid) from public, anon;
grant execute on function private.in_report(uuid) to authenticated;

-- ------------------------------------------------------------------ picking up --

-- As 20261020180000, with the word "privately" gone from what the person who
-- raised it is told: the Admins of the church can read the conversation.
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
    -- One message for every refusal: "you cannot take this because it is about
    -- you" would tell somebody a report about them exists.
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
            || 'in Settings, under Admin Reports.');
  end if;
end;
$$;

-- ---------------------------------------------------------- bringing them in --

/**
 * The Admin holding a report brings the person it is about into the
 * conversation. Once, and not for a report filed before this file.
 */
create or replace function public.bring_subject_into_report(p_report uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  me public.profiles%rowtype;
  r  public.reports%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into r  from public.reports  where id = p_report for update;
  if r.id is null then raise exception 'That report is not here.'; end if;

  -- Holding it is the test, and holding it already required may_handle_report.
  -- A Director who has since been suspended, demoted or moved fails it again.
  if me.id is null or r.claimed_by is distinct from me.id or not private.may_handle_report(p_report) then
    raise exception 'Only the Director holding this report can do that.';
  end if;
  if r.status <> 'open' then raise exception 'That report is already closed.'; end if;
  if not r.subject_may_join then
    raise exception 'This report was made before conversations were shared, and was promised to stay private. Talk to them another way.';
  end if;
  if r.subject_joined_at is not null then
    raise exception 'They are already in this conversation.';
  end if;
  if r.subject_id is null then
    raise exception 'Their account has been deleted, so there is nobody to bring in.';
  end if;

  update public.reports
     set subject_joined_at = now(), subject_joined_by = me.id
   where id = p_report;

  -- No name in either notification: these also leave the building as a push
  -- (20260916210000), and a lock screen is not the place for one.
  insert into public.notifications (user_id, type, title, body)
  values (r.subject_id, 'report', 'A Director would like to talk with you',
          'It is about a report. You can read it and answer in Settings, under Admin Reports.');
  if r.reporter_id is not null then
    insert into public.notifications (user_id, type, title, body)
    values (r.reporter_id, 'report', 'Your report''s conversation has changed',
            'A Director has brought the person it is about into the conversation. '
            || 'They can now read it and answer.');
  end if;
end;
$$;

revoke all on function public.bring_subject_into_report(uuid) from public, anon;
grant execute on function public.bring_subject_into_report(uuid) to authenticated;

-- -------------------------------------------------------------------- speaking --

create or replace function public.say_in_report(p_report uuid, p_body text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  me   public.profiles%rowtype;
  r    public.reports%rowtype;
  v_id uuid;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then
    raise exception 'Your account cannot do this.';
  end if;

  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'That report is not here.'; end if;

  -- WHO WRITES: the person who raised it, the person it is about once brought
  -- in, and the one Director holding it. Other Admins read; one voice speaks
  -- for the church, as before.
  if not (me.id = r.reporter_id
          or (me.id = r.subject_id and r.subject_joined_at is not null)
          or me.id = r.claimed_by) then
    if private.may_handle_report(p_report) then
      raise exception 'Pick this report up to write in it. One Director speaks for the church at a time.';
    end if;
    raise exception 'This conversation is not yours to write in.';
  end if;

  if r.claimed_by is null then
    raise exception 'Nobody has picked this up yet. You will be told when somebody does.';
  end if;
  if r.reporter_id is null and r.subject_joined_at is null then
    raise exception 'The person who raised this has deleted their account, so nobody would read a reply.';
  end if;

  if btrim(coalesce(p_body, '')) = '' then raise exception 'Say something first.'; end if;

  insert into public.report_messages (report_id, author_id, body)
  values (p_report, me.id, btrim(p_body))
  returning id into v_id;

  -- Everybody else in it who writes there is told; Admins who only read follow
  -- the list, as they always have.
  insert into public.notifications (user_id, type, title, body)
  select distinct u, 'report', 'A new message about a report',
         'There is a reply waiting in Settings, under Admin Reports.'
    from unnest(array[r.reporter_id,
                      case when r.subject_joined_at is not null then r.subject_id end,
                      r.claimed_by]) as u
   where u is not null and u <> me.id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------ the list --

-- Its shape changes, so it is dropped and made again.
drop function if exists public.my_reports();
/**
 * Every report I am in or may handle, and what I may know about it.
 *
 * Names are resolved here so a member sees who is in the conversation without
 * being handed a way to read everybody's profile.
 */
create function public.my_reports()
returns table (
  id                uuid,
  reason            text,
  detail            text,
  status            text,
  created_at        timestamptz,
  mine              boolean,
  about_me          boolean,
  claimed_by        uuid,
  claimed_name      text,
  reporter_name     text,
  subject_name      text,
  can_handle        boolean,
  subject_may_join  boolean,
  subject_joined_at timestamptz,
  messages          bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select r.id, r.reason, r.detail, r.status, r.created_at,
         r.reporter_id = (select auth.uid()) as mine,
         (r.subject_id = (select auth.uid()) and r.subject_joined_at is not null) as about_me,
         r.claimed_by,
         c.full_name as claimed_name,
         -- Who raised it: for the Admins, and for the person it is about once
         -- they are in the conversation, where it shows on every message anyway.
         case when private.may_handle_report(r.id)
                or (r.subject_id = (select auth.uid()) and r.subject_joined_at is not null)
              then private.name_kept(r.reporter_id, r.reporter_name) end as reporter_name,
         case when private.may_handle_report(r.id)
                or r.reporter_id = (select auth.uid())
                or (r.subject_id = (select auth.uid()) and r.subject_joined_at is not null)
              then private.name_kept(r.subject_id, r.subject_name) end as subject_name,
         private.may_handle_report(r.id) as can_handle,
         r.subject_may_join,
         r.subject_joined_at,
         (select count(*) from public.report_messages m where m.report_id = r.id) as messages
    from public.reports r
    left join public.profiles c on c.id = r.claimed_by
   where r.reporter_id = (select auth.uid())
      or private.may_handle_report(r.id)
      or (r.subject_id = (select auth.uid()) and r.subject_joined_at is not null)
   order by r.status = 'open' desc, r.created_at desc;
$$;

revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;

-- ------------------------------------------------ a report is not rewritten --
--
-- ALSO FOUND WHILE DOING THIS, AND OLDER THAN IT. `reports_decide` (0021, as
-- 20260915120000) let any Admin who may handle a report UPDATE its row straight
-- through the data API, every column: what the person reporting wrote, whom it
-- is about, who holds it, the outcome, and now whether the person it is about
-- was brought in. Nothing in the app writes to the table; every change already
-- goes through a checked function (resolve_report, claim_report,
-- release_report, bring_subject_into_report), each security definer and
-- untouched by this. So the door is shut rather than narrowed: no update rule,
-- and no insert, update or delete for signed-in people. Reading is unchanged.
drop policy if exists reports_decide on public.reports;
revoke insert, update, delete on public.reports from authenticated;

-- ----------------------------------------------------------- the evidence --
--
-- FOUND WHILE DOING THIS, AND OLDER THAN IT. A report's evidence (0021's
-- report_files, 20260902060000) was readable by every approved Director and
-- Executive Director of the church: its row by `report_files_read`, its file by
-- `report_evidence_read`, which asks only whether you lead the uploader's
-- church. Neither applied the two rules every other part of a report follows,
-- so the Director a report was about could open the evidence against them, and
-- every Director could open the evidence in a report meant for Executive
-- Directors only. Evidence now follows the report: whoever may handle it, and
-- nobody else. The person a report is about, brought into the conversation,
-- does not see the evidence either; the form says Directors can open it.

-- Suspension is asked here in so many words as well as inside
-- may_handle_report, as every rule on this table has since 20260923164500
-- (tests/a-suspension-is-immediate.mjs).
drop policy if exists report_files_read on public.report_files;
create policy report_files_read on public.report_files
  for select to authenticated using (
    private.may_handle_report(report_id)
    and exists (select 1 from public.profiles me
                 where me.id = (select auth.uid()) and me.suspended_at is null)
  );

/** May I open this stored evidence file? Whoever may handle its report. */
create or replace function private.may_read_report_file(p_name text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.report_files f
     where f.path = p_name
       and private.may_handle_report(f.report_id)
  );
$$;

revoke all on function private.may_read_report_file(text) from public, anon;
grant execute on function private.may_read_report_file(text) to authenticated;

drop policy if exists report_evidence_read on storage.objects;
create policy report_evidence_read on storage.objects
  for select to authenticated using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'reports'
    and private.may_read_report_file(name)
  );

commit;
