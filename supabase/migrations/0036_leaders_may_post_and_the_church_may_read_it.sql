-- THE BLOG REFUSED EVERY POST BY A DIRECTOR OR AN EXECUTIVE DIRECTOR.
--
-- blog_write required auth_role() = 'dm'. A Guide could write; the people who
-- run the church could not, and what they got was a row level security
-- violation with no explanation. The Executive Director hit it on their own app.
--
-- The read side had the matching hole. can_read_post required
-- is_paired_with(author), which is right for a Guide writing to the people they
-- walk with and wrong for a Director: a Director has no pairings, so a post by
-- one was readable by nobody at all. Fixing only the write would have produced
-- posts that saved and then vanished, which is worse than the refusal.
--
-- So both halves move together: a GUIDE writes to the people paired with them,
-- a DIRECTOR or EXECUTIVE writes to the whole church.

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
            b.audience = 'all'
            and (
              public.is_paired_with(b.author_id)
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
  );
$$;

drop policy if exists blog_write on public.blog_posts;

-- Still pinned to the caller: author_id and church_id are checked against who
-- is asking rather than taken from the request.
create policy blog_write on public.blog_posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.auth_role() in ('dm', 'admin', 'executive')
    and church_id = public.my_church_id()
  );
