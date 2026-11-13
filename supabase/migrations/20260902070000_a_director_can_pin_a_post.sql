-- A Director can pin a post to the top of the church's writing.
--
-- WHY. The feed is newest-first, which is right for a conversation and wrong
-- for the one post a church wants every new person to read. A welcome written
-- today is the first thing an Explorer joining tomorrow sees, and the fortieth
-- thing an Explorer joining in a month sees. Pinning is how the church says
-- "start here" without having to repost it every week.
--
-- WHY IT IS A FUNCTION AND NOT AN UPDATE. `blog_edit` lets an author change
-- their own post and nobody else's, which is correct and is exactly what makes
-- pinning impossible through it: the point is that a DIRECTOR decides what the
-- church leads with, including on a post a Guide wrote. Widening blog_edit to
-- let leadership update any post would also let them rewrite its words, which
-- is a different and much larger power than choosing the order. So the function
-- touches one column and refuses everything else by construction.
--
-- A DRAFT CANNOT BE PINNED. Pinning one would put a post nobody can read at the
-- top of a list, which reads as an empty space at best and as a broken feed at
-- worst.

alter table public.blog_posts add column if not exists pinned_at timestamptz;

comment on column public.blog_posts.pinned_at is
  'Set by a Director or Executive Director to hold this post at the top of the church feed. Null means it sits in date order like everything else.';

create index if not exists blog_posts_pinned on public.blog_posts (church_id, pinned_at desc nulls last);

/**
 * Pin or unpin a post. Leadership of that post's church only.
 */
create or replace function private.set_post_pinned(p_post uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_post public.blog_posts%rowtype;
  v_me   public.profiles%rowtype;
begin
  select * into v_me from public.profiles where id = (select auth.uid());
  if v_me.id is null or not v_me.is_approved then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into v_post from public.blog_posts where id = p_post;
  if v_post.id is null then
    raise exception 'That post does not exist.' using errcode = '42501';
  end if;

  -- The church is taken from the POST, not from an argument, and compared with
  -- the caller's own. A Director of one church cannot arrange another's feed.
  if v_me.role not in ('admin', 'executive') or v_me.church_id is distinct from v_post.church_id then
    raise exception 'Only a Director can pin a post.' using errcode = '42501';
  end if;

  if p_pinned and v_post.visibility::text <> 'published' then
    raise exception 'A draft cannot be pinned. Publish it first.' using errcode = '42501';
  end if;

  update public.blog_posts
     set pinned_at = case when p_pinned then now() else null end
   where id = p_post;
end;
$fn$;

create or replace function public.set_post_pinned(p_post uuid, p_pinned boolean)
returns void
language sql
security definer
set search_path to public, pg_temp
as $$ select private.set_post_pinned(p_post, p_pinned) $$;

revoke all on function private.set_post_pinned(uuid, boolean) from public, anon;
revoke all on function public.set_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;

-- DROPPED AND RECREATED, not `create or replace`: the row this returns gains a
-- `pinned` column, and Postgres refuses to change a function's OUT parameters
-- in place. The grant goes back on explicitly afterwards, because a dropped
-- function takes its grants with it and a feed nobody may execute is a blank
-- church page.
drop function if exists public.blog_feed(integer);

-- The feed, with pinned posts held at the top. Everything else about it is
-- unchanged: same visibility rule, same per-reader `can_read_post`, so pinning
-- changes the ORDER and never who can see something.
create or replace function public.blog_feed(p_limit integer default 100)
returns table(
  id uuid, author_id uuid, author_name text, author_role text,
  title text, body text, audience text, created_at timestamptz, pinned boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id,
         b.author_id,
         coalesce(author.full_name, 'Someone'),
         author.role::text,
         b.title,
         b.body,
         b.audience::text,
         b.created_at,
         b.pinned_at is not null
  from public.blog_posts b
  join public.profiles author on author.id = b.author_id
  where b.visibility = 'published'
    and public.can_read_post(b.id)
  order by b.pinned_at desc nulls last, b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.blog_feed(integer) from public, anon;
grant execute on function public.blog_feed(integer) to authenticated;
