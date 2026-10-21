-- Who is in the court room is kept only while the hearing is in session.
--
-- ---------------------------------------------------------------------------
-- WHY. 20261020200000 gave the hearing a live room: each open screen says
-- "I am here" (court_here), and the case shows who was seen in the last
-- minute and a bit. Each of those is one row per person per case: when they
-- last had it open. A case is kept for good, so without this those rows
-- would be kept for good too, long after the room they described had closed,
-- and they are not evidence (reading the case is already on its record).
-- The owner asked for the rules of data privacy to be respected: keep no
-- more about a person than the purpose needs, for no longer than it needs.
--
-- WHAT THIS DOES:
--   1. court_here writes nothing once the hearing has ended. A screen a
--      moment behind the end is not refused; it simply records nothing.
--   2. court_close_hearing clears who had the room open, and when, as the
--      hearing ends. Otherwise exactly as 20261020200000.
--
-- Safe to run whether or not 20261020200000 has been applied before it in a
-- separate step: it replaces two functions that migration created, and
-- nothing else.
-- ---------------------------------------------------------------------------

begin;

/** "I am here", from an open screen, while the hearing is in session. */
create or replace function public.court_here(p_trial uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.court_require_door();
  if private.court_place(p_trial) is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  -- A screen a moment behind the end of the hearing is not an error.
  if not exists (select 1 from public.trials where id = p_trial and status = 'open') then
    return;
  end if;
  insert into public.court_presence (trial_id, person_id, seen_at)
  values (p_trial, (select auth.uid()), now())
  on conflict (trial_id, person_id) do update set seen_at = excluded.seen_at;
end;
$$;

/** As 20261020200000, and who had the room open is cleared as the hearing ends. */
create or replace function public.court_close_hearing(
  p_trial          uuid,
  p_recommendation text,
  p_note           text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t     public.trials%rowtype;
  seal  text;
  words text;
  l     record;
  about_lead boolean;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge ends the hearing.';
  end if;
  if t.status <> 'open' then return 'This hearing has already ended.'; end if;
  words := case p_recommendation
    when 'dismiss' then 'dismiss the case'
    when 'counsel' then 'counsel, with no change to their account'
    when 'suspend' then 'suspend them'
    when 'remove'  then 'remove them from the church' end;
  if words is null then
    return 'Recommend dismissing the case, counsel, suspension or removal.';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    return 'Say why in 2000 characters or fewer.';
  end if;

  seal := private.court_append(p_trial, 'hearing_closed',
    private.court_sha256(p_recommendation || chr(10) || coalesce(btrim(p_note), '')),
    'Hearing closed. The judge recommends: ' || words
      || coalesce(' -- ' || nullif(btrim(coalesce(p_note, '')), ''), '')
      || '. The final ruling is the Church Board''s.');

  update public.trials
     set status = 'with_board', recommendation = p_recommendation,
         recommendation_note = nullif(btrim(coalesce(p_note, '')), ''),
         heard_at = now(), seal_hash = seal, sealed_at = now()
   where id = p_trial;

  for l in select cl.id from public.court_leave cl
            where cl.trial_id = p_trial and cl.ended_at is null loop
    perform private.court_close_leave(l.id, 'case_closed');
  end loop;

  -- Who had the room open, and when, was for the live hearing only.
  delete from public.court_presence where trial_id = p_trial;

  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'trial', 'The hearing has ended',
         'The judge has ended the hearing. The Church Board will give the final ruling.'
    from public.trial_parties tp
   where tp.trial_id = p_trial and tp.part <> 'observer';

  -- Those who will write the Board's ruling down: the church's leaders who
  -- sat on the case, never the person it is about.
  about_lead := coalesce(t.subject_role in ('admin', 'executive'), false);
  insert into public.notifications (user_id, type, title, body)
  select p.id, 'trial', 'A case is waiting for the Church Board',
         'A hearing has ended with the judge''s recommendation. When the Church Board has ruled, write its ruling down in Admin Reports.'
    from public.profiles p
   where p.is_approved and p.suspended_at is null
     and p.role in ('admin', 'executive')
     and p.id <> (select auth.uid())
     and p.id is distinct from t.subject_id
     and (not about_lead or p.role = 'executive')
     and (p.church_id = t.church_id
          or (p.role = 'executive' and exists (
                select 1 from public.church_executives ce
                 where ce.executive_id = p.id and ce.church_id = t.church_id)));

  return 'ok';
end;
$$;

revoke all on function public.court_here(uuid)                      from public, anon;
revoke all on function public.court_close_hearing(uuid, text, text) from public, anon;
grant execute on function public.court_here(uuid)                   to authenticated;
grant execute on function public.court_close_hearing(uuid, text, text) to authenticated;

commit;
