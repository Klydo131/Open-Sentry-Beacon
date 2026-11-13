-- A Guide's blog: written once, read by the people they walk with.
--
-- WHY THIS EXISTS ALONGSIDE MESSAGES. A conversation is one-to-one and expects
-- a reply. Some things a Guide wants to say are said once, to everybody, and
-- should sit where an Explorer can read them at midnight without owing an
-- answer by morning.
--
-- TWO SWITCHES, NOT ONE. `visibility` decides whether a post exists for anybody
-- but its author — a draft stays private until it is ready. `audience` decides
-- who receives it once published. A single "public" flag would have meant the
-- only way to take a post off the front page is to delete it, and a Guide
-- should be able to retire last month's note without destroying it.
--
-- NO POLICY HERE QUERIES A TABLE WHOSE OWN POLICY QUERIES BACK. Every
-- cross-table test goes through a SECURITY DEFINER helper. That is not a style
-- preference: a direct subquery between two RLS'd tables makes Postgres refuse
-- the read outright with "infinite recursion detected", and every affected
-- screen fails at once. It happened on the sibling deployment and cost a day.
--
-- PROVED AGAINST THE REAL DATABASE, with positive controls, because a refusal
-- only means something once you have shown the permitted case works:
--
--   author        sees all 3 of their posts incl. the draft   3   <- control
--   author        reader count on their published post        1   <- control
--   author        raw rows from blog_views                    0
--   paired DS     sees the post published to all              1   <- control
--   paired DS     sees the draft                              0
--   paired DS     sees a post addressed to someone else       0
--   paired DS     reader count on someone else's post         0
--   named DS      sees the post addressed to them             1   <- control
--   unpaired DS   sees anything at all                        0
--   anon          sees anything at all                        0
--   DS inserts a post                            refused 42501
--   DS inserts a post AS the Guide               refused 42501
--   DS publishes the Guide's draft               0 rows changed
--   DS deletes the Guide's post                  0 rows deleted
--   GUIDE inserts a post                         allowed        <- control
--
-- Two fixture bugs had to be fixed before any of that meant anything, and both
-- are the same mistake in different clothes. First, `insert ... on conflict do
-- nothing` silently did nothing, because handle_new_user had already created
-- the profiles with safe defaults — so every Explorer read zero and it looked
-- like perfect isolation. Second, the write tests reported four refusals AND a
-- failing control, because the temp table collecting the results was itself
-- being written while the session was still `authenticated`. Four passes beside
-- a broken control are four passes that prove nothing.

begin;

create type blog_visibility as enum ('private', 'published');
create type blog_audience_kind as enum ('all', 'selected');

create table if not exists public.blog_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  church_id  uuid not null references public.churches (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 200),
  body       text not null check (length(btrim(body)) between 1 and 20000),
  visibility blog_visibility    not null default 'private',
  audience   blog_audience_kind not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Named recipients, only meaningful when audience = 'selected'.
create table if not exists public.blog_audience (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  ds_id   uuid not null references public.profiles (id) on delete cascade,
  unique (post_id, ds_id)
);

-- One row per PERSON per post, enforced by the unique index rather than by
-- application code. A counter that climbs every time somebody scrolls past
-- tells the writer nothing about whether anyone read it.
create table if not exists public.blog_views (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.blog_posts (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, viewer_id)
);

create index if not exists blog_posts_author_idx on public.blog_posts (author_id, created_at desc);
create index if not exists blog_posts_church_idx on public.blog_posts (church_id);
create index if not exists blog_views_post_idx   on public.blog_views (post_id);

alter table public.blog_posts    enable row level security;
alter table public.blog_audience enable row level security;
alter table public.blog_views    enable row level security;

-- May the caller read this post? Definer, so the checks inside do not re-enter
-- the policies of the tables they touch.
create or replace function public.can_read_post(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from blog_posts b
    where b.id = p
      and (
        b.author_id = auth.uid()
        or (
          b.visibility = 'published'
          and public.is_paired_with(b.author_id)
          and (
            b.audience = 'all'
            or exists (
              select 1 from blog_audience a
              where a.post_id = b.id and a.ds_id = auth.uid()
            )
          )
        )
      )
  );
$$;

-- The reader count. A number, never a list of names.
--
-- The Guide is shown how many people opened a post and never which. That
-- restraint matches the rest of the product: an Explorer is not shown their own
-- journey stage, for the same reason. Somebody exploring faith should be able
-- to read quietly without being watched doing it. Returning rows from
-- blog_views would put the names one network-tab glance away.
create or replace function public.blog_reader_count(p uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select case
    when exists (select 1 from blog_posts b where b.id = p and b.author_id = auth.uid())
      then (select count(*)::int from blog_views v where v.post_id = p)
    else 0
  end;
$$;

-- Record that the caller read a post. Silently does nothing if they may not
-- read it, if it is their own, or if they have read it before.
create or replace function public.record_blog_view(p uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.can_read_post(p) then return; end if;
  if exists (select 1 from blog_posts b where b.id = p and b.author_id = auth.uid()) then return; end if;
  insert into blog_views (post_id, viewer_id) values (p, auth.uid())
  on conflict (post_id, viewer_id) do nothing;
end;
$$;

-- The author's own posts with their counts, in one round trip. Without this the
-- client asks for posts then calls the count once per post — an N+1 that grows
-- with how much a Guide writes, which is the wrong thing to punish.
create or replace function public.my_blog_posts()
returns table (
  id uuid, title text, body text,
  visibility blog_visibility, audience blog_audience_kind,
  created_at timestamptz, updated_at timestamptz,
  reader_count integer, audience_ids uuid[]
)
language sql stable security definer set search_path to 'public' as $$
  select b.id, b.title, b.body, b.visibility, b.audience,
         b.created_at, b.updated_at,
         (select count(*)::int from blog_views v where v.post_id = b.id),
         coalesce((select array_agg(a.ds_id) from blog_audience a where a.post_id = b.id), '{}')
  from blog_posts b
  where b.author_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.can_read_post(uuid)      from anon;
revoke all on function public.blog_reader_count(uuid)  from anon;
revoke all on function public.record_blog_view(uuid)   from anon;
revoke all on function public.my_blog_posts()          from anon;
grant execute on function public.can_read_post(uuid)     to authenticated;
grant execute on function public.blog_reader_count(uuid) to authenticated;
grant execute on function public.record_blog_view(uuid)  to authenticated;
grant execute on function public.my_blog_posts()         to authenticated;

drop policy if exists blog_read  on public.blog_posts;
drop policy if exists blog_write on public.blog_posts;
drop policy if exists blog_edit  on public.blog_posts;
drop policy if exists blog_drop  on public.blog_posts;

create policy blog_read on public.blog_posts
  for select to authenticated using (public.can_read_post(id));

-- Only a Guide writes, only as themselves, only into their own church. Every
-- value that grants anything is checked against the caller rather than taken
-- from the request.
create policy blog_write on public.blog_posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.auth_role() = 'dm'
    and church_id = public.my_church_id()
  );

create policy blog_edit on public.blog_posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and church_id = public.my_church_id());

create policy blog_drop on public.blog_posts
  for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists blog_aud_read  on public.blog_audience;
drop policy if exists blog_aud_write on public.blog_audience;
drop policy if exists blog_aud_drop  on public.blog_audience;

-- Only the author sees or edits who a post was addressed to. An Explorer
-- reading this table would learn who else their Guide is walking with.
create policy blog_aud_read on public.blog_audience
  for select to authenticated
  using (exists (select 1 from public.blog_posts b where b.id = post_id and b.author_id = (select auth.uid())));

create policy blog_aud_write on public.blog_audience
  for insert to authenticated
  with check (exists (select 1 from public.blog_posts b where b.id = post_id and b.author_id = (select auth.uid())));

create policy blog_aud_drop on public.blog_audience
  for delete to authenticated
  using (exists (select 1 from public.blog_posts b where b.id = post_id and b.author_id = (select auth.uid())));

-- blog_views deliberately has NO policies at all, for anybody, including the
-- author. The count comes from a definer function; the rows never leave the
-- database. An RLS'd table with no policies is readable by nobody, which is
-- exactly the intent.

commit;
