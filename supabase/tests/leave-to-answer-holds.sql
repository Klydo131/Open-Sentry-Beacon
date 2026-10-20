-- Leave to answer holds, and the record outlives the account.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261020180000_leave_to_answer_and_a_record_that_outlives_the_account):
--
--   LEAVE       only the judge gives it, only to somebody called to the case
--               whose account is suspended; while it lasts the account signs
--               in and reaches that one case and nothing else -- not the rest
--               of the data API, not another case, not other stored files;
--               when it ends, by the judge, by time, by the verdict, the
--               account is switched off again and its sessions end; a lifted
--               suspension is not switched off again.
--   DELETED     a report, its conversation and its evidence stay when the
--               account of the person who raised it, or the person it is
--               about, is deleted, shown as "(account deleted)"; a case says
--               so on its record and keeps them among the people called; a
--               report or case about a deleted leader stays with Executive
--               Directors; the record still holds.
--   RULES       a Director decides no report about themselves or another
--               Director; the person a report is about is never told of it; a
--               suspended Director is not leadership; one person's share of a
--               record has a limit.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated, anon;
create temp table kept (k text primary key, v text) on commit drop;
grant all on kept to authenticated, anon;

-- FIXTURES ------------------------------------------------------------------- All fictional.
--   aa11 Leave Chapel          aa12 Far Chapel
--   d1   Director of aa11, authenticator app   (judges the first case)
--   d2   Director of aa11, authenticator app   (judges the second case)
--   d3   Director of aa11, authenticator app   (a report is about them)
--   e1   Executive Director of aa11, authenticator app
--   e2   Executive Director of aa11, authenticator app   (a report is about them)
--   a1   Explorer of aa11, suspended           (the first case is about them)
--   a2   Explorer of aa11, suspended           (removed by a verdict)
--   b1   Guide of aa11                         (raised it; later deletes their account)
--   b2   Guide of aa11                         (the second case is about them)
--   f1   Guide of aa12
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000aa11', 'Leave Chapel'),
  ('00000000-0000-0000-0000-00000000aa12', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000a0' || s)::uuid, 'leave-' || s || '@example.test'
  from unnest(array['d1', 'd2', 'd3', 'e1', 'e2', 'a1', 'a2', 'b1', 'b2', 'f1']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 2) = 'f1'
                   then '00000000-0000-0000-0000-00000000aa12'::uuid
                   else '00000000-0000-0000-0000-00000000aa11'::uuid end,
  role = case left(right(p.id::text, 2), 1)
           when 'd' then 'admin' when 'e' then 'executive' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-00000000a0__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
select gen_random_uuid(), ('00000000-0000-0000-0000-00000000a0' || s)::uuid, 'totp', 'verified', now(), now()
  from unnest(array['d1', 'd2', 'd3', 'e1', 'e2']) s;

-- Who, and how freshly they proved it.
create or replace function pg_temp.who(p_short text, p_minutes_ago integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000a0' || p_short,
    'role', 'authenticated',
    'aal', case when left(p_short, 1) in ('d', 'e') then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', case when left(p_short, 1) in ('d', 'e') then 'totp' else 'password' end,
      'timestamp', floor(extract(epoch from now()) - p_minutes_ago * 60)::bigint)));
$$;

create or replace function pg_temp.id(p_short text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000a0' || p_short)::uuid
$$;

-- Run something as a person; record whether it was refused as expected (by
-- SQLSTATE or by words in the message), and keep its answer.
create or replace function pg_temp.as_claims(p_claims jsonb, p_sql text, p_expect text, p_label text, p_keep text default null)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := ''; v_out text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  set local role authenticated;
  begin
    execute p_sql into v_out;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if p_keep is not null and v_state = 'ok' then
    insert into kept values (p_keep, v_out) on conflict (k) do update set v = excluded.v;
  end if;
  if (p_expect = 'ok' and v_state = 'ok') or (p_expect <> 'ok' and v_state <> 'ok' and (v_msg ilike '%' || p_expect || '%' or v_state = p_expect)) then
    insert into results values (true, p_label);
  else
    insert into results values (false, format('%s (got %s: %s)', p_label, v_state, v_msg));
  end if;
end $$;

-- The text a query gives, as a person.
create or replace function pg_temp.answer(p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- What the data API's check before every request says, for a person asking
-- for an address: 'ok' or the SQLSTATE it refused with.
create or replace function pg_temp.before_request(p_claims jsonb, p_path text)
returns text language plpgsql as $$
declare v text := 'ok';
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('request.path', p_path, true);
  set local role authenticated;
  begin
    perform public.refuse_suspended_requests();
  exception when others then
    v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.path', '', true);
  return v;
end $$;

-- A private rule's answer for a person, asked as the owner.
create or replace function pg_temp.rule(p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql into v;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

create or replace function pg_temp.k(p_key text) returns text language sql as $$
  select v from kept where k = p_key
$$;

create or replace function pg_temp.banned(p_short text) returns boolean language sql as $$
  select coalesce(banned_until > now() + interval '50 years', false) from auth.users where id = pg_temp.id(p_short)
$$;

-- REPORTS: WHO IS TOLD, WHO DECIDES ------------------------------------------------
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'inappropriate', 'Invented report about a1')::text$q$, pg_temp.id('a1')),
  'ok', 'a Guide reports an Explorer', 'R1');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'other', 'Invented report about a Director')::text$q$, pg_temp.id('d3')),
  'ok', 'and reports a Director', 'R2');
select pg_temp.check((select reporter_name = 'Person b1' and subject_name = 'Person d3' and subject_role = 'admin'
                        from public.reports where id = pg_temp.k('R2')::uuid),
  'a report keeps the names and the role it was filed with');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('d3') and type = 'report' and body like '%Person d3%'),
  'the Director a report is about is never told of it');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('d2') and type = 'report' and body like '%Person d3%'),
  'nor are other Directors, since a report about a Director is for Executive Directors');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = pg_temp.id('e1') and type = 'report' and body like '%Person d3%'),
  'the Executive Director is told');
select pg_temp.check((select count(*) from public.notifications
                       where type = 'report' and body like '%Person a1%'
                         and user_id in (pg_temp.id('d1'), pg_temp.id('d2'), pg_temp.id('d3'), pg_temp.id('e1'), pg_temp.id('e2'))) = 5,
  'a report about an Explorer reaches every leader of the church');
select pg_temp.as_claims(pg_temp.who('b1'),
  format($q$select public.report_person(%L, 'other', 'Invented report about an Executive Director')::text$q$, pg_temp.id('e2')),
  'ok', 'a Guide reports an Executive Director');
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = pg_temp.id('e2') and type = 'report' and body like '%Person e2%')
    and exists (select 1 from public.notifications
                 where user_id = pg_temp.id('e1') and type = 'report' and body like '%Person e2%'),
  'the Executive Director it is about is not told; the other one is');
select pg_temp.check(pg_temp.answer(pg_temp.who('d3'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Nothing to answer')::text$q$, pg_temp.k('R2'))) = 'false',
  'a Director cannot dismiss a report about themselves');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Nothing to answer')::text$q$, pg_temp.k('R2'))) = 'false',
  'nor one about another Director');
select pg_temp.check((select status from public.reports where id = pg_temp.k('R2')::uuid) = 'open',
  'and the report stays open');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.resolve_report(%L, 'dismissed', 'Invented')::text$q$, pg_temp.k('R1'))) = 'true',
  'a Director still decides a report about an Explorer');
select pg_temp.check((select status from public.reports where id = pg_temp.k('R1')::uuid) = 'dismissed',
  'and it is decided');
update public.reports set status = 'open', decided_by = null, decided_at = null, outcome = null
 where id = pg_temp.k('R1')::uuid;
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.claim_report(%L)::text$q$, pg_temp.k('R1')),
  'ok', 'a Director picks the report up');
select pg_temp.as_claims(pg_temp.who('b1'), format($q$select public.say_in_report(%L, 'Invented message from b1')::text$q$, pg_temp.k('R1')),
  'ok', 'and the person who raised it writes to them');
insert into public.report_files (report_id, church_id, added_by, name, path, mime, size_bytes)
values (pg_temp.k('R1')::uuid, '00000000-0000-0000-0000-00000000aa11', pg_temp.id('b1'),
        'invented.png', 'reports/' || pg_temp.id('b1')::text || '/invented.png', 'image/png', 10);

-- A SUSPENDED MEMBER IS CALLED -----------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'), format($q$select public.suspend_member(%L, 'Invented')$q$, pg_temp.id('a1'))) = 'ok'
  and pg_temp.answer(pg_temp.who('d1'), format($q$select public.suspend_member(%L, 'Invented')$q$, pg_temp.id('a2'))) = 'ok'
  and pg_temp.banned('a1') and pg_temp.banned('a2'),
  'two Explorers are suspended, and their accounts switched off');
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$select public.open_trial(%L, 'Invented case about a1', %L)::text$q$, pg_temp.id('a1'), pg_temp.k('R1')),
  'ok', 'a Director opens a case about a suspended Explorer', 'T');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() ->> 'needs'$q$) = 'suspended',
  'without leave, the suspended Explorer''s door says so');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_case(%L)::text$q$, pg_temp.k('T')),
  'court room is locked', 'and nothing in the case opens to them');
select pg_temp.check(pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_case') = '42501',
  'the data API refuses even the court room''s calls without leave');

-- GIVING LEAVE ------------------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('b1'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a1'))) like 'Only the judge%',
  'only the judge gives leave');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a1'))) like 'Only the judge%',
  'not another Director');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('b1'))) like '%not suspended%',
  'leave is for a suspended account only');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a2'))) like 'Only somebody called%',
  'and only for somebody called to the case');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 5)$q$, pg_temp.k('T'), pg_temp.id('a1'))) like '%an hour, a day%',
  'for an hour, a day, three days or a week');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1', 45),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a1'))) like 'ERROR: %locked%',
  'and not through a stale pass');
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-0000000005e1', pg_temp.id('a1'));
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a1'))) = 'ok',
  'the judge gives the Explorer a day''s leave to answer');
select pg_temp.check(not pg_temp.banned('a1')
    and (select suspended_at is not null from public.profiles where id = pg_temp.id('a1')),
  'their account may sign in again, and it is still suspended');
select pg_temp.check(exists (select 1 from public.court_record
                              where trial_id = pg_temp.k('T')::uuid and act = 'leave_granted'
                                and about = pg_temp.id('a1')::text),
  'the leave is on the case''s record');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = pg_temp.id('d2') and title = 'A suspended member may answer a case')
    and exists (select 1 from public.notifications
                 where user_id = pg_temp.id('a1') and title = 'You may sign in to answer a case'),
  'the church''s other leaders are told, and so is the Explorer');

-- ON LEAVE: ONE CASE, AND NOTHING ELSE ---------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() ->> 'open'$q$) = 'true'
    and pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() -> 'leave' ->> 'case'$q$) = pg_temp.k('T'),
  'on leave, the Explorer''s door opens, and says to which case');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'),
    $q$select ((public.court_door() ->> 'until')::timestamptz <= (public.court_door() -> 'leave' ->> 'until')::timestamptz)::text$q$) = 'true',
  'and the pass never lasts past the leave');
select pg_temp.check(pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_case') = 'ok'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_door') = 'ok'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_exhibit_begin') = 'ok',
  'the data API lets the court room''s own calls through');
select pg_temp.check(pg_temp.before_request(pg_temp.who('a1'), '/profiles') = '42501'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_summon') = '42501'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_door_x') = '42501'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/get_my_profile') = '42501',
  'and nothing else: not a table, not another call, not a look-alike name');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select count(*)::text from public.profiles$q$) = '0'
    and pg_temp.answer(pg_temp.who('a1'), $q$select count(*)::text from public.reports$q$) = '0',
  'the tables stay shut to them whatever is asked');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'),
    format($q$select public.court_case(%L) -> 'case' ->> 'my_place'$q$, pg_temp.k('T'))) = 'accused',
  'they open their case, as the person it is about');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_say(%L, 'Invented answer on leave')::text$q$, pg_temp.k('T')),
  'ok', 'and answer it');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.court_exhibit_write(%L, 'Invented note', 'Invented writing')$q$, pg_temp.k('T')),
  'ok', 'and enter an exhibit');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$select public.court_exhibit_begin(%L, 'Invented photo', 'p.png', 'image/png', 5, repeat('ab', 32)) ->> 'path'$q$, pg_temp.k('T')),
  'ok', 'and begin a file exhibit', 'P');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into storage.objects (bucket_id, name, owner, metadata) values ('court-exhibits', %L, %L, '{"size": 5}') returning name$q$,
         pg_temp.k('P'), pg_temp.id('a1')),
  'ok', 'whose file goes up to the place it waits for');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into storage.objects (bucket_id, name, owner, metadata) values ('pairing-media', %L, %L, '{"size": 5}') returning name$q$,
         pg_temp.id('a1')::text || '/elsewhere.png', pg_temp.id('a1')),
  'row-level security', 'but no file goes anywhere else in the store');

select pg_temp.as_claims(pg_temp.who('d2'),
  format($q$select public.open_trial(%L, 'Invented case about b2')::text$q$, pg_temp.id('b2')),
  'ok', 'another Director opens a second case', 'T2');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select public.court_summon(%L, %L)$q$, pg_temp.k('T2'), pg_temp.id('a1'))) = 'ok',
  'a suspended member may be called as a witness');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_case(%L)::text$q$, pg_temp.k('T2')),
  'not one you are in', 'but leave to answer one case opens no other');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_say(%L, 'Invented')::text$q$, pg_temp.k('T2')),
  'Only the judge and the people called', 'nor a voice in it');
select pg_temp.as_claims(pg_temp.who('a1'),
  format($q$insert into public.trial_statements (trial_id, author_id, body) values (%L, %L, 'Invented') returning id::text$q$,
         pg_temp.k('T2'), pg_temp.id('a1')),
  'row-level security', 'not even by posting directly');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select count(*)::text from public.court_cases()$q$) = '1',
  'their docket holds the one case');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T2'), pg_temp.id('a1'))) like '%another case%',
  'and leave is for one case at a time');

-- ENDING LEAVE --------------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_end_leave(%L, %L)$q$, pg_temp.k('T'), pg_temp.id('a1'))) = 'ok',
  'the judge ends the leave');
select pg_temp.check(pg_temp.banned('a1')
    and not exists (select 1 from auth.sessions where user_id = pg_temp.id('a1')),
  'the account is switched off again and its sessions are ended');
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() ->> 'needs'$q$) = 'suspended'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_case') = '42501',
  'and the court room is shut to them again');
select pg_temp.check(exists (select 1 from public.court_record
                              where trial_id = pg_temp.k('T')::uuid and act = 'leave_ended'
                                and detail like '%the judge ended it%'),
  'the end is on the record');

select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 1)$q$, pg_temp.k('T'), pg_temp.id('a1'))) = 'ok',
  'leave for an hour');
update public.court_leave set granted_at = now() - interval '2 hours', ends_at = now() - interval '1 minute'
 where person_id = pg_temp.id('a1') and ended_at is null;
select pg_temp.check(pg_temp.answer(pg_temp.who('a1'), $q$select public.court_door() ->> 'open'$q$) = 'false'
    and pg_temp.before_request(pg_temp.who('a1'), '/rpc/court_case') = '42501',
  'an hour later it opens nothing, before anything has run');
select pg_temp.check(private.court_leave_sweep() = 1, 'the minute''s sweep ends it');
select pg_temp.check(pg_temp.banned('a1')
    and exists (select 1 from public.court_leave where person_id = pg_temp.id('a1') and ended_why = 'ran_out'),
  'as run out, and switches the account off again');

select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 24)$q$, pg_temp.k('T'), pg_temp.id('a1'))) = 'ok'
  and pg_temp.answer(pg_temp.who('d1'), format($q$select public.restore_member(%L)$q$, pg_temp.id('a1'))) = 'ok',
  'leave again, and then the suspension is lifted');
select pg_temp.check(private.court_leave_sweep() = 1, 'the sweep ends that leave too');
select pg_temp.check(not pg_temp.banned('a1')
    and exists (select 1 from public.court_leave where person_id = pg_temp.id('a1') and ended_why = 'lifted'),
  'as lifted, and the account is not switched off');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'), format($q$select public.suspend_member(%L, 'Invented again')$q$, pg_temp.id('a1'))) = 'ok'
  and pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_grant_leave(%L, %L, 72)$q$, pg_temp.k('T'), pg_temp.id('a1'))) = 'ok',
  'suspended again, and given three days');

-- A SUSPENDED DIRECTOR IS NOT LEADERSHIP ---------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'), format($q$select public.suspend_member(%L, 'Invented')$q$, pg_temp.id('d3'))) = 'ok',
  'an Executive Director suspends a Director');
select pg_temp.check(pg_temp.rule(pg_temp.who('d3'), format($q$select private.may_sit_on_trial(%L)::text$q$, pg_temp.k('T'))) = 'false'
    and pg_temp.rule(pg_temp.who('d3'), format($q$select private.may_handle_report(%L)::text$q$, pg_temp.k('R1'))) = 'false',
  'who may then neither watch a hearing nor handle a report');

-- ONE PERSON'S SHARE OF THE RECORD HAS A LIMIT ---------------------------------------
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select count(*)::text from generate_series(1, 30) g, lateral (select public.court_say(%L, 'Invented ' || g)) s$q$, pg_temp.k('T2')),
  'ok', 'thirty statements in a few minutes go in');
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.court_say(%L, 'One more')::text$q$, pg_temp.k('T2')),
  'great deal', 'the thirty-first waits');
select pg_temp.as_claims(pg_temp.who('d2'),
  format($q$select public.court_exhibit_write(%L, 'Invented exhibit', 'Invented words')$q$, pg_temp.k('T2')),
  'ok', 'the judge enters an exhibit', 'XA');
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select public.court_exhibit_handled((select id from public.court_exhibits where trial_id = %L and label = %L), 'differed')::text$q$, pg_temp.k('T2'), pg_temp.k('XA')),
  'ok', 'a device says the exhibit differed');
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select public.court_exhibit_handled((select id from public.court_exhibits where trial_id = %L and label = %L), 'differed')::text$q$, pg_temp.k('T2'), pg_temp.k('XA')),
  'ok', 'and says it again');
select pg_temp.check((select count(*) from public.court_record where trial_id = pg_temp.k('T2')::uuid and act = 'exhibit_differed') = 1
    and (select count(*) from public.notifications where user_id = pg_temp.id('d2')
           and title = 'An exhibit did not match its fingerprint') = 1,
  'which is written, and told to the judge, once');
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.court_exported(%L)::text$q$, pg_temp.k('T2')),
  'ok', 'a copy of the record is saved');
select pg_temp.as_claims(pg_temp.who('b2'), format($q$select public.court_exported(%L)::text$q$, pg_temp.k('T2')),
  'ok', 'and saved again');
select pg_temp.check((select count(*) from public.court_record where trial_id = pg_temp.k('T2')::uuid and act = 'record_exported') = 1,
  'which, twice in a minute, is written once');
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select count(*)::text from generate_series(1, 30) g, lateral (select public.court_exhibit_write(%L, 'Invented ' || g, 'Invented words ' || g)) s$q$, pg_temp.k('T2')),
  'ok', 'thirty exhibits in an hour go in');
select pg_temp.as_claims(pg_temp.who('b2'),
  format($q$select public.court_exhibit_write(%L, 'One more', 'Invented')$q$, pg_temp.k('T2')),
  'great many exhibits', 'the thirty-first waits');

-- A VERDICT ENDS LEAVE -----------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.close_trial(%L, 'suspended', 'Invented reason')$q$, pg_temp.k('T'))) = 'ok',
  'the judge decides the first case');
select pg_temp.check(pg_temp.banned('a1')
    and exists (select 1 from public.court_leave where person_id = pg_temp.id('a1') and ended_why = 'case_closed')
    and not exists (select 1 from public.court_leave where person_id = pg_temp.id('a1') and ended_at is null),
  'and the leave ends with it');
select pg_temp.check((select max(seq) filter (where act = 'verdict') < max(seq) filter (where act = 'leave_ended')
                        from public.court_record where trial_id = pg_temp.k('T')::uuid),
  'the record reads verdict, then the end of the leave');

-- THE RECORD OUTLIVES THE ACCOUNT -----------------------------------------------------
delete from auth.users where id = pg_temp.id('b1');
select pg_temp.check((select reporter_id is null and reporter_name = 'Person b1'
                        from public.reports where id = pg_temp.k('R1')::uuid),
  'the report stays when the account of the person who raised it is deleted');
select pg_temp.check((select count(*) from public.report_messages where report_id = pg_temp.k('R1')::uuid) = 1
    and (select count(*) from public.report_files where report_id = pg_temp.k('R1')::uuid and added_name = 'Person b1') = 1,
  'with its conversation and its evidence');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select author_name from public.report_thread(%L) limit 1$q$, pg_temp.k('R1'))) = 'Person b1 (account deleted)',
  'and what they wrote is shown as written by a deleted account');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.say_in_report(%L, 'Invented reply')::text$q$, pg_temp.k('R1')),
  'deleted their account', 'a reply nobody would read is not taken');
select pg_temp.check(exists (select 1 from public.court_departed
                              where trial_id = pg_temp.k('T')::uuid and person_id = pg_temp.id('b1') and part = 'reporter')
    and exists (select 1 from public.court_record
                 where trial_id = pg_temp.k('T')::uuid and act = 'account_deleted' and about = pg_temp.id('b1')::text),
  'the case writes the deletion on its record and keeps them among the people called');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select p ->> 'name' from jsonb_array_elements(public.court_case(%L) -> 'people') p where (p ->> 'deleted')::boolean$q$, pg_temp.k('T'))) = 'Person b1 (account deleted)',
  'and shows them as deleted');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select (public.court_check_record(%L) ->> 'holds') || '/' || (public.court_check_record(%L) ->> 'seal_holds')$q$, pg_temp.k('T'), pg_temp.k('T'))) = 'true/true',
  'and the record and its seal still hold');

delete from auth.users where id = pg_temp.id('d3');
select pg_temp.check((select subject_id is null and subject_name = 'Person d3' and subject_role = 'admin'
                        from public.reports where id = pg_temp.k('R2')::uuid),
  'a report about a Director stays when that Director''s account is deleted');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'),
    format($q$select count(*)::text from public.my_reports() where id = %L$q$, pg_temp.k('R2'))) = '0',
  'and still does not open to Directors');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select subject_name from public.my_reports() where id = %L$q$, pg_temp.k('R2'))) = 'Person d3 (account deleted)',
  'the Executive Director reads it, the person shown as deleted');

delete from auth.users where id = pg_temp.id('d2');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select judge_name from public.court_cases() where id = %L$q$, pg_temp.k('T2'))) = 'Person d2 (account deleted)',
  'a case whose judge''s account is deleted says so');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'), format($q$select public.take_head_judge(%L)$q$, pg_temp.k('T2'))) = 'ok',
  'and an Executive Director takes the seat');

select pg_temp.as_claims(pg_temp.who('e1'),
  format($q$select public.open_trial(%L, 'Invented case about a2')::text$q$, pg_temp.id('a2')),
  'ok', 'an Executive Director opens a case about the other suspended Explorer', 'T3');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.close_trial(%L, 'removed', 'Invented')$q$, pg_temp.k('T3'))) = 'ok',
  'and removes them from the church');
select pg_temp.check(not exists (select 1 from auth.users where id = pg_temp.id('a2'))
    and (select max(seq) filter (where act = 'verdict') < max(seq) filter (where act = 'account_deleted')
           from public.court_record where trial_id = pg_temp.k('T3')::uuid),
  'the account goes, and the record reads verdict, then the deletion');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.court_case(%L) -> 'case' ->> 'subject_name'$q$, pg_temp.k('T3'))) = 'Person a2 (account deleted)'
  and pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.court_check_record(%L) ->> 'holds'$q$, pg_temp.k('T3'))) = 'true',
  'the case stays, about a deleted account, and its record holds');

-- THE CHURCH IS THE BOUNDARY ------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('f1'), $q$select count(*)::text from public.my_reports()$q$) = '0'
    and pg_temp.answer(pg_temp.who('f1'), $q$select count(*)::text from public.court_cases()$q$) = '0',
  'somebody of another church sees none of it');

-- WHAT IS NOT OPEN ------------------------------------------------------------------------
select pg_temp.check(not has_table_privilege('authenticated', 'public.court_leave', 'select')
    and not has_table_privilege('authenticated', 'public.court_departed', 'select'),
  'nobody signed in reads the leave or the departed directly');
select pg_temp.check(not has_function_privilege('authenticated', 'private.court_close_leave(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'private.court_leave_sweep()', 'execute')
    and not has_function_privilege('anon', 'public.court_grant_leave(uuid, uuid, integer)', 'execute'),
  'nor ends a leave, nor sweeps, and the signed-out visitor gives none');
select pg_temp.check(not has_function_privilege('authenticated', 'private.name_kept(uuid, text)', 'execute'),
  'nor looks up a name by an id');

-- THE VERDICT ------------------------------------------------------------------
\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  %', r.label; end if;
  end loop;
  if total < 70 then raise exception 'only % checks ran; expected at least 70', total; end if;
  if failed > 0 then raise exception '% of % leave-to-answer checks failed', failed, total; end if;
  raise notice 'leave to answer, and the record that outlives the account, hold: % checks', total;
end $$;

rollback;
