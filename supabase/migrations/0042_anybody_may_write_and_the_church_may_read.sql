-- Blogs everyone can actually publish.
--
-- WHAT WAS WRONG. Writing was limited to Guides, Directors and Executive
-- Directors, so an Explorer who opened "Your blog", typed a post and pressed
-- publish got `new row violates row-level security policy for table
-- "blog_posts"`. The screen offered them something the database refused. That
-- is the worst shape a permission can take: not a locked door, a door drawn on
-- a wall.
--
-- And the only church-wide audience was a leader's. A post by anybody else
-- reached the people they walk with, which for an Explorer is one Guide. A blog
-- read by one person is a letter.
--
-- WHAT THIS CHANGES.
--
--   1. Any approved member of a church may write a post in their own church.
--   2. A new audience, `church`, means everyone in that church, whoever wrote
--      it. The old `all` keeps its old meaning exactly, so no existing post
--      changes who can see it.
--   3. Leaders may delete any post in their church.
--
-- (3) IS NOT OPTIONAL AND IS THE REASON (2) IS SAFE. A church-wide audience
-- open to every member is a megaphone, and a megaphone with no off switch is a
-- safeguarding problem waiting for a Sabbath morning. Deletion by leadership is
-- the minimum that makes an open noticeboard something a church can run. It
-- does not touch the author's own right to delete, and it is scoped by
-- `leads_church`, so a Director cannot reach into another congregation.

begin;

-- Postgres will not let a value added to an enum be USED in the same
-- transaction that adds it. `can_read_post` below compares the audience as
-- text for exactly that reason, so this stays one migration rather than two
-- that have to be applied in the right order by hand.
alter type public.blog_audience_kind add value if not exists 'church';

commit;

begin;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- Approval is the gate, not role. Somebody waiting for a Director to let them
-- in has no business on the church noticeboard; somebody who has been let in is
-- a member of the church, and members may speak.
--
-- The two pins stay: you write as yourself, and you write into your own church.
-- Both are enforced here rather than in the app, so a hand-made request cannot
-- post as somebody else or into a congregation it does not belong to.
drop policy if exists blog_write on public.blog_posts;
create policy blog_write on public.blog_posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and church_id = public.my_church_id()
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_approved
        and p.suspended_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Four ways a post reaches somebody, in the order they are worth checking:
--
--   * you wrote it (drafts included — that is what makes a draft a draft);
--   * it is addressed to the whole church and you are in that church;
--   * it is addressed to `all`, which still means "the people I walk with",
--     plus the leader-to-church rule migration 0036 added;
--   * you are named on it.
create or replace function public.can_read_post(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from blog_posts b
    join profiles author on author.id = b.author_id
    where b.id = p
      and (
        b.author_id = (select auth.uid())
        or (
          b.visibility = 'published'
          and (
            -- THE CHURCH NOTICEBOARD, open to any member who wrote it.
            -- Compared as text so this function can be created in the same
            -- migration that adds the enum value.
            (b.audience::text = 'church' and b.church_id = public.my_church_id())
            or (
              b.audience::text = 'all'
              and (
                -- A Guide's post: the people they walk with.
                public.is_paired_with(b.author_id)
                -- A leader's post: everybody in that leader's church. Kept
                -- exactly as it was, so nothing already published moves.
                or (author.role in ('admin', 'executive')
                    and b.church_id = public.my_church_id())
              )
            )
            or exists (
              select 1 from blog_audience a
              where a.post_id = b.id and a.ds_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- THE ACTUAL BUG BEHIND "why would it violate the RLS?"
-- ---------------------------------------------------------------------------
-- The write policy was never what refused the post. It was the READ policy, and
-- it refused on a row the writer had just created.
--
-- HOW. `createBlogPost` does `insert(...).select('id').single()` — a plain
-- INSERT ... RETURNING. Postgres applies the SELECT policy to the row RETURNING
-- hands back, and the SELECT policy called `can_read_post(id)`, which is STABLE
-- and queries `blog_posts` for that id. A STABLE function runs on the snapshot
-- the statement started with, and that snapshot predates the row. So the
-- function looked for the post, could not find it, returned false, and the
-- database refused to return to the author the row it had just accepted from
-- them. The message says (a bug report), which
-- reads exactly like a write refusal, which is why it was fixed as a write
-- problem twice and stayed broken both times.
--
-- Proven, not guessed: the same insert WITHOUT `returning` succeeded, and with
-- `with check (true)` on the write policy it still failed.
--
-- THE FIX is to answer the author's case from the row's own column instead of
-- a self-query. `author_id = auth.uid()` needs no lookup, so it is true for a
-- row that is not yet visible anywhere. It is also the faster path for the most
-- common read.
drop policy if exists blog_read on public.blog_posts;
create policy blog_read on public.blog_posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or public.can_read_post(id)
  );

-- ---------------------------------------------------------------------------
-- Taking something down
-- ---------------------------------------------------------------------------
drop policy if exists blog_drop on public.blog_posts;
create policy blog_drop on public.blog_posts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.leads_church(church_id)
  );

commit;

begin;

-- ---------------------------------------------------------------------------
-- The feed, with a name on every post.
-- ---------------------------------------------------------------------------
-- WHY AN RPC RATHER THAN A SELECT WITH A JOIN. The feed used to return
-- `author_id` and nothing else, and the screen was headed "From your Guide" —
-- correct while only a Guide could write, and a lie the moment anybody can. A
-- post on a church noticeboard has to carry who wrote it.
--
-- Reaching the name from the client means joining `profiles`, whose own
-- policies are written for a different question; a join that a policy quietly
-- empties gives a feed with every name missing and no error to explain it. This
-- is SECURITY DEFINER and returns exactly three things about the author: their
-- name, their role, and nothing else.
--
-- Access is still decided by `can_read_post`, the same function the SELECT
-- policy uses, so the RPC cannot show a post the table would have withheld.
create or replace function public.blog_feed(p_limit int default 100)
returns table (
  id           uuid,
  author_id    uuid,
  author_name  text,
  author_role  text,
  title        text,
  body         text,
  audience     text,
  created_at   timestamptz
)
language sql stable security definer set search_path to 'public' as $fn$
  select b.id,
         b.author_id,
         coalesce(author.full_name, 'Someone'),
         author.role::text,
         b.title,
         b.body,
         b.audience::text,
         b.created_at
  from public.blog_posts b
  join public.profiles author on author.id = b.author_id
  where b.visibility = 'published'
    and public.can_read_post(b.id)
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

revoke all on function public.blog_feed(int) from public, anon;
grant execute on function public.blog_feed(int) to authenticated;

commit;
