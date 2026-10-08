-- Fictional users only; the whole regression rolls back. Run after all migrations.
begin;
create temp table results (ok boolean, label text) on commit drop;
grant insert on results to authenticated,anon;
insert into auth.users(id,email) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'repair-'||n||'@example.test' from generate_series(1,8)n;
insert into public.churches(id,name) values ('10000000-0000-0000-0000-000000000010','Fictional chapel'),('10000000-0000-0000-0000-000000000011','Other fictional chapel');
update public.profiles set church_id='10000000-0000-0000-0000-000000000010',is_approved=true,role=case right(id::text,1) when '1' then 'admin'::user_role when '2' then 'executive'::user_role when '3' then 'dm'::user_role when '5' then 'dm'::user_role else 'ds'::user_role end where id::text like '10000000%';
update public.profiles set church_id='10000000-0000-0000-0000-000000000011' where id='10000000-0000-0000-0000-000000000008';
insert into public.pairings(id,dm_id,ds_id) values ('10000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004');
insert into public.messages(id,pairing_id,sender_id,body) values ('10000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000003','Fictional private words');
create function pg_temp.expect(who int,sql text,wanted text,label text) returns void language plpgsql as $$
declare actual text:='ok'; val text;
begin
 perform set_config('request.jwt.claims',json_build_object('sub','10000000-0000-0000-0000-'||lpad(who::text,12,'0'),'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  if wanted in ('ok','42501','54000','22023') then execute sql; else execute sql into val; actual:=coalesce(val,'NULL'); end if;
 exception when others then actual:=sqlstate; end;
 execute 'reset role';perform set_config('request.jwt.claims','',true);
 insert into results values (actual=wanted,label||' (got '||actual||', wanted '||wanted||')');
end $$;
select pg_temp.expect(1,'select count(*) from public.messages','0','Director cannot read private messages');
select pg_temp.expect(2,'select count(*) from public.messages','0','Executive cannot read private messages');
select pg_temp.expect(3,'select count(*) from public.messages','1','Guide reads their conversation');
select pg_temp.expect(4,'select count(*) from public.messages','1','Explorer reads their conversation');
select pg_temp.expect(5,'select count(*) from public.messages','0','Unrelated Guide cannot read conversation');
select pg_temp.expect(1,$q$update public.pairings set dm_id='10000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000020'$q$,'42501','Director cannot replace participant');
select pg_temp.expect(1,$q$update public.profiles set role='executive',is_head_executive=true where id='10000000-0000-0000-0000-000000000005'$q$,'42501','Director cannot appoint Head Executive');
select pg_temp.expect(1,$q$update public.profiles set role='executive' where id='10000000-0000-0000-0000-000000000005'$q$,'42501','Director cannot appoint Executive');
select pg_temp.expect(2,$q$update public.profiles set role='executive' where id='10000000-0000-0000-0000-000000000001'$q$,'42501','Executive appointment needs administrative route');
select pg_temp.expect(1,$q$update public.profiles set church_id='10000000-0000-0000-0000-000000000011' where id='10000000-0000-0000-0000-000000000005'$q$,'42501','Director cannot move church');
select pg_temp.expect(3,$q$update public.profiles set id='10000000-0000-0000-0000-000000000099' where id='10000000-0000-0000-0000-000000000003'$q$,'42501','Profile identity remains fixed');
select pg_temp.expect(1,$q$update public.pairings set journey_stage='connect' where id='10000000-0000-0000-0000-000000000020'$q$,'ok','Director still manages journey stage');
select pg_temp.expect(4,$q$select public.church_of('10000000-0000-0000-0000-000000000008')$q$,'NULL','Cross-church UUID lookup returns no church');
select pg_temp.expect(4,$q$select public.church_of('10000000-0000-0000-0000-000000000003')$q$,'10000000-0000-0000-0000-000000000010','Legitimate Guide lookup remains available');
select pg_temp.expect(1,'select count(*) from public.my_threads()','0','Director gets no previews');
select pg_temp.expect(2,'select count(*) from public.my_threads()','0','Executive gets no previews');
select pg_temp.expect(3,'select count(*) from public.my_threads()','1','Guide gets their preview');
select pg_temp.expect(1,$q$select public.message_history_for_leader('10000000-0000-0000-0000-000000000030')$q$,'42501','Leader history RPC has no permission');
select pg_temp.expect(1,$q$select private.message_history_for_leader('10000000-0000-0000-0000-000000000030')$q$,'42501','Private history RPC has no permission');
-- A genuine technical appointment must still close a former Guide's old thread.
update public.profiles set role='admin' where id='10000000-0000-0000-0000-000000000003';
select pg_temp.expect(3,'select count(*) from public.messages','0','Former Guide who becomes Director loses private access');
select pg_temp.expect(3,'select count(*) from public.my_threads()','0','Former Guide loses previews');
select pg_temp.expect(3,$q$select public.edit_message('10000000-0000-0000-0000-000000000030','Changed')$q$,'42501','Former Guide cannot edit message');
select pg_temp.expect(3,$q$select public.delete_message('10000000-0000-0000-0000-000000000030')$q$,'42501','Former Guide cannot delete message');
update public.profiles set role='dm' where id='10000000-0000-0000-0000-000000000003';
select pg_temp.expect(3,$q$select public.edit_message('10000000-0000-0000-0000-000000000030','A legitimate correction')$q$,'ok','Current Guide edits own message');
update public.profiles set is_approved=false where id='10000000-0000-0000-0000-000000000003';
select pg_temp.expect(3,'select count(*) from public.messages','0','Approval revocation closes conversation');
select pg_temp.expect(1,$q$update public.profiles set is_approved=true where id='10000000-0000-0000-0000-000000000003'$q$,'ok','Director still approves a Guide');
update public.profiles set suspended_at=now() where id='10000000-0000-0000-0000-000000000003';
select pg_temp.expect(3,'select count(*) from public.messages','0','Suspension closes conversation');
select pg_temp.expect(3,$q$select public.edit_message('10000000-0000-0000-0000-000000000030','Changed')$q$,'42501','Suspended sender cannot use edit RPC');
select pg_temp.expect(1,$q$insert into public.pairings(dm_id,ds_id,created_by) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001')$q$,'42501','Leadership cannot insert itself as Guide');
select pg_temp.expect(1,$q$insert into public.pairings(dm_id,ds_id,created_by) values('10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001')$q$,'ok','Director still pairs approved Guide and Explorer');
-- Ordinary Executive authority cannot alter another Executive. The Head can.
update public.profiles set role='executive',is_approved=false where id='10000000-0000-0000-0000-000000000007';
select pg_temp.expect(2,$q$update public.profiles set is_approved=true where id='10000000-0000-0000-0000-000000000007'$q$,'42501','Ordinary Executive cannot approve another Executive');
update public.profiles set is_head_executive=true where id='10000000-0000-0000-0000-000000000002';
select pg_temp.expect(2,$q$update public.profiles set is_approved=true where id='10000000-0000-0000-0000-000000000007'$q$,'ok','Head approves another Executive');
select pg_temp.expect(2,$q$select is_approved::text from public.profiles where id='10000000-0000-0000-0000-000000000007'$q$,'true','Head approval actually changes the row');
select pg_temp.expect(2,$q$update public.profiles set is_approved=false where id='10000000-0000-0000-0000-000000000007'$q$,'ok','Head disapproves another Executive');
select pg_temp.expect(2,$q$select is_approved::text from public.profiles where id='10000000-0000-0000-0000-000000000007'$q$,'false','Head disapproval actually changes the row');
select pg_temp.expect(2,$q$update public.profiles set role='admin' where id='10000000-0000-0000-0000-000000000007'$q$,'ok','Head may change non-Head Executive role');
select pg_temp.expect(2,$q$select role::text from public.profiles where id='10000000-0000-0000-0000-000000000007'$q$,'admin','Role change actually persists');
-- The existing orphan-invitation claim remains usable without self-approval.
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000009','pending-executive@example.test');
insert into public.invites(church_id,email,role,invited_by) values ('10000000-0000-0000-0000-000000000010','pending-executive@example.test','executive','10000000-0000-0000-0000-000000000002');
select pg_temp.expect(9,'select public.claim_my_pending_invitation()::text','true','Orphan account claims the exact Executive invitation');
select pg_temp.expect(9,'select is_approved::text from profiles where id=auth.uid()','false','Claim never self-approves');
select pg_temp.expect(2,$q$update profiles set is_approved=true,role='executive' where id='10000000-0000-0000-0000-000000000009'$q$,'ok','Head may approve a legitimately claimed Executive invitation');
select pg_temp.expect(2,$q$select is_approved::text from profiles where id='10000000-0000-0000-0000-000000000009'$q$,'true','Claimed invitation approval actually changes the row');
select * from results;
do $$ begin if exists(select 1 from results where not ok) then raise exception 'Leadership privacy regression failed'; end if; end $$;
rollback;
