-- A hub is kept running by its members' gifts.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people
-- (20261026120000_a_hub_is_kept_running_by_gifts):
--
--   THE CARD      every approved member of a church sees its goal, how to give
--                 and the month's total, and nothing else: no gift, no giver;
--                 another church sees nothing of it; signed out, nothing.
--   DIRECTORS     only a Director sets it up, and must say where to give;
--                 only a Director names a treasurer, and only an approved,
--                 unsuspended member of the same church.
--   TREASURERS    only a treasurer records a gift, sees each gift, or takes
--                 one back; not in the future, not zero, not an unknown way;
--                 a treasurer who is removed, or moves church, stops at once.
--   THE TABLES    no signed-in person or visitor reads them directly.
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
--   ee41 Gift Chapel       ee42 Other Chapel
--   d1  Director of ee41               a1  Guide of ee41 (becomes treasurer)
--   b1  Explorer of ee41               c1  Guide of ee41, suspended
--   d2  Director of ee42
insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-00000000ee41', 'Gift Chapel'),
  ('00000000-0000-0000-0000-00000000ee42', 'Other Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000e0' || s)::uuid, 'gift-' || s || '@example.test'
  from unnest(array['d1', 'a1', 'b1', 'c1', 'd2']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case right(p.id::text, 2)
                when 'd2' then '00000000-0000-0000-0000-00000000ee42'::uuid
                else '00000000-0000-0000-0000-00000000ee41'::uuid end,
  role = case right(p.id::text, 2)
           when 'd1' then 'admin' when 'd2' then 'admin'
           when 'b1' then 'ds' else 'dm' end::user_role,
  is_approved = true,
  suspended_at = case when right(p.id::text, 2) = 'c1' then now() end
 where p.id::text like '00000000-0000-0000-0000-00000000e0__';

create or replace function pg_temp.id(p_short text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000e0' || p_short)::uuid
$$;

create or replace function pg_temp.who(p_short text) returns jsonb language sql as $$
  select jsonb_build_object(
    'sub', pg_temp.id(p_short), 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
             'timestamp', floor(extract(epoch from now()) - 60)::bigint)));
$$;

create or replace function pg_temp.as_(p_short text, p_sql text, p_expect text, p_label text, p_keep text default null)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_msg text := ''; v_out text;
begin
  if p_short = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', pg_temp.who(p_short)::text, true);
    set local role authenticated;
  end if;
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

create or replace function pg_temp.card(p_short text) returns jsonb language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', pg_temp.who(p_short)::text, true);
  set local role authenticated;
  begin
    v := public.hub_giving_card()::text;
  exception when others then
    v := jsonb_build_object('error', sqlerrm)::text;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v::jsonb;
end $$;

create or replace function pg_temp.k(p_key text) returns text language sql as $$
  select v from kept where k = p_key
$$;
create or replace function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  insert into results values (coalesce(p_cond, false), p_label);
end $$;

/** A save with this GCash number, bank account and picture. */
create or replace function pg_temp.save(p_gcash text, p_bank text, p_qr text) returns text language sql as $$
  select format($q$select public.hub_giving_save('PHP', 1710, 'The app''s database, backups and email.',
                  'Gift Chapel Treasury', %L, 'Example Bank', 'Gift Chapel', %L, %L)::text$q$, p_gcash, p_bank, p_qr)
$$;

-- BEFORE IT IS SET UP --------------------------------------------------------------
select pg_temp.check(pg_temp.card('b1') = '{"set_up": false, "i_lead": false, "i_keep_the_books": false}'::jsonb,
  'before a Director sets it up, a member sees that there is nothing yet');
select pg_temp.check(pg_temp.card('d1') ->> 'i_lead' = 'true', 'and a Director is told they may set it up');
select pg_temp.as_('anon', 'select public.hub_giving_card()::text', 'permission denied', 'signed out, there is no card at all');
select pg_temp.check(pg_temp.card('c1') ? 'error', 'a suspended member has no card');

-- DIRECTORS ------------------------------------------------------------------------
select pg_temp.as_('b1', pg_temp.save('0917 123 4567', null, null), 'Only a Director', 'an Explorer cannot set giving up');
select pg_temp.as_('a1', pg_temp.save('0917 123 4567', null, null), 'Only a Director', 'nor can a Guide');
select pg_temp.as_('d1', pg_temp.save(null, null, null), 'GCash number or a bank account',
  'a Director must say where members give');
select pg_temp.as_('d1', pg_temp.save('0917 123 4567', null, 'javascript:alert(1)'), '23514',
  'the QR picture must be a picture, nothing else');
select pg_temp.as_('d1', pg_temp.save('0917 123 4567', '0012-3456-7890', 'data:image/png;base64,iVBORw0KGgo='), 'ok',
  'a Director sets it up');
select pg_temp.check(pg_temp.card('b1') @> '{"set_up": true, "monthly_goal": 1710, "gcash_number": "0917 123 4567", "given_this_month": 0}'::jsonb,
  'every member then sees the goal, how to give and the month''s total');
select pg_temp.check(not (pg_temp.card('b1') ? 'gifts') and not (pg_temp.card('b1')::text ilike '%recorded_by%'),
  'and no gift and nobody who gave');
select pg_temp.check(pg_temp.card('d2') = '{"set_up": false, "i_lead": true, "i_keep_the_books": false}'::jsonb,
  'another church sees nothing of it');

-- TREASURERS ---------------------------------------------------------------------------
select pg_temp.as_('b1', 'select public.hub_treasurers_list()::text', 'Only a Director or a treasurer', 'a member cannot see who keeps the books');
select pg_temp.as_('b1', format('select public.hub_treasurer_name(%L)', pg_temp.id('b1')), 'Only a Director', 'nor name themselves');
select pg_temp.as_('d1', format('select public.hub_treasurer_name(%L)', pg_temp.id('d2')), 'approved member of this church',
  'a Director cannot name somebody from another church');
select pg_temp.as_('d1', format('select public.hub_treasurer_name(%L)', pg_temp.id('c1')), 'approved member of this church',
  'nor a suspended member');
select pg_temp.as_('d1', format('select public.hub_treasurer_name(%L)', pg_temp.id('a1')), 'ok', 'a Director names a Guide treasurer');
select pg_temp.check(pg_temp.card('a1') ->> 'i_keep_the_books' = 'true', 'who is then told they keep the books');

-- GIFTS ---------------------------------------------------------------------------------
select pg_temp.as_('b1', format($q$select public.hub_gift_record(100, %L::date, 'gcash', null)::text$q$, private.hub_today()), 'Only a treasurer',
  'a member cannot record a gift');
select pg_temp.as_('d1', format($q$select public.hub_gift_record(100, %L::date, 'gcash', null)::text$q$, private.hub_today()), 'Only a treasurer',
  'nor a Director who is not a treasurer');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(500, %L::date, 'gcash', 'Ref 1234')::text$q$, private.hub_today()), 'ok',
  'a treasurer records a gift', 'G1');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(700, %L::date, 'bank', null)::text$q$, private.hub_today()), 'ok', 'and another');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(300, %L::date, 'cash', null)::text$q$, (date_trunc('month', private.hub_today()) - interval '1 day')::date),
  'ok', 'and one from last month');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(100, %L::date, 'gcash', null)::text$q$, private.hub_today() + 1), 'future',
  'not one dated in the future');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(0, %L::date, 'gcash', null)::text$q$, private.hub_today()), '23514', 'nor of nothing');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(100, %L::date, 'paypal', null)::text$q$, private.hub_today()), '23514',
  'nor by a way the church does not receive');
select pg_temp.check(pg_temp.card('b1') @> '{"given_this_month": 1200, "given_last_month": 300}'::jsonb,
  'every member sees this month''s total and last month''s');

select pg_temp.as_('b1', $q$select public.hub_gifts_list(null)::text$q$, 'Only a treasurer', 'a member cannot see each gift');
select pg_temp.as_('d1', $q$select public.hub_gifts_list(null)::text$q$, 'Only a treasurer', 'nor can a Director');
select pg_temp.as_('a1', $q$select public.hub_gifts_list(null)::text$q$, 'ok', 'the treasurer sees each gift of the month', 'L');
select pg_temp.check(jsonb_array_length(pg_temp.k('L')::jsonb -> 'gifts') = 2 and (pg_temp.k('L')::jsonb ->> 'total')::numeric = 1200,
  'two gifts, 1,200 in all');
select pg_temp.check((select bool_and(e ?& array['id', 'amount', 'received_on', 'method', 'note', 'recorded_by']
                                       and (select count(*) from jsonb_object_keys(e)) = 6)
                        from jsonb_array_elements(pg_temp.k('L')::jsonb -> 'gifts') e),
  'each is an amount, a day, a way and a note, and who recorded it; never who gave');
select pg_temp.as_('a1', format($q$select public.hub_gifts_list(%L)::text$q$,
  to_char(date_trunc('month', private.hub_today()) - interval '1 day', 'YYYY-MM')), 'ok', 'and last month''s', 'LM');
select pg_temp.check(jsonb_array_length(pg_temp.k('LM')::jsonb -> 'gifts') = 1, 'one gift last month');

select pg_temp.as_('d2', format('select public.hub_gift_remove(%L)', pg_temp.k('G1')), 'Only a treasurer',
  'a Director of another church cannot take a gift back');
select pg_temp.as_('a1', format('select public.hub_gift_remove(%L)', pg_temp.k('G1')), 'ok', 'the treasurer takes one back');
select pg_temp.check((pg_temp.card('b1') ->> 'given_this_month')::numeric = 700, 'and the total follows');
select pg_temp.as_('a1', format('select public.hub_gift_remove(%L)', pg_temp.k('G1')), 'not recorded', 'it cannot be taken back twice');

-- A TREASURER STOPS AT ONCE ------------------------------------------------------------------
select pg_temp.as_('d1', format('select public.hub_treasurer_remove(%L)', pg_temp.id('a1')), 'ok', 'a Director removes the treasurer');
select pg_temp.as_('a1', $q$select public.hub_gifts_list(null)::text$q$, 'Only a treasurer', 'who sees each gift no longer');
select pg_temp.check((pg_temp.card('b1') ->> 'given_this_month')::numeric = 700, 'and the gifts they recorded stay');
select pg_temp.as_('d1', format('select public.hub_treasurer_name(%L)', pg_temp.id('a1')), 'ok', '(named again)');
update public.profiles set church_id = '00000000-0000-0000-0000-00000000ee42' where id = pg_temp.id('a1');
select pg_temp.as_('a1', format($q$select public.hub_gift_record(100, %L::date, 'gcash', null)::text$q$, private.hub_today()), 'Only a treasurer',
  'a treasurer who moves to another church keeps no books for the old one');

-- THE TABLES -------------------------------------------------------------------------------
select pg_temp.as_('d1', 'select count(*)::text from public.hub_gifts', 'permission denied', 'nobody signed in reads the gifts table');
select pg_temp.as_('d1', 'select count(*)::text from public.hub_giving', 'permission denied', 'nor the giving details directly');
select pg_temp.as_('anon', 'select count(*)::text from public.hub_treasurers', 'permission denied', 'nor does a visitor');
select pg_temp.check(not has_function_privilege('anon', 'public.hub_gift_record(numeric, date, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'private.hub_month_total(uuid, date)', 'execute'),
  'and a visitor can call none of it');

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
  if failed > 0 then raise exception '% of % giving checks failed', failed, total; end if;
  raise notice 'a hub is kept running by gifts: % checks', total;
end $$;

rollback;
