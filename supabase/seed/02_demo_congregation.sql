-- A church with people in it, so a new install has something to show.
--
-- WHY THIS EXISTS. A correctly installed Hope Beacon is indistinguishable from
-- a broken one until somebody is in it: you sign in as the Director, the app
-- works perfectly, and every screen is empty. That is not a bug and it is a
-- terrible first five minutes. This puts a small congregation in — two Guides,
-- three Explorers, conversations, a blog post, prayer, a library, meetings —
-- so the app you just deployed looks like the app in the demonstration.
--
-- SAFE TO RUN TWICE. Every insert is keyed on a fixed id or guarded by a
-- conflict clause, so re-running changes nothing rather than doubling
-- everything.
--
-- THESE ARE NOT REAL PEOPLE. Every address is on `example.test`, a domain
-- reserved by RFC 6761 that can never be registered, so none of it can reach an
-- inbox by accident. The password below is deliberately weak and shared.
--
-- ############ DELETE THIS DATA BEFORE REAL MEMBERS JOIN ############
-- The last section of this file is the removal script. Read it now, so you
-- know it exists before you need it.

do $$
declare
  v_church uuid;
  v_pw text := crypt('SentryBeacon2026!', gen_salt('bf'));
begin
  -- Attach to the church of whoever is already the head executive, so the demo
  -- congregation lands in YOUR church rather than inventing another one.
  select church_id into v_church from public.profiles
  where is_head_executive and church_id is not null order by created_at limit 1;

  if v_church is null then
    raise exception 'Run 01_make_me_the_first_director.sql first — there is no church to add people to.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
   ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maria@example.test', v_pw, now(), now(), now()),
   ('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','david@example.test', v_pw, now(), now(), now()),
   ('d0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','john@example.test',  v_pw, now(), now(), now()),
   ('d0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','grace@example.test', v_pw, now(), now(), now()),
   ('d0000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','peter@example.test', v_pw, now(), now(), now()),
   ('d0000000-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pastor@example.test',v_pw, now(), now(), now())
  on conflict (id) do nothing;

  -- UPDATE, not insert. The signup trigger already created these profiles with
  -- safe defaults the moment the auth rows appeared, so an insert would collide
  -- and — with `on conflict do nothing` — silently leave everyone an
  -- unapproved Explorer with no church. That mistake looks exactly like working
  -- code and takes an hour to find.
  alter table public.profiles disable trigger user;
  update public.profiles set role='admin', full_name='Pastor Ramos',  church_id=v_church, is_approved=true  where id='d0000000-0000-4000-8000-000000000006';
  update public.profiles set role='dm',    full_name='Maria Santos',  church_id=v_church, is_approved=true  where id='d0000000-0000-4000-8000-000000000001';
  update public.profiles set role='dm',    full_name='David Cruz',    church_id=v_church, is_approved=true  where id='d0000000-0000-4000-8000-000000000002';
  update public.profiles set role='ds',    full_name='John Reyes',    church_id=v_church, is_approved=true  where id='d0000000-0000-4000-8000-000000000003';
  update public.profiles set role='ds',    full_name='Grace Lim',     church_id=v_church, is_approved=true  where id='d0000000-0000-4000-8000-000000000004';
  -- Left UNAPPROVED on purpose, so there is something waiting on the Director's
  -- screen to approve during a demonstration.
  update public.profiles set role='ds',    full_name='Peter Manalo',  church_id=v_church, is_approved=false where id='d0000000-0000-4000-8000-000000000005';
  alter table public.profiles enable trigger user;

  insert into public.pairings (id, dm_id, ds_id, journey_stage, status, created_by)
  values
   ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','care','active','d0000000-0000-4000-8000-000000000006'),
   ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000004','connect','active','d0000000-0000-4000-8000-000000000006')
  on conflict (id) do nothing;

  insert into public.messages (pairing_id, sender_id, body, created_at)
  select * from (values
   ('e0000000-0000-4000-8000-000000000001'::uuid,'d0000000-0000-4000-8000-000000000001'::uuid,'Hi John, it was good to see you on Sabbath. How did the week go?', now() - interval '3 days'),
   ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','Busy, but I read the passage you sent. I had a question about it.', now() - interval '2 days'),
   ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Ask away — or save it for Thursday if it is easier to talk through.', now() - interval '2 days' + interval '3 hours'),
   ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','Hello Grace, welcome. No rush on anything — tell me what you would like to look at first.', now() - interval '1 day')
  ) as v(a,b,c,d)
  where not exists (select 1 from public.messages where pairing_id='e0000000-0000-4000-8000-000000000001');

  insert into public.blog_posts (id, author_id, church_id, title, body, visibility, audience, created_at)
  values
   ('b1000000-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-000000000001', v_church,
    'What I keep coming back to in Psalm 23',
    E'Someone asked me this week why the psalm says "I shall not want" when plainly we do want things, most of the time.\n\nThe line is not a promise that wanting stops. It is a claim about who is doing the leading. A shepherd walks ahead; the sheep does not need the whole map, only to keep the shepherd in sight.\n\nIf this week has been the kind where you cannot see very far ahead, that is not a failure of faith. It is the ordinary shape of following someone.',
    'published','all', now() - interval '26 hours'),
   ('b1000000-0000-4000-8000-00000000000b','d0000000-0000-4000-8000-000000000001', v_church,
    'Notes for Sabbath — not finished',
    'Three things on hospitality. Still working out the second one.',
    'private','all', now() - interval '3 hours')
  on conflict (id) do nothing;

  insert into public.prayer_requests (id, ds_id, church_id, body, share_with_church, status, created_at)
  values
   ('c1000000-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-000000000003', v_church,'Please pray for my mother, she goes in for tests on Monday.', true, 'praying', now() - interval '2 days'),
   ('c1000000-0000-4000-8000-00000000000b','d0000000-0000-4000-8000-000000000004', v_church,'For steadiness at work, and patience with myself.', true, 'open', now() - interval '20 hours'),
   ('c1000000-0000-4000-8000-00000000000c','d0000000-0000-4000-8000-000000000003', v_church,'Something I would rather only Maria knew about.', false, 'open', now() - interval '5 hours')
  on conflict (id) do nothing;

  insert into public.materials (id, church_id, added_by, title, description, kind, external_url, created_at)
  values
   ('f0000000-0000-4000-8000-00000000000a', v_church,'d0000000-0000-4000-8000-000000000001','The Adventist beliefs, in plain language','A short read for someone new to the idea.','link','https://www.adventist.org/beliefs/', now() - interval '4 days'),
   ('f0000000-0000-4000-8000-00000000000b', v_church,'d0000000-0000-4000-8000-000000000001','Hymn — It Is Well With My Soul','For a hard week.','audio','https://hymnary.org/text/when_peace_like_a_river_attendeth_my_way', now() - interval '2 days'),
   ('f0000000-0000-4000-8000-00000000000c', v_church,'d0000000-0000-4000-8000-000000000002','Daily reading plan','One chapter a day, no pressure.','pdf','https://www.biblegateway.com/reading-plans/', now() - interval '1 day')
  on conflict (id) do nothing;

  insert into public.material_shares (material_id, pairing_id, shared_by, note)
  values
   ('f0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','This is the one I mentioned.'),
   ('f0000000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',null)
  on conflict do nothing;

  insert into public.meetings (id, pairing_id, church_id, title, starts_at, mode, location, notes, status, created_by)
  values
   ('a1000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-000000000001', v_church,'Bible study over coffee', now() + interval '2 days','in_person','The cafe on the corner','He wants to talk about the passage from last week.','confirmed','d0000000-0000-4000-8000-000000000001'),
   ('a1000000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-000000000002', v_church,'First call — just to say hello', now() + interval '5 days','online','Video call','','proposed','d0000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;

  raise notice 'Demo congregation ready. Sign in as maria@example.test with SentryBeacon2026!';
end $$;

-- What you should now have. Every number should be non-zero.
select
 (select count(*) from public.profiles where is_approved) as approved_people,
 (select count(*) from public.pairings)        as pairings,
 (select count(*) from public.messages)        as messages,
 (select count(*) from public.blog_posts)      as blog_posts,
 (select count(*) from public.prayer_requests) as prayers,
 (select count(*) from public.materials)       as library_items,
 (select count(*) from public.meetings)        as meetings;

-- ###########################################################################
-- REMOVING IT AGAIN, before real members join.
--
-- Not one statement, because three foreign keys BLOCK rather than cascade:
-- messages.sender_id, journey_events.changed_by and pairings.created_by are all
-- NO ACTION. A plain `delete from auth.users` fails on them. Uncomment and run:
-- ###########################################################################
--
-- begin;
-- create temp table demo_ids on commit drop as
--   select id from auth.users where email like '%@example.test';
-- delete from public.messages       where sender_id  in (select id from demo_ids);
-- delete from public.journey_events where changed_by in (select id from demo_ids);
-- delete from public.pairings       where created_by in (select id from demo_ids)
--                                      or dm_id      in (select id from demo_ids)
--                                      or ds_id      in (select id from demo_ids);
-- delete from auth.users where id in (select id from demo_ids);
-- commit;
