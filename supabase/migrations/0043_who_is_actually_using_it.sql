-- "How many Guides were active this week?" — answered from what the app records.
--
-- THE HONEST PART FIRST, because this is the number most easily faked.
--
-- Beacon does NOT log sign-ins. There is no `last_seen_at`, nothing writes one,
-- and adding one tonight would report every member inactive tomorrow because
-- the column would have no history. So "active" here does not mean "opened the
-- app". It means SOMETHING THIS PERSON DID WAS RECORDED in the window:
--
--   * they sent a message,
--   * a journey step was recorded on their pairing, by either of them,
--   * a meeting of theirs was arranged,
--   * they published a blog post or wrote a lesson.
--
-- That is a narrower thing than attendance and a truer one than a login count:
-- somebody who opened the app, read nothing and left is not what a Director is
-- asking about when they ask who is active. The screen says so in plain words
-- rather than leaving a pastor to assume it means visits.
--
-- WHY MESSAGES ARE COUNTED HERE WHEN A DIRECTOR CANNOT READ ONE. This function
-- is SECURITY DEFINER and returns four integers per role. It never returns a
-- message, a name, or which person was active — only how many were. That is the
-- same posture as the blog's reader count and as church_pulse, which has
-- counted messages since migration 0029. A count is not a conversation.
--
-- SCOPE. The roll is built from profiles in churches this caller leads, so the
-- policy that governs everything else governs this. The activity set is
-- computed church-wide and used only as a membership test against that roll, so
-- nothing about another congregation can be read out of the result.

begin;

create or replace function public.church_activity(p_days int default 7)
returns table (
  role       text,
  approved   bigint,
  active     bigint,
  inactive   bigint,
  suspended  bigint
)
language sql stable security definer set search_path to 'public'
as $fn$
  with win as (
    -- Clamped, so a hand-made call cannot ask for a window that scans forever.
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 400))) as since
  ),
  roll as (
    select p.id, p.role::text as role, p.suspended_at
    from public.profiles p
    where p.is_approved
      and p.church_id is not null
      and public.leads_church(p.church_id)
  ),
  doers as (
    select m.sender_id as id from public.messages m, win where m.created_at >= win.since
    union
    select e.changed_by from public.journey_events e, win
      where e.created_at >= win.since and e.changed_by is not null
    union
    select pr.dm_id from public.journey_events e join public.pairings pr on pr.id = e.pairing_id, win
      where e.created_at >= win.since
    union
    select pr.ds_id from public.journey_events e join public.pairings pr on pr.id = e.pairing_id, win
      where e.created_at >= win.since
    union
    select mt.created_by from public.meetings mt, win
      where mt.created_at >= win.since and mt.created_by is not null
    union
    select pr.dm_id from public.meetings mt join public.pairings pr on pr.id = mt.pairing_id, win
      where mt.created_at >= win.since
    union
    select pr.ds_id from public.meetings mt join public.pairings pr on pr.id = mt.pairing_id, win
      where mt.created_at >= win.since
    union
    select b.author_id from public.blog_posts b, win where b.created_at >= win.since
    union
    select l.author_id from public.lessons l, win
      where l.created_at >= win.since and l.author_id is not null
  )
  select r.role,
         count(*)                                                   as approved,
         count(*) filter (where r.id in (select id from doers))     as active,
         count(*) filter (where r.id not in (select id from doers)) as inactive,
         count(*) filter (where r.suspended_at is not null)         as suspended
  from roll r
  group by r.role;
$fn$;

comment on function public.church_activity(int) is
  'Per role: how many approved members, how many had a recorded action in the '
  'last p_days, how many did not, and how many are suspended. Counts only — no '
  'names and no message content ever leave this function. "Active" means a '
  'recorded action, NOT a sign-in: Beacon does not log sign-ins.';

revoke all on function public.church_activity(int) from public, anon;
grant execute on function public.church_activity(int) to authenticated;

commit;
