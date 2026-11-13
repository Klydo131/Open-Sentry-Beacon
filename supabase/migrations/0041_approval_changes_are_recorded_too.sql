-- Approvals and refusals leave a record, like every other decision about a person.
--
-- THE HOLE THIS FILLS. `discipline_log` recorded suspending, releasing and
-- removing somebody. It did not record approving or disapproving them — so
--  had no answer anywhere in
-- the database. The profile carried `is_approved = false` and nothing else:
-- not when, not who by, not whether it had ever been true. A Director asking
-- that question was asking about an event the app had never written down.
--
-- WHY APPROVALS ARE RECORDED AND NOT ONLY REFUSALS. A log that keeps only the
-- punishments reads like a charge sheet. Recording both makes it what it should
-- be: the sequence of decisions a church made about a person, which is also the
-- only form in which a refusal that was later reversed makes sense.
--
-- This was applied to the live database before the file existed. The file is
-- written to match what is running, not the other way round.

begin;

alter table public.discipline_log
  drop constraint if exists discipline_log_action_check;
alter table public.discipline_log
  add constraint discipline_log_action_check check (
    action in ('suspended', 'released', 'removed', 'approved', 'disapproved')
  );

create or replace function public.record_approval_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  actor public.profiles%rowtype;
begin
  if new.is_approved is not distinct from old.is_approved then
    return new;
  end if;

  select * into actor from public.profiles where id = (select auth.uid());

  -- The row is written even when the actor cannot be resolved, which happens
  -- when a change is made from the SQL editor or by a scheduled job. An
  -- unattributed record is worth far more than no record: it still fixes the
  -- date, the person and the direction.
  insert into public.discipline_log (
    church_id, person_id, person_name, person_role, action, by_id, by_name
  )
  values (
    new.church_id,
    new.id,
    coalesce(new.full_name, 'Someone'),
    new.role::text,
    case when new.is_approved then 'approved' else 'disapproved' end,
    actor.id,
    coalesce(actor.full_name, 'Recorded by the system')
  );

  return new;
end;
$$;

drop trigger if exists record_approval_change on public.profiles;
create trigger record_approval_change
  after update of is_approved on public.profiles
  for each row execute function public.record_approval_change();

commit;
