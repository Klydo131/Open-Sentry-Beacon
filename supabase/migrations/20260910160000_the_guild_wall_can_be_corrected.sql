-- The Guild wall can be corrected, and taking a post down stops destroying it.
--
-- ---------------------------------------------------------------------------
-- THE THIRD ROOM, AND THE ONLY ONE WHERE THE NOTE MUST NOT NAME ANYBODY.
-- ---------------------------------------------------------------------------
--
-- Asked for: edit on the Guild wall too. It is the last of the three rooms
-- without it -- a post could be amen'd, reported, deleted by its author or
-- removed by leadership, and a typo in it stood for good.
--
-- WHY DELETING CHANGES HERE TOO, AND WHY THAT IS NOT SCOPE CREEP. Both existing
-- deletes are real `delete from`s, and `guild_activity_revisions` below hangs
-- off the post with `on delete cascade`. Ship edit alone and the first delete
-- destroys the edit history with the post -- the record the feature exists to
-- create. Editing and a destructive delete cannot both be right in the same
-- room, so the delete becomes soft, exactly as it did in the other two rooms.
--
-- THE HARD PART IS THE NOTE. This wall is PSEUDONYMOUS:
-- `private.list_guild_activity` never returns `author_id`, only a label -- You,
-- A Guide, A fellow Explorer. A deletion note naming the author would undo
-- that in one line, and it would be the most tempting line to write, because
-- both other rooms name the person. So the note is built from THE SAME LABEL
-- the feed already computes, and reveals nothing the wall did not already say.
--
-- Leadership removal says so without naming the leader: a Director is not a
-- member of this room, and "removed by church leadership" is the honest
-- description of what happened.

alter table public.guild_activity_posts
  add column if not exists edited_at   timestamptz,
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.profiles (id),
  -- Whether the remover was leadership rather than the author. Kept as a flag
  -- rather than worked out from `deleted_by` at read time, because working it
  -- out means reading the remover's role, and this is the one table whose read
  -- path must not start looking people up.
  add column if not exists removed_by_leader boolean not null default false;

alter table public.guild_activity_posts drop constraint if exists guild_activity_posts_body_check;
alter table public.guild_activity_posts add constraint guild_activity_posts_body_check
  check (
    (deleted_at is null     and length(btrim(body)) between 1 and 1000)
    or
    (deleted_at is not null and length(body) = 0)
  );

-- ---------------------------------------------------------------------------
-- WHAT WAS SAID
-- ---------------------------------------------------------------------------

create table if not exists public.guild_activity_revisions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.guild_activity_posts (id) on delete cascade,
  guild_id    uuid not null references public.guilds (id) on delete cascade,
  church_id   uuid not null references public.churches (id) on delete cascade,
  author_id   uuid not null references public.profiles (id),
  changed_by  uuid references public.profiles (id),
  body        text not null,
  reason      text not null check (reason in ('edited', 'deleted')),
  recorded_at timestamptz not null default now()
);

create index if not exists guild_activity_revisions_post_idx
  on public.guild_activity_revisions (post_id, recorded_at desc);
create index if not exists guild_activity_revisions_church_idx
  on public.guild_activity_revisions (church_id, recorded_at desc);

comment on table public.guild_activity_revisions is
  'What a Guild wall post said before it was edited or taken down. RLS on with '
  'no policy and no grant: unreadable from a browser by anybody. It holds '
  'author_id, which the wall itself never discloses, so this table is more '
  'sensitive than the room it describes.';

alter table public.guild_activity_revisions enable row level security;
revoke all on public.guild_activity_revisions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- EDIT: THE AUTHOR ONLY
-- ---------------------------------------------------------------------------

create or replace function private.edit_guild_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_post public.guild_activity_posts%rowtype;
  v_new  text := btrim(coalesce(p_body, ''));
begin
  select * into v_post from public.guild_activity_posts where id = p_post;
  if v_post.id is null then
    raise exception 'That post no longer exists.';
  end if;
  if v_post.author_id <> (select auth.uid()) then
    raise exception 'You can only change your own posts.' using errcode = '42501';
  end if;
  -- Still a member. Somebody removed from a guild does not keep editing rights
  -- to what they left behind.
  if not private.active_guild_member(v_post.guild_id) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;
  if v_post.deleted_at is not null then
    raise exception 'That post was taken down.';
  end if;
  if length(v_new) not between 1 and 1000 then
    raise exception 'Write between 1 and 1000 characters.';
  end if;
  if v_new = v_post.body then
    return;
  end if;

  insert into public.guild_activity_revisions
    (post_id, guild_id, church_id, author_id, changed_by, body, reason)
  values (v_post.id, v_post.guild_id, v_post.church_id, v_post.author_id,
          (select auth.uid()), v_post.body, 'edited');

  update public.guild_activity_posts
     set body = v_new, edited_at = now()
   where id = v_post.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- THE TWO DELETES, NOW SOFT
-- ---------------------------------------------------------------------------

create or replace function private.delete_my_guild_post(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_post public.guild_activity_posts%rowtype;
begin
  select * into v_post from public.guild_activity_posts
   where id = p_post and author_id = (select auth.uid());
  if v_post.id is null then
    return false;
  end if;
  if v_post.deleted_at is not null then
    return true;
  end if;

  insert into public.guild_activity_revisions
    (post_id, guild_id, church_id, author_id, changed_by, body, reason)
  values (v_post.id, v_post.guild_id, v_post.church_id, v_post.author_id,
          (select auth.uid()), v_post.body, 'deleted');

  update public.guild_activity_posts
     set body = '', deleted_at = now(), deleted_by = (select auth.uid()),
         removed_by_leader = false
   where id = v_post.id;
  return true;
end;
$$;

create or replace function private.remove_guild_post(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_post   public.guild_activity_posts%rowtype;
  v_author public.profiles%rowtype;
  v_me     public.profiles%rowtype;
begin
  select * into v_post from public.guild_activity_posts where id = p_post;
  if v_post.id is null then
    return false;
  end if;
  if not public.leads_church(v_post.church_id) then
    raise exception 'Only church leadership may remove a guild post.' using errcode = '42501';
  end if;
  if v_post.deleted_at is not null then
    return true;
  end if;

  select * into v_me     from public.profiles where id = (select auth.uid());
  select * into v_author from public.profiles where id = v_post.author_id;

  insert into public.security_audit_events (
    church_id, subject_id, subject_name, subject_role,
    actor_id, actor_name, actor_role, event_type, severity, summary
  ) values (
    v_post.church_id, v_author.id, coalesce(v_author.full_name, 'A member'),
    coalesce(v_author.role::text, 'ds'),
    v_me.id, coalesce(v_me.full_name, 'Church leadership'), v_me.role::text,
    'guild_post_removed', 'review', 'A Guild Room post was removed by leadership.'
  );

  -- THE WORDS ARE KEPT NOW. The audit event has always recorded that leadership
  -- removed a post; it has never recorded WHAT WAS REMOVED, so a question asked
  -- afterwards could be answered with "a post" and nothing more.
  insert into public.guild_activity_revisions
    (post_id, guild_id, church_id, author_id, changed_by, body, reason)
  values (v_post.id, v_post.guild_id, v_post.church_id, v_post.author_id,
          (select auth.uid()), v_post.body, 'deleted');

  update public.guild_activity_posts
     set body = '', deleted_at = now(), deleted_by = (select auth.uid()),
         removed_by_leader = true
   where id = v_post.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- AN AMEN, AND A REPORT, ON A POST THAT IS GONE
-- ---------------------------------------------------------------------------

create or replace function private.toggle_guild_amen(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  post_guild uuid;
  post_gone  timestamptz;
begin
  select guild_id, deleted_at into post_guild, post_gone
    from public.guild_activity_posts where id = p_post;
  if post_guild is null or not private.active_guild_member(post_guild) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;
  -- NEW: there is nothing left to agree with.
  if post_gone is not null then
    raise exception 'That post was taken down.';
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
$$;

-- REPORTING SOMETHING ALREADY TAKEN DOWN. The report copies the post's words so
-- that deleting afterwards cannot empty it -- but the row's words are now blank
-- the moment it is taken down, so a report raised after that would have carried
-- nothing. It reads the kept copy instead.
create or replace function private.report_guild_post(p_post uuid, p_reason text, p_detail text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_me     public.profiles%rowtype;
  v_post   public.guild_activity_posts%rowtype;
  v_author public.profiles%rowtype;
  v_words  text;
  v_id     uuid;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'You need an approved account to report a post.' using errcode = '42501';
  end if;

  select * into v_post from public.guild_activity_posts where id = p_post;
  if v_post.id is null or not private.active_guild_member(v_post.guild_id) then
    raise exception 'That activity is not in one of your guilds.' using errcode = '42501';
  end if;
  if v_post.author_id = v_me.id then
    raise exception 'You can delete your own post instead of reporting it.';
  end if;
  if p_reason not in ('inappropriate', 'harassment', 'unsafe', 'spam', 'other') then
    raise exception 'Unknown reason.';
  end if;

  v_words := v_post.body;
  if v_post.deleted_at is not null then
    select r.body into v_words from public.guild_activity_revisions r
     where r.post_id = v_post.id and r.reason = 'deleted'
     order by r.recorded_at desc limit 1;
  end if;

  select * into v_author from public.profiles where id = v_post.author_id;

  insert into public.reports
    (church_id, reporter_id, subject_id, reason, detail, guild_post_id, guild_post_body)
  values
    (v_post.church_id, v_me.id, v_post.author_id, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), v_post.id, coalesce(v_words, ''))
  returning id into v_id;

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
$$;

-- ---------------------------------------------------------------------------
-- THE FEED, WHICH MUST SAY A POST IS GONE WITHOUT SAYING WHOSE IT WAS
-- ---------------------------------------------------------------------------

drop function if exists public.list_guild_activity(uuid, integer);
drop function if exists private.list_guild_activity(uuid, integer);

create or replace function private.list_guild_activity(p_guild uuid, p_limit integer default 100)
returns table (
  id uuid, kind text, body text, author_label text, is_mine boolean,
  amen_count bigint, i_amen boolean, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz, removed_by_leader boolean
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
    -- THE SAME LABEL AS ALWAYS, and it is also what the deletion note is built
    -- from on the screen. Nothing here reveals more about a taken-down post
    -- than the wall already revealed about a live one.
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
    post.created_at,
    post.edited_at,
    post.deleted_at,
    post.removed_by_leader
  from public.guild_activity_posts post
  join public.profiles author on author.id = post.author_id
  where post.guild_id = p_guild
  order by post.created_at desc
  limit row_limit;
end;
$$;

create or replace function public.list_guild_activity(p_guild uuid, p_limit integer default 100)
returns table (
  id uuid, kind text, body text, author_label text, is_mine boolean,
  amen_count bigint, i_amen boolean, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz, removed_by_leader boolean
)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select * from private.list_guild_activity(p_guild, p_limit); $$;

create or replace function public.edit_guild_post(p_post uuid, p_body text)
returns void language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select private.edit_guild_post(p_post, p_body); $$;

create or replace function private.guild_history_for_leader(p_church uuid)
returns table (
  post_id uuid, author_id uuid, changed_by uuid,
  body text, reason text, recorded_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.leads_church(p_church) then
    raise exception 'Only church leadership may read the wall history.'
      using errcode = '42501';
  end if;
  return query
  select r.post_id, r.author_id, r.changed_by, r.body, r.reason, r.recorded_at
  from public.guild_activity_revisions r
  where r.church_id = p_church
  order by r.recorded_at desc;
end;
$$;

create or replace function public.guild_history_for_leader(p_church uuid)
returns table (
  post_id uuid, author_id uuid, changed_by uuid,
  body text, reason text, recorded_at timestamptz)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$ select * from private.guild_history_for_leader(p_church); $$;

revoke all on function public.list_guild_activity(uuid, integer) from public, anon;
revoke all on function public.edit_guild_post(uuid, text)        from public, anon;
revoke all on function public.guild_history_for_leader(uuid)     from public, anon;
grant execute on function public.list_guild_activity(uuid, integer) to authenticated;
grant execute on function public.edit_guild_post(uuid, text)        to authenticated;
grant execute on function public.guild_history_for_leader(uuid)     to authenticated;
