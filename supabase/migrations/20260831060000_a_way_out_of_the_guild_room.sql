-- The Guild Room needed a way out of it.
--
-- The board that shipped on 30 August lets Guides and Explorers broadcast a
-- thousand characters to a group. Verified against the live database before
-- writing this:
--
--   * a Director or an Executive Director cannot read the board at all;
--   * nobody but the author can remove anything from it, leadership included;
--   * there is no route for a member to say a post is wrong.
--
-- Explorers are in these guilds and some Explorers are minors — this app has a
-- guardian-consent table and a badge for exactly that reason. Every other place
-- in Beacon where one person can be hurt by another has the same three things:
-- a way to report it, somebody whose job it is to look, and a record that
-- outlives the person it describes. The one room where a message reaches a
-- whole group had none of them.
--
-- WHAT THIS DOES NOT DO: it does not open the board to leadership. A group
-- talking honestly is the point of the room, and a Director reading over their
-- shoulder is a different product. Leadership sees a post when, and only when,
-- somebody reports it.
--
-- THE SNAPSHOT IS THE POINT. `guild_post_body` copies the text into the report
-- as it was at the moment it was reported. Without it the obvious move is to
-- post something cruel, wait to be reported, delete it, and leave the Director
-- holding a report that points at nothing. The post can go; what it said
-- cannot.

begin;

-- ---------------------------------------------------------------------------
-- A report can now be about a guild post rather than a conversation.
-- ---------------------------------------------------------------------------
-- Same table, same policies, same screen. Leadership already reads `reports`
-- and already has the buttons to close one; a second, parallel report system
-- would be a second place to forget to look.
alter table public.reports
  add column if not exists guild_post_id   uuid references public.guild_activity_posts(id) on delete set null,
  add column if not exists guild_post_body text;

comment on column public.reports.guild_post_body is
  'The guild post as it read when it was reported. Kept even after the post '
  'itself is removed, so deleting the evidence does not empty the report.';

-- ---------------------------------------------------------------------------
-- Reporting a post, without learning who wrote it
-- ---------------------------------------------------------------------------
-- The board deliberately shows "A Guide" and "A fellow Explorer" rather than
-- names, so the reporter cannot name a subject and must not be asked to. The
-- author is resolved here, server-side, and is never returned.
create or replace function private.report_guild_post(
  p_post   uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_me     public.profiles%rowtype;
  v_post   public.guild_activity_posts%rowtype;
  v_author public.profiles%rowtype;
  v_id     uuid;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'You need an approved account to report a post.' using errcode = '42501';
  end if;

  select * into v_post from public.guild_activity_posts where id = p_post;
  -- Membership of the guild is the whole authorization. Somebody who cannot
  -- read the board cannot report from it, and the error says nothing about
  -- whether the post exists.
  if v_post.id is null or not private.active_guild_member(v_post.guild_id) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;
  if v_post.author_id = v_me.id then
    raise exception 'You can delete your own post instead of reporting it.';
  end if;
  if p_reason not in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other') then
    raise exception 'Unknown reason.';
  end if;

  select * into v_author from public.profiles where id = v_post.author_id;

  insert into public.reports
    (church_id, reporter_id, subject_id, reason, detail, guild_post_id, guild_post_body)
  values
    (v_post.church_id, v_me.id, v_post.author_id, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), v_post.id, v_post.body)
  returning id into v_id;

  -- Every Director by name, as report_person does. The notification says a
  -- guild post, and does not say whose: a notification is not a place to name
  -- somebody who has not been looked at yet.
  insert into public.notifications (user_id, type, title, body)
  select p.id,
         'report',
         'A safeguarding report needs your attention',
         coalesce(v_me.full_name, 'A member') || ' reported a post in the Guild Room.'
  from public.profiles p
  where p.church_id = v_post.church_id
    and p.is_approved
    and p.role in ('admin', 'executive');

  return v_id;
end;
$fn$;

create or replace function public.report_guild_post(
  p_post   uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language sql
set search_path to public, private, pg_temp
as $$ select private.report_guild_post(p_post, p_reason, p_detail); $$;

-- ---------------------------------------------------------------------------
-- Taking a post down, and saying so in the ledger
-- ---------------------------------------------------------------------------
-- `guild_post_removed` joins the event types the audit room already carries.
-- The constraint is replaced rather than widened in place because that is the
-- only way to change one.
alter table public.security_audit_events
  drop constraint if exists security_audit_events_event_type_check;
alter table public.security_audit_events
  add constraint security_audit_events_event_type_check check (event_type in (
    'profile_change', 'identity_change', 'safeguarding_report',
    'account_suspended', 'account_restored', 'account_removed',
    'approval_changed', 'guild_post_removed'
  ));

create or replace function private.remove_guild_post(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_post   public.guild_activity_posts%rowtype;
  v_author public.profiles%rowtype;
  v_me     public.profiles%rowtype;
begin
  select * into v_post from public.guild_activity_posts where id = p_post;
  if v_post.id is null then
    return false;
  end if;
  -- Leadership of the church the guild belongs to. `leads_church` already
  -- covers an Executive Director set over several congregations.
  if not public.leads_church(v_post.church_id) then
    raise exception 'Only church leadership may remove a guild post.' using errcode = '42501';
  end if;

  select * into v_me     from public.profiles where id = (select auth.uid());
  select * into v_author from public.profiles where id = v_post.author_id;

  -- Written BEFORE the delete, so the row cannot be lost to a failure between
  -- the two. No post text here: this ledger carries no message content, which
  -- is the rule it was built with and not one to bend for a convenient log
  -- line. The text lives in the report, where only leadership can read it.
  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary
  ) values (
    v_post.church_id, v_author.id, coalesce(v_author.full_name, 'A member'),
    coalesce(v_author.role::text, 'ds'),
    v_me.id, coalesce(v_me.full_name, 'Church leadership'), v_me.role::text,
    'guild_post_removed', 'review', 'A Guild Room post was removed by leadership.'
  );

  delete from public.guild_activity_posts where id = p_post;
  return true;
end;
$fn$;

create or replace function public.remove_guild_post(p_post uuid)
returns boolean
language sql
set search_path to public, private, pg_temp
as $$ select private.remove_guild_post(p_post); $$;

revoke all on function private.report_guild_post(uuid, text, text) from public, anon;
revoke all on function private.remove_guild_post(uuid) from public, anon;
revoke all on function public.report_guild_post(uuid, text, text) from public, anon;
revoke all on function public.remove_guild_post(uuid) from public, anon;
grant execute on function private.report_guild_post(uuid, text, text) to authenticated;
grant execute on function private.remove_guild_post(uuid) to authenticated;
grant execute on function public.report_guild_post(uuid, text, text) to authenticated;
grant execute on function public.remove_guild_post(uuid) to authenticated;

commit;
