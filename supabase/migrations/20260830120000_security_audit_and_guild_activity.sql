-- Security audit rooms and member-facing Guild activity.
--
-- Audit events deliberately contain no message or file content. Directors see
-- activity about Guides and Explorers in churches they lead; Executive
-- Directors additionally see activity about Directors. Guild activity is
-- shared on purpose, but never exposes an Explorer roster or another
-- Explorer's profile identifier.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Security audit ledger
-- ---------------------------------------------------------------------------

create table if not exists public.security_audit_events (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  subject_id   uuid references public.profiles(id) on delete set null,
  subject_name text not null,
  subject_role text not null check (subject_role in ('dm', 'ds', 'admin', 'executive')),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text not null,
  actor_role   text check (actor_role is null or actor_role in ('dm', 'ds', 'admin', 'executive')),
  event_type   text not null check (event_type in (
    'profile_change', 'identity_change', 'safeguarding_report',
    'account_suspended', 'account_restored', 'account_removed',
    'approval_changed'
  )),
  severity     text not null check (severity in ('info', 'review', 'urgent')),
  summary      text not null,
  occurred_at  timestamptz not null default now()
);

create index if not exists security_audit_events_church_time_idx
  on public.security_audit_events (church_id, occurred_at desc);

alter table public.security_audit_events enable row level security;
revoke all on table public.security_audit_events from public, anon, authenticated;

create or replace function private.capture_profile_change_for_audit()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  subject public.profiles%rowtype;
  actor   public.profiles%rowtype;
  event_kind text;
  event_severity text;
  event_summary text;
begin
  select * into subject from public.profiles where id = new.profile_id;
  if subject.id is null
    or subject.church_id is null
    or subject.role::text not in ('dm', 'ds', 'admin') then
    return new;
  end if;

  select * into actor from public.profiles where id = (select auth.uid());

  event_kind := case when new.field = 'full_name' then 'identity_change' else 'profile_change' end;
  event_severity := case when new.field = 'full_name' then 'review' else 'info' end;
  event_summary := case new.field
    when 'full_name' then 'Roster name was changed.'
    when 'preferred_contact' then 'Contact detail was changed.'
    when 'preferred_language' then 'Preferred language was changed.'
    when 'birthday' then 'Birthday was changed.'
    when 'gender' then 'Gender detail was changed.'
    when 'life_status' then 'Life-status detail was changed.'
    when 'city_of_residence' then 'City detail was changed.'
    when 'work_industry' then 'Work detail was changed.'
    else 'Profile detail was changed.'
  end;

  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary, occurred_at
  ) values (
    subject.church_id, subject.id, coalesce(subject.full_name, 'A member'), subject.role::text,
    actor.id, coalesce(actor.full_name, 'System'), actor.role::text,
    event_kind, event_severity, event_summary, new.changed_at
  );
  return new;
end;
$fn$;

drop trigger if exists profile_changes_security_audit on public.profile_changes;
create trigger profile_changes_security_audit
  after insert on public.profile_changes
  for each row execute function private.capture_profile_change_for_audit();

create or replace function private.capture_report_for_audit()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  subject public.profiles%rowtype;
  actor   public.profiles%rowtype;
begin
  select * into subject from public.profiles where id = new.subject_id;
  if subject.id is null or subject.role::text not in ('dm', 'ds', 'admin') then
    return new;
  end if;
  select * into actor from public.profiles where id = new.reporter_id;

  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary, occurred_at
  ) values (
    new.church_id, subject.id, coalesce(subject.full_name, 'A member'), subject.role::text,
    actor.id, coalesce(actor.full_name, 'A member'), actor.role::text,
    'safeguarding_report',
    case when new.reason in ('harassment', 'unsafe') then 'urgent' else 'review' end,
    'A safeguarding report was raised.', new.created_at
  );
  return new;
end;
$fn$;

drop trigger if exists reports_security_audit on public.reports;
create trigger reports_security_audit
  after insert on public.reports
  for each row execute function private.capture_report_for_audit();

create or replace function private.capture_discipline_for_audit()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  event_kind text;
  event_severity text;
  event_summary text;
  actor_role text;
begin
  if new.person_role not in ('dm', 'ds', 'admin') then
    return new;
  end if;

  event_kind := case new.action
    when 'suspended' then 'account_suspended'
    when 'released' then 'account_restored'
    when 'removed' then 'account_removed'
    else 'approval_changed'
  end;
  event_severity := case new.action
    when 'removed' then 'urgent'
    when 'suspended' then 'review'
    when 'disapproved' then 'review'
    else 'info'
  end;
  event_summary := case new.action
    when 'suspended' then 'Account was suspended.'
    when 'released' then 'Account suspension was lifted.'
    when 'removed' then 'Account was removed from the church.'
    when 'approved' then 'Account was approved after human review.'
    when 'disapproved' then 'Account approval was revoked.'
    else 'Account status changed.'
  end;
  select role::text into actor_role from public.profiles where id = new.by_id;

  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary, occurred_at
  ) values (
    new.church_id, new.person_id, new.person_name, new.person_role,
    new.by_id, new.by_name, actor_role, event_kind, event_severity, event_summary, new.at
  );
  return new;
end;
$fn$;

drop trigger if exists discipline_log_security_audit on public.discipline_log;
create trigger discipline_log_security_audit
  after insert on public.discipline_log
  for each row execute function private.capture_discipline_for_audit();

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

create or replace function public.security_audit_feed(p_limit integer default 100)
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
language sql
set search_path to public, private, pg_temp
as $$ select * from private.security_audit_feed(p_limit); $$;

-- ---------------------------------------------------------------------------
-- Guild activity, without publishing an Explorer roster
-- ---------------------------------------------------------------------------

create table if not exists public.guild_activity_posts (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references public.guilds(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('encouragement', 'study', 'prayer', 'care')),
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists guild_activity_posts_guild_time_idx
  on public.guild_activity_posts (guild_id, created_at desc);

create table if not exists public.guild_activity_amens (
  post_id    uuid not null references public.guild_activity_posts(id) on delete cascade,
  person_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, person_id)
);

create index if not exists guild_activity_amens_post_idx
  on public.guild_activity_amens (post_id);

alter table public.guild_activity_posts enable row level security;
alter table public.guild_activity_amens enable row level security;
revoke all on table public.guild_activity_posts from public, anon, authenticated;
revoke all on table public.guild_activity_amens from public, anon, authenticated;

create or replace function private.active_guild_member(p_guild uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1
    from public.guild_members membership
    join public.profiles me on me.id = membership.person_id
    where membership.guild_id = p_guild
      and me.id = (select auth.uid())
      and me.role in ('dm', 'ds')
      and me.is_approved
      and me.suspended_at is null
  );
$$;

create or replace function private.list_guild_activity(p_guild uuid, p_limit integer default 100)
returns table (
  id uuid,
  kind text,
  body text,
  author_label text,
  is_mine boolean,
  amen_count bigint,
  i_amen boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  row_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  if not private.active_guild_member(p_guild) then
    raise exception 'You are not a member of this guild.' using errcode = '42501';
  end if;

  return query
  select
    post.id,
    post.kind,
    post.body,
    case
      when post.author_id = (select auth.uid()) then 'You'
      when author.role = 'dm' then 'A Guide'
      else 'A fellow Explorer'
    end,
    post.author_id = (select auth.uid()),
    (select count(*) from public.guild_activity_amens amen where amen.post_id = post.id),
    exists (
      select 1 from public.guild_activity_amens amen
      where amen.post_id = post.id and amen.person_id = (select auth.uid())
    ),
    post.created_at
  from public.guild_activity_posts post
  join public.profiles author on author.id = post.author_id
  where post.guild_id = p_guild
  order by post.created_at desc
  limit row_limit;
end;
$fn$;

create or replace function private.post_to_guild(p_guild uuid, p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  guild public.guilds%rowtype;
  post_id uuid;
begin
  if not private.active_guild_member(p_guild) then
    raise exception 'You are not a member of this guild.' using errcode = '42501';
  end if;
  if p_kind not in ('encouragement', 'study', 'prayer', 'care') then
    raise exception 'Choose a kind of activity.';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Write between 1 and 1000 characters.';
  end if;

  select * into guild from public.guilds where id = p_guild;
  if guild.id is null then
    raise exception 'That guild no longer exists.';
  end if;
  insert into public.guild_activity_posts (guild_id, church_id, author_id, kind, body)
  values (guild.id, guild.church_id, (select auth.uid()), p_kind, btrim(p_body))
  returning id into post_id;
  return post_id;
end;
$fn$;

create or replace function private.toggle_guild_amen(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  post_guild uuid;
begin
  select guild_id into post_guild from public.guild_activity_posts where id = p_post;
  if post_guild is null or not private.active_guild_member(post_guild) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.guild_activity_amens
    where post_id = p_post and person_id = (select auth.uid())
  ) then
    delete from public.guild_activity_amens
    where post_id = p_post and person_id = (select auth.uid());
    return false;
  end if;

  insert into public.guild_activity_amens (post_id, person_id)
  values (p_post, (select auth.uid()));
  return true;
end;
$fn$;

create or replace function private.delete_my_guild_post(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  delete from public.guild_activity_posts
  where id = p_post and author_id = (select auth.uid());
  return found;
end;
$fn$;

create or replace function public.list_guild_activity(p_guild uuid, p_limit integer default 100)
returns table (
  id uuid,
  kind text,
  body text,
  author_label text,
  is_mine boolean,
  amen_count bigint,
  i_amen boolean,
  created_at timestamptz
)
language sql
set search_path to public, private, pg_temp
as $$ select * from private.list_guild_activity(p_guild, p_limit); $$;

create or replace function public.post_to_guild(p_guild uuid, p_kind text, p_body text)
returns uuid
language sql
set search_path to public, private, pg_temp
as $$ select private.post_to_guild(p_guild, p_kind, p_body); $$;

create or replace function public.toggle_guild_amen(p_post uuid)
returns boolean
language sql
set search_path to public, private, pg_temp
as $$ select private.toggle_guild_amen(p_post); $$;

create or replace function public.delete_my_guild_post(p_post uuid)
returns boolean
language sql
set search_path to public, private, pg_temp
as $$ select private.delete_my_guild_post(p_post); $$;

revoke all on function private.capture_profile_change_for_audit() from public, anon, authenticated;
revoke all on function private.capture_report_for_audit() from public, anon, authenticated;
revoke all on function private.capture_discipline_for_audit() from public, anon, authenticated;
revoke all on function private.active_guild_member(uuid) from public, anon;
revoke all on function private.security_audit_feed(integer) from public, anon;
revoke all on function private.list_guild_activity(uuid, integer) from public, anon;
revoke all on function private.post_to_guild(uuid, text, text) from public, anon;
revoke all on function private.toggle_guild_amen(uuid) from public, anon;
revoke all on function private.delete_my_guild_post(uuid) from public, anon;
grant execute on function private.active_guild_member(uuid) to authenticated;
grant execute on function private.security_audit_feed(integer) to authenticated;
grant execute on function private.list_guild_activity(uuid, integer) to authenticated;
grant execute on function private.post_to_guild(uuid, text, text) to authenticated;
grant execute on function private.toggle_guild_amen(uuid) to authenticated;
grant execute on function private.delete_my_guild_post(uuid) to authenticated;

revoke all on function public.security_audit_feed(integer) from public, anon;
revoke all on function public.list_guild_activity(uuid, integer) from public, anon;
revoke all on function public.post_to_guild(uuid, text, text) from public, anon;
revoke all on function public.toggle_guild_amen(uuid) from public, anon;
revoke all on function public.delete_my_guild_post(uuid) from public, anon;
grant execute on function public.security_audit_feed(integer) to authenticated;
grant execute on function public.list_guild_activity(uuid, integer) to authenticated;
grant execute on function public.post_to_guild(uuid, text, text) to authenticated;
grant execute on function public.toggle_guild_amen(uuid) to authenticated;
grant execute on function public.delete_my_guild_post(uuid) to authenticated;

commit;
