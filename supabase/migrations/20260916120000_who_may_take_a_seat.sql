-- The Hall of Justice: who may take a seat, and who may not.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "I (as a Director, ED, Head ED) should have a notification button
-- to both guide and explorer to be summoned on trial ... Any Director, ED, and
-- Head can join the trial room" -- and then, asked back and answered: "yes do
-- that, except trials about themselves or fellow Directors".
--
-- HALF OF THIS WAS ALREADY TRUE, AND THAT IS THE PROBLEM. `in_trial` has always
-- had a second branch admitting any approved Director or Executive of the
-- church, so leadership could already read every trial. What it has never had
-- is either exclusion:
--
--   * A Director could read the trial about THEMSELVES from the bench. They are
--     also a party to it, as the accused, and that access is right and stays --
--     somebody must be able to answer what is said about them. What is wrong is
--     holding both chairs at once.
--
--   * A Director could sit on a trial about a FELLOW Director, which is the one
--     the owner ruled out in their own words. `discipline_check` already
--     refuses to let a Director suspend or remove another Director, so the
--     power was withheld and the seat was not -- a Director could hear the case
--     and only the verdict was out of reach.
--
-- Both are now structural. A case about leadership is Executive Directors'.
--
-- AND SITTING DOWN IS RECORDED. `join_trial` writes a row rather than the seat
-- being implicit in a policy, because who was in the room when a member was
-- judged is exactly the kind of thing a church needs to be able to answer
-- afterwards, and a policy leaves no trace.
-- ---------------------------------------------------------------------------

-- A seat on the bench is a part like any other, and is kept like one.
alter table public.trial_parties drop constraint if exists trial_parties_part_check;
alter table public.trial_parties
  add constraint trial_parties_part_check
  check (part in ('accused', 'reporter', 'witness', 'bench'));

/**
 * May I sit on this case?
 *
 * Distinct from being a PARTY to it. A party is somebody the case is about or
 * who was called to it; the bench is leadership hearing it.
 */
create or replace function private.may_sit_on_trial(p_trial uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  me      public.profiles%rowtype;
  t       public.trials%rowtype;
  accused public.profiles%rowtype;
begin
  select * into t from public.trials where id = p_trial;
  if t.id is null then return false; end if;

  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then return false; end if;
  if me.role not in ('admin', 'executive') then return false; end if;

  -- The church, with the executive link as well as the column, because an
  -- Executive Director oversees a church without necessarily belonging to it.
  if not (
    (me.role = 'admin' and me.church_id = t.church_id)
    or (me.role = 'executive' and (
          me.church_id = t.church_id
          or exists (select 1 from public.church_executives ce
                     where ce.executive_id = me.id and ce.church_id = t.church_id)))
  ) then
    return false;
  end if;

  -- NEVER YOUR OWN CASE FROM THE BENCH. They keep their seat as the accused.
  if me.id = t.subject_id then return false; end if;

  -- A CASE ABOUT LEADERSHIP IS EXECUTIVE DIRECTORS'.
  select * into accused from public.profiles where id = t.subject_id;
  if accused.role in ('admin', 'executive') and me.role <> 'executive' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.may_sit_on_trial(uuid) from public, anon;
grant execute on function private.may_sit_on_trial(uuid) to authenticated;

/**
 * In this case at all: a party to it, or entitled to sit on it.
 *
 * Replaces the old leadership branch wholesale. The parties branch is untouched,
 * which is what keeps the accused able to read and answer their own case.
 */
create or replace function public.in_trial(p_trial uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.trial_parties tp
    where tp.trial_id = p_trial and tp.person_id = (select auth.uid())
  ) or private.may_sit_on_trial(p_trial);
$$;

revoke all on function public.in_trial(uuid) from public, anon;
grant execute on function public.in_trial(uuid) to authenticated;

/**
 * Take a seat, on the record.
 */
create or replace function public.join_trial(p_trial uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me public.profiles%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if not private.may_sit_on_trial(p_trial) then
    -- One message for every refusal. "Because it is about you" and "because it
    -- is about a colleague" both confirm something about a case the asker is
    -- not entitled to know the shape of.
    raise exception 'That case is not yours to sit on.';
  end if;
  insert into public.trial_parties (trial_id, person_id, part)
  values (p_trial, me.id, 'bench')
  on conflict (trial_id, person_id) do nothing;
end;
$$;

revoke all on function public.join_trial(uuid) from public, anon;
grant execute on function public.join_trial(uuid) to authenticated;

/**
 * Every case I may see, with who is in the room.
 *
 * `my_trials` already answers "cases I am party to". This answers the Hall's
 * question, which is different: what is being heard, and may I take a seat.
 */
create or replace function public.trials_i_may_sit_on()
returns table (
  id          uuid,
  summary     text,
  status      text,
  verdict     text,
  opened_at   timestamptz,
  accused_name text,
  accused_role text,
  seated      bigint,
  i_am_seated boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.summary, t.status, t.verdict, t.opened_at,
         p.full_name, p.role,
         (select count(*) from public.trial_parties tp
           where tp.trial_id = t.id and tp.part = 'bench') as seated,
         exists (select 1 from public.trial_parties tp
                  where tp.trial_id = t.id and tp.person_id = (select auth.uid())) as i_am_seated
    from public.trials t
    join public.profiles p on p.id = t.subject_id
   where private.may_sit_on_trial(t.id)
   order by t.status = 'open' desc, t.opened_at desc;
$$;

revoke all on function public.trials_i_may_sit_on() from public, anon;
grant execute on function public.trials_i_may_sit_on() to authenticated;
