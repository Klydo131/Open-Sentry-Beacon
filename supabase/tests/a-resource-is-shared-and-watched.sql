-- A resource reaches only the person it was sent to, and the record sees it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROVES, against a database built from nothing by
-- scripts/fresh-install.sh, signed in as invented people:
--
--   PRIVATE     a resource is its adder's until it is shared; then the one
--               person it was sent to reads it, and no other Explorer, Guide,
--               Director or church does. A Director does not read who got what.
--   BOTH WAYS   a Guide sends to their own Explorer and an Explorer sends back;
--               nobody shares into a pairing that is not theirs, in another
--               name, or something they cannot read themselves.
--   KEPT WHOLE  only its adder changes or deletes a resource; a share cannot
--               be moved to another pairing; only leadership publishes; an
--               address that is not http(s) is refused.
--   WATCHED     the record gains a line when something is added, when it is
--               shared, and when an address is changed afterwards
--               (20261112120000), for a resource and for a pocket.
--   STOPPED     a Director stops somebody sharing: they cannot add, the whole
--               pairing is paused, and the other person is told why.
--   TAKEN BACK  whoever sent something takes it back, and it is gone.
--
-- EVERYTHING IS ROLLED BACK. Any FAIL raises at the end, which stops the
-- install script and CI.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;
-- All fictional.
create temp table results (n serial, ok boolean, label text, got text) on commit drop;
grant all on results to authenticated, anon; grant usage on sequence results_n_seq to authenticated, anon;

insert into public.churches (id, name) values
  ('00000000-0000-0000-0000-0000000aa001', 'Shelf Chapel'),
  ('00000000-0000-0000-0000-0000000aa002', 'Far Chapel');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000a00' || s)::uuid, 'shelf-' || s || '@example.test'
  from unnest(array['d1','b1','b2','a1','a2','b9','a9']) s;
update public.profiles p set
  full_name = 'Person ' || right(p.id::text, 2),
  church_id = case when right(p.id::text, 1) = '9' then '00000000-0000-0000-0000-0000000aa002'::uuid
                   else '00000000-0000-0000-0000-0000000aa001'::uuid end,
  role = case left(right(p.id::text, 2), 1) when 'd' then 'admin' when 'a' then 'ds' else 'dm' end::user_role,
  is_approved = true
 where p.id::text like '00000000-0000-0000-0000-0000000a00__';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000a00d1', 'totp', 'verified', now(), now());
insert into public.pairings (id, dm_id, ds_id, track, journey_stage) values
  ('00000000-0000-0000-0000-0000000a9001', '00000000-0000-0000-0000-0000000a00b1', '00000000-0000-0000-0000-0000000a00a1', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000a9002', '00000000-0000-0000-0000-0000000a00b2', '00000000-0000-0000-0000-0000000a00a2', 'digital', 'connect'),
  ('00000000-0000-0000-0000-0000000a9009', '00000000-0000-0000-0000-0000000a00b9', '00000000-0000-0000-0000-0000000a00a9', 'digital', 'connect');

create or replace function pg_temp.run(p_who text, p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_state text := 'ok'; v_out text; v_msg text := '';
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000a00' || p_who, 'role', 'authenticated',
    'aal', case when left(p_who,1)='d' then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object('method', case when left(p_who,1)='d' then 'totp' else 'password' end,
           'timestamp', floor(extract(epoch from now()) - 60)::bigint)))::text, true);
  set local role authenticated;
  begin execute p_sql into v_out; exception when others then v_state := sqlstate; v_msg := sqlerrm; end;
  reset role;
  insert into results (ok, label, got)
  values ((v_state = 'ok' and coalesce(v_out,'') = p_expect) or (v_state <> 'ok' and p_expect = 'REFUSED'),
          p_label, case when v_state='ok' then coalesce(v_out,'(null)') else v_state || ' ' || left(v_msg, 90) end);
end $$;

\set P1 '00000000-0000-0000-0000-0000000a9001'
\set P2 '00000000-0000-0000-0000-0000000a9002'
\set CA '00000000-0000-0000-0000-0000000aa001'

select pg_temp.run('b1', format($q$with i as (insert into public.materials (church_id, added_by, title, kind, external_url) values (%L, auth.uid(), 'A study', 'link', 'https://example.org/study') returning 1) select count(*) from i$q$, :'CA'), '1', 'Guide adds a link');
select id as "M1" from public.materials where title = 'A study' \gset
select pg_temp.run('b1', format($q$with i as (insert into public.materials (church_id, added_by, title, kind, external_url) values (%L, auth.uid(), 'Bad', 'link', 'javascript:alert(1)') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A javascript: address is refused');
select pg_temp.run('a1', 'select count(*) from public.materials', '0', 'Explorer sees nothing before a share');
select pg_temp.run('b1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by, note) values (%L, %L, auth.uid(), 'for you') returning 1) select count(*) from i$q$, :'M1', :'P1'), '1', 'Guide shares with own Explorer');
select pg_temp.run('a1', 'select count(*) from public.materials', '1', 'That Explorer now sees it');
select pg_temp.run('a2', 'select count(*) from public.materials', '0', 'Another Explorer does not');
select pg_temp.run('b2', 'select count(*) from public.materials', '0', 'Another Guide does not');
select pg_temp.run('d1', 'select count(*) from public.materials', '0', 'A Director does not read a private resource');
select pg_temp.run('d1', 'select count(*) from public.material_shares', '0', 'A Director does not read who got what');
select pg_temp.run('b9', 'select count(*) from public.materials', '0', 'Another church sees nothing');
select pg_temp.run('b1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, auth.uid()) returning 1) select count(*) from i$q$, :'M1', :'P2'), 'REFUSED', 'Guide cannot share into another Guide''s pairing');
select pg_temp.run('b2', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, auth.uid()) returning 1) select count(*) from i$q$, :'M1', :'P2'), 'REFUSED', 'Another Guide cannot share what they cannot read');
select pg_temp.run('a1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, '00000000-0000-0000-0000-0000000a00b1') returning 1) select count(*) from i$q$, :'M1', :'P1'), 'REFUSED', 'Nobody shares in another name');
select pg_temp.run('a1', format($q$with i as (insert into public.materials (church_id, added_by, title, kind, external_url) values (%L, auth.uid(), 'From me', 'link', 'https://example.org/mine') returning 1) select count(*) from i$q$, :'CA'), '1', 'Explorer adds a link');
select id as "M2" from public.materials where title = 'From me' \gset
select pg_temp.run('a1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, auth.uid()) returning 1) select count(*) from i$q$, :'M2', :'P1'), '1', 'Explorer shares back to their Guide');
select pg_temp.run('b1', 'select count(*) from public.materials', '2', 'Guide sees both');
select pg_temp.run('a1', format($q$with u as (update public.materials set title = 'Hijacked' where id = %L returning 1) select count(*) from u$q$, :'M1'), '0', 'Explorer cannot edit the Guide''s resource');
select pg_temp.run('a1', format($q$with u as (delete from public.materials where id = %L returning 1) select count(*) from u$q$, :'M1'), '0', 'Explorer cannot delete the Guide''s resource');
select pg_temp.run('b1', format($q$with u as (update public.materials set is_published = true where id = %L returning 1) select count(*) from u$q$, :'M1'), 'REFUSED', 'Guide cannot publish to the church');
select pg_temp.run('b1', format($q$with u as (update public.material_shares set pairing_id = %L where material_id = %L returning 1) select count(*) from u$q$, :'P2', :'M1'), '0', 'A share cannot be moved to another pairing');

-- The record: an add, a share, and a changed address.
select pg_temp.run('d1', $q$select count(*) from public.library_activity_feed(100) where title = 'A study'$q$, '2', 'Record holds the add and the share');
select pg_temp.run('b1', format($q$with u as (update public.materials set external_url = 'https://casino-bets.example/x' where id = %L returning 1) select count(*) from u$q$, :'M1'), '1', 'Guide changes the address after sharing');
select pg_temp.run('d1', $q$select count(*) from public.library_activity_feed(100) where title = 'A study'$q$, '3', 'The record gains a line when the address is changed');
select pg_temp.run('a1', format($q$select external_url from public.materials where id = %L$q$, :'M1'), 'https://casino-bets.example/x', 'Explorer now gets the new address');

-- Stopping somebody
select pg_temp.run('d1', $q$select public.set_library_block('00000000-0000-0000-0000-0000000a00b1', true, 'test')::text$q$, 'true', 'Director stops the Guide sharing');
select pg_temp.run('b1', format($q$with i as (insert into public.materials (church_id, added_by, title, kind, external_url) values (%L, auth.uid(), 'More', 'link', 'https://example.org/more') returning 1) select count(*) from i$q$, :'CA'), 'REFUSED', 'A stopped Guide cannot add');
select pg_temp.run('a1', format($q$with d as (delete from public.material_shares where material_id = %L and shared_by = auth.uid() returning 1) select count(*) from d$q$, :'M2'), '1', 'Explorer takes their own share back');
select pg_temp.run('a1', format($q$with i as (insert into public.material_shares (material_id, pairing_id, shared_by) values (%L, %L, auth.uid()) returning 1) select count(*) from i$q$, :'M2', :'P1'), 'REFUSED', 'Sharing is paused for the whole pairing');
select pg_temp.run('a1', format($q$select public.why_library_sharing_is_paused(%L)$q$, :'P1'), 'Sharing the library has been turned off for somebody in this pairing.', 'And the Explorer is told why');
select pg_temp.run('b1', format($q$with d as (delete from public.material_shares where material_id = %L and shared_by = auth.uid() returning 1) select count(*) from d$q$, :'M1'), '1', 'Guide takes a share back');
select pg_temp.run('a1', 'select count(*) from public.materials where added_by <> auth.uid()', '0', 'And the Explorer no longer has it');

-- The pocket: a changed address is recorded there too.
select pg_temp.run('a2', $q$with i as (insert into public.pocket_apps (url, label) values ('https://example.org/app', 'My app') returning 1) select count(*) from i$q$, '1', 'Explorer puts a web app in their pocket');
select pg_temp.run('a2', $q$with u as (update public.pocket_apps set url = 'https://example.org/other' where label = 'My app' returning 1) select count(*) from u$q$, '1', 'and changes its address');
select pg_temp.run('d1', $q$select count(*) from public.library_activity_feed(100) where title = 'My app'$q$, '2', 'The record holds both the first address and the changed one');

\o
do $$
declare r record; failed int := 0; total int := 0;
begin
  for r in select * from results order by n loop
    total := total + 1;
    if r.ok then raise notice 'OK    %', r.label;
    else failed := failed + 1; raise notice 'FAIL  % (got: %)', r.label, r.got; end if;
  end loop;
  if total < 30 then raise exception 'only % checks ran; expected at least 30', total; end if;
  if failed > 0 then raise exception '% of % sharing checks failed', failed, total; end if;
  raise notice 'a resource is shared and watched: % checks hold', total;
end $$;

rollback;
