-- A judge is drawn, the hearing ends with a recommendation, and the Church
-- Board rules.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261020200000_a_judge_is_drawn_and_the_church_board_rules):
--
--   THE DRAW      the judge is drawn from the leaders free to hear the case,
--                 never the person it is about, anybody called to it, the one
--                 who brought it (unless nobody else is free) or a leader who
--                 cannot open the door; a case about a Director is drawn from
--                 Executive Directors; the draw is on the record and can be
--                 worked out again from it.
--   STEPPING DOWN another is drawn; when nobody is left, the seat waits for an
--                 Executive Director.
--   THE HEARING   the one who brought the case presents it; only the judge
--                 ends the hearing; ending it touches nobody's account, seals
--                 the record and stops anything more being said.
--   THE BOARD     its ruling is written down by the judge or a leader who sat
--                 on the case, never somebody called to it; once; it is
--                 carried out only when asked and allowed; the record checks it.
--   PRESENCE      "I am here" from somebody in the case, and nobody else.
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
--   bb21 Draw Chapel      bb22 Small Chapel      bb23 Far Chapel
--   d1   Director of bb21, authenticator app   (brings the cases)
--   d2   Director of bb21, authenticator app
--   d3   Director of bb21, authenticator app
--   d4   Director of bb21, NO authenticator app (cannot be drawn)
--   e1   Executive Director of bb21, authenticator app
--   e2   Executive Director of bb23, oversees bb21, authenticator app
--   a1   Guide of bb21          (the case is about them)
--   a2   Guide of bb21          (raised it)
--   a3   Explorer of bb21       (not in the case)
--   d9   the only Director of bb22, authenticator app
--   a9   Guide of bb22
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000bb21', 'Draw Chapel'),
  ('00000000-0000-0000-0000-00000000bb22', 'Small Chapel'),
  ('00000000-0000-0000-0000-00000000bb23', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000b0' || s)::uuid, 'draw-' || s || '@example.test'
  from unnest(array['d1', 'd2', 'd3', 'd4', 'e1', 'e2', 'a1', 'a2', 'a3', 'd9', 'a9']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case right(p.id::text, 2)
                when 'd9' then '00000000-0000-0000-0000-00000000bb22'::uuid
                when 'a9' then '00000000-0000-0000-0000-00000000bb22'::uuid
                when 'e2' then '00000000-0000-0000-0000-00000000bb23'::uuid
                else '00000000-0000-0000-0000-00000000bb21'::uuid end,
  role = case right(p.id::text, 2)
           when 'a3' then 'ds'
           else case left(right(p.id::text, 2), 1)
                  when 'd' then 'admin' when 'e' then 'executive' else 'dm' end
         end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-00000000b0__';
insert into public.church_executives (church_id, executive_id) values
  ('00000000-0000-0000-0000-00000000bb21', '00000000-0000-0000-0000-00000000b0e2');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
select gen_random_uuid(), ('00000000-0000-0000-0000-00000000b0' || s)::uuid, 'totp', 'verified', now(), now()
  from unnest(array['d1', 'd2', 'd3', 'e1', 'e2', 'd9']) s;

create or replace function pg_temp.id(p_short text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000b0' || p_short)::uuid
$$;

create or replace function pg_temp.who(p_short text, p_minutes_ago integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000b0' || p_short,
    'role', 'authenticated',
    'aal', case when left(p_short, 1) in ('d', 'e') then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', case when left(p_short, 1) in ('d', 'e') then 'totp' else 'password' end,
      'timestamp', floor(extract(epoch from now()) - p_minutes_ago * 60)::bigint)));
$$;

/** The short name (d2, e1, ...) of whoever is judging a case now. */
create or replace function pg_temp.judge(p_trial text) returns text language sql as $$
  select right(head_judge_id::text, 2) from public.trials where id = p_trial::uuid
$$;

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

create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

create or replace function pg_temp.k(p_key text) returns text language sql as $$
  select v from kept where k = p_key
$$;

/** Work a draw out again from its record entry, independently of the database's own function. */
create or replace function pg_temp.redraw(p_trial text, p_seq integer) returns boolean language plpgsql as $$
declare
  r     public.court_record%rowtype;
  pool  text[];
  drawn text;
  seed  text;
begin
  select * into r from public.court_record where trial_id = p_trial::uuid and seq = p_seq;
  drawn := substring(r.about from '^drawn=([0-9a-f-]+);');
  pool  := string_to_array(substring(r.about from ';from=(.*)$'), ',');
  seed  := encode(extensions.digest('Hope Beacon judge draw' || chr(10) || p_trial || chr(10) || r.prev_hash, 'sha256'), 'hex');
  return pool[1 + (('x' || lpad(substr(seed, 1, 12), 16, '0'))::bit(64)::bigint % cardinality(pool))::integer] = drawn;
end $$;

-- THE DRAW ------------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('d1'),
  format($q$select public.open_trial(%L, 'Invented case about a1', null, %L)::text$q$, pg_temp.id('a1'), pg_temp.id('a2')),
  'ok', 'a Director opens a case', 'T');
select pg_temp.check(pg_temp.judge(pg_temp.k('T')) in ('d2', 'd3'),
  'its judge is drawn from the Directors free to hear it: not the one who brought it, not one without two-step sign-in, not an Executive Director');
select pg_temp.check((select about from public.court_record
                       where trial_id = pg_temp.k('T')::uuid and act = 'judge_drawn')
                     = 'drawn=' || (select head_judge_id from public.trials where id = pg_temp.k('T')::uuid)::text
                       || ';from=' || array_to_string(array(select x from unnest(array[pg_temp.id('d2'), pg_temp.id('d3')]) x order by x::text collate "C"), ','),
  'the record names who was drawn and from whom');
select pg_temp.check(pg_temp.redraw(pg_temp.k('T'), (select seq from public.court_record
                                                      where trial_id = pg_temp.k('T')::uuid and act = 'judge_drawn')),
  'and the draw works out the same again from the record alone');
select pg_temp.check(exists (select 1 from public.notifications n, public.trials t
                              where t.id = pg_temp.k('T')::uuid and n.user_id = t.head_judge_id
                                and n.title = 'You have been drawn to judge a case'),
  'the one drawn is told');
insert into kept values ('J1', pg_temp.judge(pg_temp.k('T')));

-- THE ONE WHO BROUGHT IT PRESENTS IT -------------------------------------------------
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.court_say(%L, 'Invented: why this case was brought')::text$q$, pg_temp.k('T')),
  'ok', 'the Director who brought the case speaks in it');
select pg_temp.as_claims(pg_temp.who('d1'), format($q$select public.court_exhibit_write(%L, 'Invented note', 'Invented words')$q$, pg_temp.k('T')),
  'ok', 'and enters an exhibit');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_close_hearing(%L, 'dismiss')$q$, pg_temp.k('T'))) like 'Only the judge%',
  'but does not end the hearing');

-- PRESENCE ------------------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_here(%L)::text$q$, pg_temp.k('T')),
  'ok', 'somebody called to the case says they are here');
select pg_temp.check(pg_temp.answer(pg_temp.who(pg_temp.k('J1')),
    format($q$select string_agg((p ->> 'name') || '=' || (p ->> 'here'), ',' order by p ->> 'name') from jsonb_array_elements(public.court_case(%L) -> 'people') p$q$, pg_temp.k('T')))
  = 'Person a1=true,Person a2=false',
  'and the room shows them here, and the one who has not come as away');
select pg_temp.as_claims(pg_temp.who('a3'), format($q$select public.court_here(%L)::text$q$, pg_temp.k('T')),
  'not one you are in', 'somebody not in the case cannot say they are');
select pg_temp.as_claims(pg_temp.who('a1', 45), format($q$select public.court_here(%L)::text$q$, pg_temp.k('T')),
  'court room is locked', 'nor anybody through a stale pass');
select pg_temp.check(not has_table_privilege('authenticated', 'public.court_presence', 'select'),
  'and nobody reads who was where directly');

-- STEPPING DOWN -------------------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_step_down(%L, 'Invented')$q$, pg_temp.k('T'))) = 'Only the judge can step down.',
  'only the judge steps down');
select pg_temp.check(pg_temp.answer(pg_temp.who(pg_temp.k('J1')),
    format($q$select public.court_step_down(%L, 'Invented: I know them well')$q$, pg_temp.k('T'))) = 'ok',
  'the judge steps down, giving a reason');
select pg_temp.check(pg_temp.judge(pg_temp.k('T')) in ('d2', 'd3') and pg_temp.judge(pg_temp.k('T')) <> pg_temp.k('J1'),
  'and the other free Director is drawn, never the one who stepped down');
insert into kept values ('J2', pg_temp.judge(pg_temp.k('T')));
select pg_temp.check(pg_temp.redraw(pg_temp.k('T'), (select max(seq) from public.court_record
                                                      where trial_id = pg_temp.k('T')::uuid and act = 'judge_drawn')),
  'that draw, too, works out the same again');
-- (A check never reads a table in the same statement that changes it: that
-- statement still sees the table as it was when it began.)
select pg_temp.check(pg_temp.answer(pg_temp.who(pg_temp.k('J2')),
    format($q$select public.court_step_down(%L, null)$q$, pg_temp.k('T'))) = 'ok',
  'the second judge steps down too');
select pg_temp.check(pg_temp.judge(pg_temp.k('T')) = 'd1'
  and exists (select 1 from public.court_record where trial_id = pg_temp.k('T')::uuid
                and act = 'judge_drawn' and detail like '%leader who brought it was drawn%'),
  'when nobody else is free, the one who brought it is drawn, and the record says why');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_step_down(%L, 'Invented')$q$, pg_temp.k('T'))) = 'ok',
  'and steps down');
select pg_temp.check((select head_judge_id is null and escalation = 'requested' from public.trials where id = pg_temp.k('T')::uuid),
  'and when nobody is left, the seat waits for an Executive Director');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select judge_name from public.court_cases() where id = %L$q$, pg_temp.k('T'))) = 'Waiting for a judge',
  'the docket says so, rather than naming somebody who stepped down');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'), format($q$select public.take_head_judge(%L)$q$, pg_temp.k('T'))) = 'ok',
  'an Executive Director takes the seat');

-- THE END OF THE HEARING -----------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.court_close_hearing(%L, 'acquit')$q$, pg_temp.k('T'))) like 'Recommend%',
  'a hearing ends with one of four recommendations');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.court_close_hearing(%L, 'suspend', 'Invented: both were heard')$q$, pg_temp.k('T'))) = 'ok',
  'the judge ends the hearing, recommending suspension');
select pg_temp.check((select status = 'with_board' and seal_hash is not null and recommendation = 'suspend'
                        from public.trials where id = pg_temp.k('T')::uuid)
    and (select suspended_at is null from public.profiles where id = pg_temp.id('a1'))
    and not exists (select 1 from auth.users where id = pg_temp.id('a1') and banned_until > now()),
  'the record is sealed and the case waits for the Board; nothing has happened to anybody''s account');
select pg_temp.as_claims(pg_temp.who('a1'), format($q$select public.court_say(%L, 'Too late')::text$q$, pg_temp.k('T')),
  'ended', 'nothing more is said');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'), format($q$select public.court_case(%L) -> 'case' ->> 'recommendation'$q$, pg_temp.k('T'))) = 'suspend'
    and pg_temp.answer(pg_temp.who('a1'), format($q$select coalesce(public.court_case(%L) -> 'case' ->> 'recommendation', 'not shown')$q$, pg_temp.k('T'))) = 'not shown',
  'the recommendation is for the bench, not for the person it is about');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.close_trial(%L, 'removed', 'Invented')$q$, pg_temp.k('T'))) like '%Church Board%',
  'the old way of ending a case says how it ends now');
select pg_temp.check((select status from public.trials where id = pg_temp.k('T')::uuid) = 'with_board'
    and exists (select 1 from auth.users where id = pg_temp.id('a1')),
  'and decides nothing');

-- THE CHURCH BOARD RULES ------------------------------------------------------------------
select pg_temp.check(pg_temp.answer(pg_temp.who('a2'),
    format($q$select public.court_record_ruling(%L, 'dismissed', 'Invented')$q$, pg_temp.k('T'))) like 'Only the judge%',
  'somebody called to the case does not write the ruling down');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_record_ruling(%L, 'pardoned', 'Invented')$q$, pg_temp.k('T'))) like '%one of%',
  'a ruling is dismissed, counselled, suspended or removed');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_record_ruling(%L, 'suspended', 'Invented', null, current_date + 3)$q$, pg_temp.k('T'))) like '%still to come%',
  'and was presented on a day that has come');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_record_ruling(%L, 'suspended', 'Invented: suspended for three months', 'The Church Board, through its clerk', current_date, true)$q$, pg_temp.k('T'))) = 'ok',
  'the Director who brought it writes the Board''s ruling down, and carries it out');
select pg_temp.check((select status = 'closed' and verdict = 'suspended' and ruling_presented_by = 'The Church Board, through its clerk'
                        from public.trials where id = pg_temp.k('T')::uuid)
    and (select suspended_at is not null from public.profiles where id = pg_temp.id('a1')),
  'the case is closed by the Board''s ruling, and only now is the account suspended');
select pg_temp.check((select max(seq) filter (where act = 'hearing_closed') < max(seq) filter (where act = 'ruling')
                        from public.court_record where trial_id = pg_temp.k('T')::uuid),
  'the record reads the end of the hearing, then the ruling');
select pg_temp.check(exists (select 1 from public.notifications where user_id = pg_temp.id('a2') and title = 'The Church Board has ruled'),
  'the people called are told');
select pg_temp.check(pg_temp.answer(pg_temp.who('d1'),
    format($q$select public.court_record_ruling(%L, 'dismissed', 'Invented')$q$, pg_temp.k('T'))) like '%already written down%',
  'the ruling is written down once');
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select (public.court_check_record(%L) ->> 'holds') || '/' || (public.court_check_record(%L) ->> 'seal_holds') || '/' || (public.court_check_record(%L) ->> 'ruling_holds')$q$, pg_temp.k('T'), pg_temp.k('T'), pg_temp.k('T'))) = 'true/true/true',
  'the record, its seal and the ruling all hold');
update public.trials set ruling_words = ruling_words || ' and more' where id = pg_temp.k('T')::uuid;
select pg_temp.check(pg_temp.answer(pg_temp.who('e1'),
    format($q$select public.court_check_record(%L) ->> 'ruling_holds'$q$, pg_temp.k('T'))) = 'false',
  'a ruling changed afterwards is found');

-- A CASE ABOUT A DIRECTOR ------------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('e1'),
  format($q$select public.open_trial(%L, 'Invented case about a Director')::text$q$, pg_temp.id('d4')),
  'ok', 'an Executive Director opens a case about a Director', 'TD');
select pg_temp.check(pg_temp.judge(pg_temp.k('TD')) = 'e2',
  'its judge is drawn from the Executive Directors over the church, not from the Directors');
select pg_temp.check(pg_temp.answer(pg_temp.who('d2'), format($q$select count(*)::text from public.court_cases() where id = %L$q$, pg_temp.k('TD'))) = '0',
  'and no Director sees it');

-- A CHURCH WITH ONE DIRECTOR ---------------------------------------------------------------
select pg_temp.as_claims(pg_temp.who('d9'),
  format($q$select public.open_trial(%L, 'Invented case in a small church')::text$q$, pg_temp.id('a9')),
  'ok', 'the only Director of a small church opens a case', 'TS');
select pg_temp.check(pg_temp.judge(pg_temp.k('TS')) = 'd9',
  'and is drawn, since nobody else is free');
select pg_temp.check(pg_temp.answer(pg_temp.who('d9'),
    format($q$select public.court_close_hearing(%L, 'remove')$q$, pg_temp.k('TS'))) = 'ok'
  and pg_temp.answer(pg_temp.who('d9'),
    format($q$select public.court_record_ruling(%L, 'removed', 'Invented ruling, to be carried out at the next meeting')$q$, pg_temp.k('TS'))) = 'ok',
  'a ruling to remove can be written down without carrying it out');
select pg_temp.check(exists (select 1 from auth.users where id = pg_temp.id('a9')),
  'and then nothing is carried out');

-- WHAT IS NOT OPEN ------------------------------------------------------------------------
select pg_temp.check(not has_function_privilege('authenticated', 'private.court_draw_judge(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.court_judge_pool(uuid)', 'execute'),
  'nobody signed in can draw a judge or read the pool directly');
select pg_temp.check(not has_function_privilege('anon', 'public.court_record_ruling(uuid, text, text, text, date, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.court_here(uuid)', 'execute'),
  'and the signed-out visitor can do none of it');

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
  if total < 40 then raise exception 'only % checks ran; expected at least 40', total; end if;
  if failed > 0 then raise exception '% of % judge-and-board checks failed', failed, total; end if;
  raise notice 'a judge is drawn and the Church Board rules: % checks', total;
end $$;

rollback;
