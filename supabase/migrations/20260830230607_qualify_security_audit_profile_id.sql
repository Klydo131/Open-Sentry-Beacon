-- The TABLE return field named `id` is also a PL/pgSQL variable. Qualify the
-- profile lookup so Postgres does not confuse that output variable with the
-- profiles primary key when leadership opens the Security Audit Room.

create or replace function private.security_audit_feed(p_limit integer default 100)
returns table (
  id uuid,
  subject_name text,
  subject_role text,
  event_type text,
  severity text,
  summary text,
  actor_label text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  me public.profiles%rowtype;
  row_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  select profile.*
  into me
  from public.profiles as profile
  where profile.id = (select auth.uid());

  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may open the security audit room.' using errcode = '42501';
  end if;

  return query
  select
    event.id,
    event.subject_name,
    event.subject_role,
    event.event_type,
    event.severity,
    event.summary,
    case
      when me.role = 'executive' then event.actor_name
      when event.actor_role in ('admin', 'executive') then 'Church leadership'
      else event.actor_name
    end,
    event.occurred_at
  from public.security_audit_events event
  where public.leads_church(event.church_id)
    and (
      event.subject_role in ('dm', 'ds')
      or (me.role = 'executive' and event.subject_role = 'admin')
    )
  order by event.occurred_at desc
  limit row_limit;
end;
$fn$;
