-- A Director or an Executive Director can show a plan to the church's Guides.
--
-- Asked for on 13 November 2026.
--
-- A Guide could already show a plan to the people they walk with (audience
-- 'all', read through is_paired_with). A leader had no such door: their 'all'
-- reaches the whole church, Explorers included, and 'church' is the noticeboard.
-- This adds one audience, 'guides': read by the approved, unsuspended Guides of
-- the author's own church, and by its leaders, and by nobody else. Only a
-- leader's post opens to it; a Guide who picked it would reach no one new.
--
-- Nothing already published moves: every existing clause of can_read_post is
-- kept word for word, and the new one only ever ADDS readers to a post whose
-- audience is 'guides', which no post has until this is applied.

begin;

-- Its own transaction: a new enum value cannot be used in the one that adds
-- it. can_read_post compares the audience as text for exactly that reason.
alter type public.blog_audience_kind add value if not exists 'guides';

commit;

begin;

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
            -- A LEADER'S PLAN FOR THE GUIDES (13 November 2026): the Guides
            -- and leaders of the author's own church, approved and not
            -- suspended. An Explorer never reads it.
            or (
              b.audience::text = 'guides'
              and author.role in ('admin', 'executive')
              and b.church_id = public.my_church_id()
              and exists (
                select 1 from profiles me
                where me.id = (select auth.uid())
                  and me.role in ('dm', 'admin', 'executive')
                  and me.is_approved
                  and me.suspended_at is null
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

-- As before: only a signed-in member asks, and only through the feed and the
-- table's rules.
revoke all on function public.can_read_post(uuid) from public, anon;
grant execute on function public.can_read_post(uuid) to authenticated;

commit;
