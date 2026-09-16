-- Watching a hearing is not taking part in it.
--
-- ---------------------------------------------------------------------------
-- CORRECTED BY THE OWNER, and the correction matters: "what I mean ED,
-- Director and Head Director can join is they are on the sidelines and can
-- monitor the hearing. That's all. The only one who accepted the case will be
-- main Judge Director."
--
-- The previous migration read "join the trial room" as joining the PROCEEDING
-- and called the part 'bench'. It is not a bench. Leadership may watch; the one
-- who accepted the case runs it. Two things follow, and one of them was a live
-- fault the moment it shipped.
--
-- THE FAULT. `trial_statements_speak` admits anybody `in_trial(trial_id)`, and
-- the previous migration widened `in_trial` to include every eligible leader of
-- the church. So every watching Director could POST INTO THE HEARING. A member
-- answering something said about them would have found four Directors in the
-- transcript, and the record of the case would name people who were never
-- called to it. Reading was the intention and writing came along with it,
-- because the two had never needed separating before.
--
-- Speaking is now: the person who accepted the case, and anybody actually
-- CALLED to it -- the accused, the reporter, a witness. Watching carries no
-- voice at all.
--
-- DECIDING WAS ALREADY RIGHT. `close_trial` has always required
-- `head_judge_id = auth.uid()`, so only the one who took the case can end it.
-- That half needed nothing and is left alone, which is worth writing down: the
-- owner's rule and the schema already agreed about the verdict, and disagreed
-- only about the transcript.
--
-- AND THE NAME CHANGES, because 'bench' says judging. Nobody had taken a seat
-- yet -- checked before renaming rather than assumed -- so there is no data to
-- migrate, only a word to stop being wrong.
-- ---------------------------------------------------------------------------

alter table public.trial_parties drop constraint if exists trial_parties_part_check;
alter table public.trial_parties
  add constraint trial_parties_part_check
  check (part in ('accused', 'reporter', 'witness', 'observer'));

/**
 * Watch a hearing, on the record.
 *
 * Still written down rather than left implicit in a policy: who was watching
 * when a member was judged is exactly what a church needs to be able to answer
 * afterwards, and it is if anything MORE important now that watching is silent
 * -- somebody present but absent from the transcript would otherwise leave no
 * trace at all.
 */
create or replace function public.join_trial(p_trial uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me public.profiles%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if not private.may_sit_on_trial(p_trial) then
    raise exception 'That hearing is not yours to watch.';
  end if;
  insert into public.trial_parties (trial_id, person_id, part)
  values (p_trial, me.id, 'observer')
  on conflict (trial_id, person_id) do nothing;
end;
$$;

revoke all on function public.join_trial(uuid) from public, anon;
grant execute on function public.join_trial(uuid) to authenticated;

-- THE POLICY THAT MAKES WATCHING SILENT.
--
-- Note what is still NOT here: any check on suspended_at. Somebody suspended
-- pending the outcome keeps their voice, because taking away their answer is
-- not a punishment, it is a way to lose the truth. That rule predates this
-- change and survives it.
drop policy if exists trial_statements_speak on public.trial_statements;
create policy trial_statements_speak on public.trial_statements
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.trials t
      where t.id = trial_id and t.status = 'open'
    )
    and (
      -- The one who accepted the case. They run the hearing.
      exists (
        select 1 from public.trials t
        where t.id = trial_id and t.head_judge_id = (select auth.uid())
      )
      -- Or somebody actually called to it. An observer is deliberately absent
      -- from this list, which is the whole of the change.
      or exists (
        select 1 from public.trial_parties tp
        where tp.trial_id = trial_id
          and tp.person_id = (select auth.uid())
          and tp.part in ('accused', 'reporter', 'witness')
      )
    )
  );

/** Renamed in the listing too, so the screen and the schema say the same word.
 *
 * DROPPED FIRST, because the columns it returns changed and Postgres refuses to
 * replace a function whose OUT parameters differ -- it said so plainly on the
 * first attempt. Safe here because this function is hours old and nothing but
 * the Hall screen has ever called it. */
drop function if exists public.trials_i_may_sit_on();
create function public.trials_i_may_sit_on()
returns table (
  id           uuid,
  summary      text,
  status       text,
  verdict      text,
  opened_at    timestamptz,
  accused_name text,
  accused_role text,
  watching     bigint,
  i_am_watching boolean,
  i_am_judge   boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.summary, t.status, t.verdict, t.opened_at,
         p.full_name, p.role,
         (select count(*) from public.trial_parties tp
           where tp.trial_id = t.id and tp.part = 'observer') as watching,
         exists (select 1 from public.trial_parties tp
                  where tp.trial_id = t.id and tp.person_id = (select auth.uid())) as i_am_watching,
         t.head_judge_id = (select auth.uid()) as i_am_judge
    from public.trials t
    join public.profiles p on p.id = t.subject_id
   where private.may_sit_on_trial(t.id)
   order by t.status = 'open' desc, t.opened_at desc;
$$;

revoke all on function public.trials_i_may_sit_on() from public, anon;
grant execute on function public.trials_i_may_sit_on() to authenticated;
