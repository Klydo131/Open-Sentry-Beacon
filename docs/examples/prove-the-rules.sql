-- Prove the rules. Do not take them on trust.
--
--   createdb beacon
--   psql -d beacon -f docs/examples/schema.sql
--   psql -d beacon -f docs/examples/prove-the-rules.sql
--
-- Every check is an ATTACK run as a second account that should fail. Every line
-- must print PASS.
--
-- Seeding happens as the owner, who bypasses RLS — that is why the inserts
-- work. The checks then `set role app_user`, because a superuser or table owner
-- bypasses RLS and would make every check pass for the wrong reason. Proving
-- your rules while connected as the owner proves nothing at all, and it is the
-- most common way somebody convinces themselves a broken policy works.

\set ON_ERROR_STOP on
\pset tuples_only on

truncate notes, messages, pairings, profiles, churches restart identity cascade;

insert into churches (id, name)
values ('99999999-9999-9999-9999-999999999999', 'Sample Church');

insert into profiles (id, full_name, email, role, is_approved, church_id) values
 ('a0000000-0000-0000-0000-00000000000a','Maria Santos','maria@example.test','dm',   true, '99999999-9999-9999-9999-999999999999'),
 ('b0000000-0000-0000-0000-00000000000b','John Reyes',  'john@example.test', 'ds',   true, '99999999-9999-9999-9999-999999999999'),
 ('c0000000-0000-0000-0000-00000000000c','David Cruz',  'david@example.test','dm',   true, '99999999-9999-9999-9999-999999999999'),
 ('d0000000-0000-0000-0000-00000000000d','Grace Lim',   'grace@example.test','ds',   true, '99999999-9999-9999-9999-999999999999'),
 ('e0000000-0000-0000-0000-00000000000e','Pastor Ramos','ramos@example.test','admin',true, '99999999-9999-9999-9999-999999999999');

insert into pairings (id, dm_id, ds_id, stage) values
 ('f0000000-0000-0000-0000-00000000000f','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','care'),
 ('f1000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-00000000000d','call');

insert into messages (pairing_id, sender_id, body) values
 ('f0000000-0000-0000-0000-00000000000f','a0000000-0000-0000-0000-00000000000a','How did this week go?');

insert into notes (pairing_id, author_id, body) values
 ('f0000000-0000-0000-0000-00000000000f','a0000000-0000-0000-0000-00000000000a','John is finding this stage hard.');

set role app_user;

-- 1. THE PROMISE: A SEEKER CANNOT READ THEIR OWN STAGE ----------------------
--    The obvious "you may read a pairing you are in" policy hands the seeker
--    the whole row, stage column included. The screens hide it; the database
--    did not. This is the check that caught it.
set app.current_user_id = 'b0000000-0000-0000-0000-00000000000b';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  a seeker reads ' || count(*) || ' rows of the pairings table (want 0 — stage lives there)'
from pairings;

-- 2. ...BUT A SEEKER STILL SEES THEIR OWN JOURNEY ---------------------------
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || '  a seeker sees their own journey through my_journey() (want 1)'
from my_journey();

-- 3. AND THAT VIEW HAS NO STAGE COLUMN AT ALL -------------------------------
--    Absent, not hidden. A hidden column is one careless SELECT * from being
--    shown.
reset role;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  the seeker''s view exposes no stage column (want 0)'
from information_schema.parameters
where specific_name like 'my_journey%' and parameter_name = 'stage';
set role app_user;

-- 4. A SECOND MISSIONARY CANNOT READ THE FIRST ONE'S PAIRING ---------------
set app.current_user_id = 'c0000000-0000-0000-0000-00000000000c';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || '  a missionary sees ' || count(*) || ' pairing: only their own (want 1)'
from pairings;

-- 5. ...AND CANNOT READ THE OTHER'S PRIVATE NOTES --------------------------
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  a second missionary reads ' || count(*) || ' of the first one''s notes (want 0)'
from notes;

-- 6. ...NOR THEIR CONVERSATION ---------------------------------------------
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  a second missionary reads ' || count(*) || ' messages of a conversation they are not in (want 0)'
from messages;

-- 7. THE MISSIONARY IN THE PAIRING READS BOTH ------------------------------
set app.current_user_id = 'a0000000-0000-0000-0000-00000000000a';
select case when (select count(*) from notes) = 1
             and (select count(*) from messages) = 1
            then 'PASS' else 'FAIL' end
       || '  the missionary in the pairing reads their own note and message';

-- 8. THE SEEKER IN THE CONVERSATION CAN READ IT ----------------------------
--    Messages are shared; notes are not. This proves the two are different.
set app.current_user_id = 'b0000000-0000-0000-0000-00000000000b';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || '  the seeker reads the conversation they are part of (want 1)'
from messages;

-- 9. ...BUT NOT THE MISSIONARY'S PRIVATE NOTES ABOUT THEM ------------------
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  the seeker reads ' || count(*) || ' private notes written about them (want 0)'
from notes;

-- 10. AN ADMIN SEES EVERY PAIRING ------------------------------------------
set app.current_user_id = 'e0000000-0000-0000-0000-00000000000e';
select case when count(*) = 2 then 'PASS' else 'FAIL' end
       || '  an admin sees ' || count(*) || ' pairings (want 2)'
from pairings;

-- 11. ...AND STILL NOT A MISSIONARY'S PRIVATE NOTES ------------------------
--     No admin exception. That is the promise made to a missionary.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  an admin reads ' || count(*) || ' private notes (want 0 — no admin exception)'
from notes;

-- 12. NOBODY PROMOTES THEMSELVES -------------------------------------------
set app.current_user_id = 'b0000000-0000-0000-0000-00000000000b';
update profiles set role = 'admin' where id = 'b0000000-0000-0000-0000-00000000000b';
select case when role = 'ds' then 'PASS' else 'FAIL' end
       || '  after trying to become admin, the role is still ' || role
from profiles where id = 'b0000000-0000-0000-0000-00000000000b';

-- 13. NOBODY APPROVES THEMSELVES -------------------------------------------
--     Seeded as approved=true, so this first sets it false to have something
--     real to attempt. The trigger pins whatever is stored, either direction.
--     `set app.current_user_id = ''` is not decoration. The variable persists
--     across `reset role`, so without clearing it the owner's own setup update
--     is treated as the seeker editing their own row and gets pinned too — and
--     the check then fails for a reason that has nothing to do with the rule.
reset role;
set app.current_user_id = '';
update profiles set is_approved = false where id = 'b0000000-0000-0000-0000-00000000000b';
set role app_user;
set app.current_user_id = 'b0000000-0000-0000-0000-00000000000b';
update profiles set is_approved = true where id = 'b0000000-0000-0000-0000-00000000000b';
select case when is_approved = false then 'PASS' else 'FAIL' end
       || '  after trying to approve themselves, is_approved is still ' || is_approved
from profiles where id = 'b0000000-0000-0000-0000-00000000000b';

-- 14. YOU CANNOT SEND A MESSAGE AS SOMEBODY ELSE ---------------------------
set app.current_user_id = 'c0000000-0000-0000-0000-00000000000c';
do $$
begin
  begin
    insert into messages (pairing_id, sender_id, body)
    values ('f0000000-0000-0000-0000-00000000000f',
            'a0000000-0000-0000-0000-00000000000a', 'forged');
    raise notice 'FAIL  a forged message was accepted';
  exception when others then
    raise notice 'PASS  sending as somebody else is refused';
  end;
end $$;

-- 15. MEDIA FOLLOWS ITS PAIRING -------------------------------------------
--     A file attached to a conversation must be no more visible than the
--     conversation itself. NOTE what this does and does not prove: it tests the
--     ROW. The file's bytes are your storage provider's problem, and a private
--     row pointing at a publicly readable object is the classic media leak.
--     See the note in schema.sql section 2b.
reset role;
set app.current_user_id = '';
insert into media (pairing_id, church_id, owner_id, kind, storage_path, bytes)
values ('f0000000-0000-0000-0000-00000000000f','99999999-9999-9999-9999-999999999999',
        'a0000000-0000-0000-0000-00000000000a','image','private/photo.jpg', 1024);
set role app_user;

set app.current_user_id = 'c0000000-0000-0000-0000-00000000000c';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || '  an outsider reads ' || count(*) || ' media rows of a conversation they are not in (want 0)'
from media;

set app.current_user_id = 'b0000000-0000-0000-0000-00000000000b';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || '  the seeker in that pairing can see media shared with them (want 1)'
from media;

reset role;
