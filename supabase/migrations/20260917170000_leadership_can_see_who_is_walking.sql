-- What each Guide and Explorer has actually been doing. Numbers, not a feed.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and
-- Explorer activities please."
--
-- THE FEED ANSWERS "what happened". THIS ANSWERS "who is being walked with and
-- who is not", which is the question a Director actually carries and cannot get
-- by scrolling. Forty rows of events do not say that one Explorer has heard
-- from nobody in three weeks: that person appears in the feed exactly zero
-- times, which is the whole problem, and a list of things that happened can
-- only ever show what is there.
--
-- THE SAME TWO RULES AS THE RECORD, because they are the church's rules and not
-- one screen's: nothing here reads a conversation, and nothing here returns an
-- address. Every column is a COUNT or a DATE. A count of things the database
-- labelled as needing a look is the strongest thing it will say about anybody.
--
-- QUIET IS A NUMBER, AND IT IS THE POINT. `quiet_days` is how long since that
-- person did anything the app can see. It is the one figure that finds the
-- person nobody has noticed, which is what the whole discipleship shape exists
-- to prevent and what a roster of green ticks hides.
--
-- WHO IS IN IT. A Director reads the Guides and Explorers of a church they
-- lead. An Executive Director, head or otherwise, reads those and the Directors
-- as well. Nobody appears in their own analysis, and a Guide cannot open it at
-- all: a Guide who can measure their own Explorers against each other has been
-- handed a management tool for a pastoral relationship.
-- ---------------------------------------------------------------------------

create or replace function public.guide_and_explorer_activity(p_days integer default 30)
returns table (
  person_id uuid,
  person_name text,
  person_role text,
  walks_with text,
  explorers_carried integer,
  cap integer,
  appointments_proposed bigint,
  appointments_confirmed bigint,
  appointments_declined bigint,
  appointments_kept bigint,
  resources_shared bigint,
  pocket_adds bigint,
  flagged bigint,
  last_seen timestamptz,
  quiet_days integer
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $fn$
declare
  me public.profiles%rowtype;
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  select profile.* into me from public.profiles as profile
   where profile.id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may read the activity analysis.' using errcode = '42501';
  end if;

  return query
  with watched as (
    select p.* from public.profiles p
     where public.leads_church(p.church_id)
       and p.is_approved
       and p.id <> me.id
       and (
         (me.role = 'admin'     and p.role::text in ('dm', 'ds'))
         or (me.role = 'executive' and p.role::text in ('dm', 'ds', 'admin'))
       )
  )
  select
    w.id,
    coalesce(w.full_name, 'A member'),
    w.role::text,
    -- WHO THEY WALK WITH. For an Explorer an empty one is the row that matters
    -- most on the whole screen: somebody in an app where nothing happens.
    (select string_agg(coalesce(o.full_name, 'somebody'), ', ')
       from public.pairings pr
       join public.profiles o
         on o.id = case when pr.dm_id = w.id then pr.ds_id else pr.dm_id end
      where pr.status = 'active' and (pr.dm_id = w.id or pr.ds_id = w.id)),
    (select count(*)::integer from public.pairings pr
      where pr.status = 'active' and pr.dm_id = w.id),
    public.guide_pairing_limit_for(w.church_id),
    (select count(*) from public.meetings m
      join public.pairings pr on pr.id = m.pairing_id
      where m.created_by = w.id and m.created_at >= since),
    (select count(*) from public.meetings m
      where m.answered_by = w.id and m.status = 'confirmed' and m.answered_at >= since),
    (select count(*) from public.meetings m
      where m.answered_by = w.id and m.status = 'declined' and m.answered_at >= since),
    -- KEPT, not merely agreed: a confirmed time whose hour has passed.
    (select count(*) from public.meetings m
      join public.pairings pr on pr.id = m.pairing_id
      where (pr.dm_id = w.id or pr.ds_id = w.id)
        and m.status = 'confirmed' and m.starts_at < now() and m.starts_at >= since),
    (select count(*) from public.library_activity a
      where a.actor_id = w.id and a.source = 'library' and a.occurred_at >= since),
    (select count(*) from public.library_activity a
      where a.actor_id = w.id and a.source = 'pocket' and a.occurred_at >= since),
    (select count(*) from public.library_activity a
      where a.actor_id = w.id and a.concern <> 'ordinary' and a.occurred_at >= since),
    greatest(
      (select max(m.created_at) from public.meetings m where m.created_by = w.id),
      (select max(m.answered_at) from public.meetings m where m.answered_by = w.id),
      (select max(a.occurred_at) from public.library_activity a where a.actor_id = w.id),
      w.created_at
    ),
    extract(day from now() - greatest(
      (select max(m.created_at) from public.meetings m where m.created_by = w.id),
      (select max(m.answered_at) from public.meetings m where m.answered_by = w.id),
      (select max(a.occurred_at) from public.library_activity a where a.actor_id = w.id),
      w.created_at
    ))::integer
  from watched w
  order by
    -- THE PERSON NOBODY HAS NOTICED COMES FIRST. Sorting by name puts them
    -- wherever the alphabet does, which is how they stay unnoticed.
    (w.role::text = 'ds' and not exists (
      select 1 from public.pairings pr where pr.status='active' and pr.ds_id = w.id)) desc,
    15 desc nulls last,
    coalesce(w.full_name, '');
end;
$fn$;

revoke all on function public.guide_and_explorer_activity(integer) from public, anon;
grant execute on function public.guide_and_explorer_activity(integer) to authenticated;
