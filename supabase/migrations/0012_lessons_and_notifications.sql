-- Lessons and notifications, matching the reference deployment's shapes.
--
-- A notification belongs to exactly one person, and the table has NO insert
-- policy at all. They are written by notify_user(), which is SECURITY DEFINER
-- and refuses unless both people are in the same church. A client that could
-- insert here directly could make the app say anything to anybody, in the app's
-- own voice — which is a more convincing lie than most phishing.

create table if not exists public.lessons (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 200),
  body       text not null default '',
  series_id  uuid references public.lesson_series (id) on delete set null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lessons_series_idx on public.lessons (series_id, position);
create index if not exists lessons_church_idx on public.lessons (church_id);
create index if not exists notif_user_idx     on public.notifications (user_id, created_at desc);

alter table public.lessons       enable row level security;
alter table public.notifications enable row level security;

drop policy if exists lessons_read on public.lessons;
drop policy if exists lessons_write on public.lessons;
create policy lessons_read on public.lessons for select to authenticated
  using (church_id = public.my_church_id());
create policy lessons_write on public.lessons for all to authenticated
  using (public.manages_church(church_id)) with check (public.manages_church(church_id));

drop policy if exists notif_own on public.notifications;
drop policy if exists notif_mark on public.notifications;
create policy notif_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notif_mark on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.notify_user(
  p_user uuid, p_type text, p_title text, p_body text default ''
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (
    select 1 from profiles t, profiles me
    where t.id = p_user and me.id = auth.uid() and t.church_id = me.church_id
  ) then
    return;
  end if;
  insert into notifications (user_id, type, title, body)
  values (p_user, p_type, p_title, coalesce(p_body, ''));
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prorettype='trigger'::regtype
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;
