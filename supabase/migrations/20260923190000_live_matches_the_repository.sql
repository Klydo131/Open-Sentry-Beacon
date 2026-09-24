-- The live database, made the same as a fresh one built from this repository.
--
-- ---------------------------------------------------------------------------
-- HOW THIS WAS FOUND. On 23 September 2026 every migration in this repository
-- was applied, in order, to an empty Supabase database (the same Postgres 17.6
-- image Supabase runs), and the result was compared with the live database
-- object by object: 59 tables, 459 columns, 297 constraints, 141 indexes, 175
-- functions, 188 row rules, 41 triggers, every grant, the storage bucket and
-- the realtime publication. Once comments and line breaks were set aside --
-- the tool that applied most live migrations strips comments from function
-- bodies, which changes nothing a function does -- six things differed.
-- This restates the repository's version of each, so both are the same.
--
-- ONE OF THEM MATTERED. in_pairing() -- which decides who may read a pairing's
-- messages, meetings and shared materials -- was given an approval check by
-- 20260816130240_approval_revocation_gate: revoking somebody's approval was
-- meant to close their conversations at once. Two days later the live
-- database ran 0008_library, which re-created in_pairing WITHOUT that check
-- and silently undid it. In this repository 0008 sorts first, so a fresh
-- install was right and the live one was not: on live, a person whose approval
-- had been revoked but whose pairing still existed could go on reading it.
-- Nobody was in that position when this was written (all twenty pairings had
-- two approved members), so this changes nothing for anybody today.
--
-- THE OTHER FIVE BEHAVE THE SAME EITHER WAY, and are restated so that "the
-- same" means the same rather than "equivalent, if you read carefully":
--   * record_activity: one sentence written as one string on live and as two
--     joined strings here. Same text out.
--   * minors_in_church: live converts the role to text explicitly; here the
--     declared return type does it. Same rows out.
--   * messages_send: the same three conditions, in a different order.
--   * security_audit_events and seeker_notes kept REPLICA IDENTITY FULL on
--     live from the few minutes they were published (20260908170000, taken
--     back by 20260908180000). They are not published, so it only made every
--     update write the whole old row to the log. Back to the default.
--
-- NOT RESTATED, because they belong to the platform and not to this app: the
-- storage service's own triggers, the pg_net version, rls_auto_enable() (made
-- by the Supabase dashboard on some projects), and the settings Supabase keeps
-- on the authenticator role.
-- ---------------------------------------------------------------------------

begin;

-- From 20260816130240_approval_revocation_gate.
create or replace function public.in_pairing(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_approved_user() and exists (
    select 1 from public.pairings
    where id = p and (dm_id = (select auth.uid()) or ds_id = (select auth.uid()))
  );
$$;

-- From 20260917140000_leadership_sees_the_shape_not_the_thing.
create or replace function private.record_activity(
  p_actor uuid, p_action text, p_source text,
  p_title text, p_url text, p_with text, p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
declare
  actor public.profiles%rowtype;
  verdict record;
  host text;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.church_id is null then return; end if;

  select * into verdict from private.how_safe(p_url);
  host := split_part(split_part(
            regexp_replace(coalesce(p_url, ''), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
            '/', 1), ':', 1);

  insert into public.library_activity
    (church_id, actor_id, actor_name, actor_role, action, source,
     title, with_name, concern, label, host_mark, occurred_at)
  values
    (actor.church_id, actor.id, coalesce(actor.full_name, 'A member'), actor.role::text,
     p_action, p_source, p_title, p_with,
     verdict.concern, verdict.label,
     private.host_fingerprint(actor.church_id, host),
     coalesce(p_at, now()));

  -- THE ALERT. Only for the loudest label, and that restraint is the feature:
  -- a church whose Directors are told about every ordinary link stops reading
  -- the alerts, and then the one that mattered arrives in a pile of forty.
  if verdict.concern = 'harmful' then
    insert into public.notifications (user_id, type, title, body)
    select leader.id, 'watch',
           'Something needs a look',
           format('%s (%s) %s something labelled: %s. Open the activity record '
                  || 'to see it, and open a case if it should be answered for.',
                  coalesce(actor.full_name, 'A member'),
                  case actor.role::text when 'dm' then 'Guide' when 'ds' then 'Explorer'
                                        when 'admin' then 'Director' else 'Executive Director' end,
                  case p_action when 'shared' then 'shared' when 'pocketed' then 'added to their pocket'
                                else 'added' end,
                  verdict.label)
      from public.profiles leader
     where leader.church_id = actor.church_id
       and leader.role::text in ('admin', 'executive')
       and leader.is_approved
       and leader.id <> actor.id;
  end if;

  perform private.prune_library_activity();
end;
$fn$;

-- From 0034_the_directors_roster_of_minors.
create or replace function public.minors_in_church(p_church uuid default null)
returns table (
  member_id          uuid,
  full_name          text,
  role               text,
  birthday           date,
  consent_recorded   boolean,
  guardian_name      text,
  guardian_member_id uuid,
  guardian_full_name text,
  guardian_role      text,
  guardian_is_member boolean
) language sql stable security definer set search_path to 'public' as $$
  with target as (
    select coalesce(p_church, public.my_church_id()) as church_id
  )
  select
    child.id,
    child.full_name,
    child.role,
    child.birthday,
    child.guardian_consent_at is not null,
    child.guardian_name,
    child.guardian_member_id,
    guardian.full_name,
    guardian.role,
    guardian.id is not null
  from public.profiles child
  cross join target
  left join public.profiles guardian on guardian.id = child.guardian_member_id
  where child.church_id = target.church_id
    and public.manages_church(target.church_id)
    and public.is_minor(child.birthday)
  order by (child.guardian_consent_at is not null), child.birthday desc;
$$;

-- From 0023_trial_room, with the role 20260901120000 later set on it.
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and public.in_pairing(pairing_id)
    and not exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid()) and me.suspended_at is not null
    )
  );

alter table public.security_audit_events replica identity default;
alter table public.seeker_notes replica identity default;

commit;
