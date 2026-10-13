-- A conversation's history opens only for a report, and every opening is on
-- the record.
--
-- ---------------------------------------------------------------------------
-- WHY. When a message is edited or taken back, what it said before is kept in
-- `message_revisions` (20260909200000), so that a safeguarding report can be
-- judged on what was really said. Those words exist for safeguarding, and
-- reading them should be bound to safeguarding: a report about that
-- conversation, raised in that church.
--
-- The function that reads them never worked: it looked for the church on the
-- pairing, and pairings carry no church column, so every call failed with
-- "column p.church_id does not exist" and leadership could not see what a
-- withdrawn message had said. It also asked only whether the reader leads the
-- church, so mending the column alone would have opened every conversation's
-- history to leadership with no report at all.
--
-- Now a pairing's church is found the way its own rules find it, from the
-- Explorer (church_of(ds_id), as in pairings_update); a safeguarding report on
-- that pairing is required; and each reading is written into the church's
-- security record, so that looking at a history is itself something leadership
-- can see was done, by whom and when.
--
-- No screen calls this function today. The rule lives here so that any screen
-- added later inherits it instead of having to remember it.
--
-- WHAT DOES NOT CHANGE. Nobody in leadership reads a conversation's current
-- messages; a Guide and an Explorer still cannot read their own history; the
-- table still has no policy and no browser can read it directly.
--
-- TO UNDO: re-run the function body from 20260909200000 and put the event-type
-- constraint back to the list in 20260831060000. Rows already written with
-- 'message_history_read' must be removed first, or the old constraint refuses.
-- ---------------------------------------------------------------------------

begin;

-- The security record learns one more kind of event. A constraint cannot be
-- widened in place, so it is replaced, as 20260831060000 did.
alter table public.security_audit_events
  drop constraint if exists security_audit_events_event_type_check;
alter table public.security_audit_events
  add constraint security_audit_events_event_type_check check (event_type in (
    'profile_change', 'identity_change', 'safeguarding_report',
    'account_suspended', 'account_restored', 'account_removed',
    'approval_changed', 'guild_post_removed', 'message_history_read'
  ));

create or replace function private.message_history_for_leader(p_pairing uuid)
returns table (
  message_id  uuid,
  author_id   uuid,
  body        text,
  reason      text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_church  uuid;
  v_report  public.reports%rowtype;
  v_reader  public.profiles%rowtype;
  v_subject public.profiles%rowtype;
begin
  select public.church_of(p.ds_id) into v_church from public.pairings p where p.id = p_pairing;
  if v_church is null then
    raise exception 'No such pairing.';
  end if;
  if not public.leads_church(v_church) then
    raise exception 'Only church leadership may read a message history.'
      using errcode = '42501';
  end if;

  -- The newest report about this conversation, raised in this church.
  select * into v_report
    from public.reports r
   where r.pairing_id = p_pairing
     and r.church_id = v_church
   order by r.created_at desc
   limit 1;
  if v_report.id is null then
    raise exception 'A message history is opened only for a conversation somebody has reported.'
      using errcode = '42501';
  end if;

  select * into v_reader  from public.profiles where id = (select auth.uid());
  select * into v_subject from public.profiles where id = v_report.subject_id;

  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary
  ) values (
    v_church, v_subject.id, coalesce(v_subject.full_name, 'A member'), v_subject.role::text,
    v_reader.id, coalesce(v_reader.full_name, 'A leader'), v_reader.role::text,
    'message_history_read', 'review',
    coalesce(v_reader.full_name, 'A leader') || ' opened the message history of a reported conversation.'
  );

  return query
  select r.message_id, r.author_id, r.body, r.reason, r.recorded_at
  from public.message_revisions r
  where r.pairing_id = p_pairing
  order by r.recorded_at desc;
end;
$$;

-- Grants are unchanged: `create or replace` keeps them, and the public wrapper
-- (20260909200000) runs as its caller, so it needs this function callable.
-- Every rule is inside the function, whichever way it is reached.

comment on table public.message_revisions is
  'What a message said before it was edited or deleted. RLS on with no policy: '
  'unreadable from a browser by anybody, including the two people in the '
  'conversation. Read by church leadership only through '
  'message_history_for_leader(), only for a conversation somebody has reported, '
  'and every reading is written to security_audit_events.';

commit;
