-- One rule per action, the links the screens use indexed, and "a report" in
-- place of "a case".
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, 27 October 2026, from the costed plan "Rust and Python for Hope
-- Beacon": "fast, secure, affordable, and optimized for more productivity
-- use". The plan's first finding was that nothing here waits on a slow
-- language, and that the speed Supabase's own advisor found missing needs no
-- new one. The owner chose this work first. It changes no rule.
--
-- 1. ONE RULE PER ACTION. Postgres runs every permissive rule on a table for
--    every row it considers, so three read rules on `profiles` cost three
--    checks per row, and `profiles` is read on almost every screen. Supabase's
--    advisor counted three such places (lint 0006): profiles SELECT (3 rules),
--    profiles UPDATE (2) and profile_changes SELECT (3). Each set becomes one
--    rule whose condition is the old conditions joined by OR, which is exactly
--    how Postgres combines permissive rules, for USING and for WITH CHECK
--    separately. Nothing anybody may see or change moves. The restrictive
--    `a_suspended_account_sees_nothing` rules are not touched.
--
--    THE SELF ARM COMES FIRST. An insert that asks for its own row back only
--    works if the read rule can answer from the row without looking it up
--    (tests/the-library-is-shared-and-watched.mjs, section 1). On profiles
--    that was `profiles_read_self` sitting beside `profiles_read_paired`; it
--    is now the first arm of the one rule.
--
-- 2. THE LINKS A SCREEN OR A DELETION USES, INDEXED. The advisor counted 81
--    foreign keys without an index; at 16 MB none costs anything you would
--    notice, so only these: reports by the person who raised them, the person
--    they are about and the Director holding them (the three lists in Admin
--    Reports); a reply's link back to the message it answers, checked when a
--    message is taken back; and the columns Postgres scans when an account is
--    deleted (report messages, reactions, and three on profiles). The reactions
--    on a message are already served by message_reactions_one_per_message,
--    whose first column is the message.
--
-- 3. "OPEN A CASE" WAS COURT WORDING. The leaders' library record raises an
--    ordinary report through report_person and always did; only its words
--    were a court's. The function keeps its name, so a copy of the app built
--    before today keeps working, and two of its messages say "report". Its body
--    is otherwise exactly 20260917140000's.
-- ---------------------------------------------------------------------------

begin;

-- ------------------------------------------------------------------ profiles --

drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_read_paired on public.profiles;
drop policy if exists profiles_read_church on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.people_i_walk_with())
    or church_id in (select private.churches_i_manage())
  );

drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_church on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.manages_church(church_id))
  with check (id = (select auth.uid()) or public.manages_church(church_id));

-- ----------------------------------------------------------- profile_changes --

drop policy if exists profile_changes_read_own on public.profile_changes;
drop policy if exists profile_changes_read_guide on public.profile_changes;
drop policy if exists profile_changes_read_leadership on public.profile_changes;
create policy profile_changes_read on public.profile_changes
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_paired_with(profile_id)
    or public.manages_church(church_id)
  );

-- ------------------------------------------------------------------- indexes --

create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_subject_idx on public.reports (subject_id);
create index if not exists reports_claimed_by_idx on public.reports (claimed_by) where claimed_by is not null;
create index if not exists messages_reply_to_idx on public.messages (reply_to, pairing_id) where reply_to is not null;
create index if not exists report_messages_author_idx on public.report_messages (author_id);
create index if not exists message_reactions_person_idx on public.message_reactions (person_id);
create index if not exists profiles_approved_by_idx on public.profiles (approved_by) where approved_by is not null;
create index if not exists profiles_suspended_by_idx on public.profiles (suspended_by) where suspended_by is not null;
create index if not exists profiles_guardian_consent_by_idx on public.profiles (guardian_consent_by) where guardian_consent_by is not null;

-- ------------------------------------------------- a report, not a case --

create or replace function public.open_case_from_activity(p_activity uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to public, private, pg_temp
as $fn$
declare
  me    public.profiles%rowtype;
  event public.library_activity%rowtype;
  said  text;
begin
  select profile.* into me from public.profiles as profile where profile.id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may raise a report from the record.' using errcode = '42501';
  end if;

  select * into event from public.library_activity where id = p_activity;
  if event.id is null or not public.leads_church(event.church_id) then
    raise exception 'That activity is not one you can act on.' using errcode = '42501';
  end if;
  if event.actor_id is null then
    raise exception 'That activity has no one left to answer for it.' using errcode = '42501';
  end if;
  if event.actor_id = me.id then
    raise exception 'You cannot raise a report about yourself.' using errcode = '42501';
  end if;
  if not (
    (me.role = 'admin'     and event.actor_role in ('dm', 'ds'))
    or (me.role = 'executive' and event.actor_role in ('dm', 'ds', 'admin'))
  ) then
    raise exception 'That is not somebody you oversee.' using errcode = '42501';
  end if;

  said := format('From the activity record, %s: %s %s "%s", labelled %s.',
                 to_char(event.occurred_at, 'DD Mon YYYY HH24:MI'),
                 case event.actor_role when 'dm' then 'a Guide' when 'ds' then 'an Explorer'
                                       when 'admin' then 'a Director' else 'an Executive Director' end,
                 case event.action when 'shared' then 'shared' when 'pocketed' then 'put in their pocket'
                                   else 'added' end,
                 coalesce(event.title, 'a resource'),
                 event.label);
  if coalesce(btrim(p_note), '') <> '' then
    said := said || E'\n\n' || btrim(p_note);
  end if;

  return public.report_person(
    event.actor_id,
    case when event.concern = 'harmful' then 'unsafe' else 'inappropriate' end,
    said,
    null);
end;
$fn$;

revoke all on function public.open_case_from_activity(uuid, text) from public, anon;
grant execute on function public.open_case_from_activity(uuid, text) to authenticated;

commit;
