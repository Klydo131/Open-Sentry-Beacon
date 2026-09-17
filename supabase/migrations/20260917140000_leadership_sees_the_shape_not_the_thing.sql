-- Leadership sees what somebody did. It does not see what they did it with.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR, IN THESE WORDS: "Head ED, ED, and Directors can detect the
-- activities (Except for chat) of Guide and Explorer, but the Head ED, ED, and
-- Directors can't see the references. ... Guide put inappropriate website to
-- Explorer, the website can't be seen but the Director can see the label of the
-- activity is not good. Explorer put a malicious web app in the pocket app, the
-- activity is recorded, but the web app address is not seen but labelled
-- malicious and Directors get an alert notification. Once those inappropriate
-- things happen, Head ED, ED, and Directors can file an open case."
--
-- WHAT WAS ACTUALLY THERE, AND IT WAS THE OPPOSITE. `library_activity` carried
-- an `address` column and `library_activity_feed` handed it straight to
-- leadership, so a Director could read every link any Guide or Explorer had
-- shared. That is the exact thing this migration is asked to prevent, and it
-- was shipped as a feature.
--
-- THE ADDRESS IS NOT HIDDEN. IT IS NOT KEPT. A column that exists and is not
-- selected today is a column somebody selects next year in a function written
-- for a different reason, and nothing would go red. So the column is dropped
-- and what replaces it cannot be turned back into an address by anybody,
-- including us: a label, and a one-way fingerprint of the host.
--
-- WHY A FINGERPRINT AT ALL. Two rows about the same site have to be
-- recognisable as the same site -- "this is the fourth time this week" is the
-- difference between a mistake and a pattern, and it is most of what a Director
-- needs. sha256 of the host with a per-church salt gives exactly that and
-- nothing else: it cannot be reversed, and it cannot be compared across
-- churches to build a picture of anybody.
--
-- WHERE THE ADDRESS STILL LIVES, because it has to live somewhere: with the
-- people it belongs to. A Guide's resource keeps its `external_url` in
-- `materials`, visible to that Guide and the Explorer they shared it with. An
-- Explorer's pocket keeps its own row. Those are their links. The RECORD of
-- the act is a different object, read by a different rank, and it carries the
-- shape of the thing rather than the thing.
--
-- CHAT IS NOT IN HERE, and that is the owner's own exception. Nothing in this
-- file reads `messages` or any thread table. A leadership that can read a
-- pastoral conversation has changed what the conversation is.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. THE SALT. One per church, made once, never sent anywhere.
-- ---------------------------------------------------------------------------
--
-- WHY NOT ONE SALT FOR THE WHOLE DATABASE. A single salt makes fingerprints
-- comparable between congregations, so a church's record of what its members
-- look at becomes a thing that can be joined against another church's. Per
-- church, the comparison only works where it is meant to work.
create table if not exists private.church_fingerprint_salt (
  church_id uuid primary key references public.churches(id) on delete cascade,
  salt      text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
revoke all on table private.church_fingerprint_salt from public, anon, authenticated;

create or replace function private.host_fingerprint(p_church uuid, p_host text)
returns text
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
declare
  s text;
begin
  if p_church is null or coalesce(btrim(p_host), '') = '' then return null; end if;
  insert into private.church_fingerprint_salt (church_id) values (p_church)
    on conflict (church_id) do nothing;
  select salt into s from private.church_fingerprint_salt where church_id = p_church;
  -- Shortened, because a Director comparing two rows needs "same or not same",
  -- and a shorter digest is one that cannot be pasted into a rainbow table and
  -- still reads as an identifier on a screen.
  return left(encode(extensions.digest(s || '|' || lower(btrim(p_host)), 'sha256'), 'hex'), 12);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. THE LABEL. What a link is, said in words, without saying which link.
-- ---------------------------------------------------------------------------
--
-- THIS RUNS IN THE DATABASE AND NOT IN THE BROWSER, and that is the whole
-- point of where it lives. A screen that labels a link before sending it is a
-- screen somebody can skip -- a row can be written by anything holding a
-- session. The label is attached by the same transaction that writes the row,
-- so there is no path that produces an unlabelled one.
--
-- WHAT IT DOES NOT DO: it does not ask anybody. There is no reputation service
-- here, deliberately. Sending every link a member shares to a third party to be
-- scored would hand that company the reading habits of a whole congregation,
-- which is a worse breach than the one this file exists to close, and it would
-- do it quietly. These are rules about the SHAPE of an address, and they run
-- entirely inside the church's own database.
--
-- AND IT IS NOT A JUDGEMENT. 'harmful' means "this has the shape of something
-- that harms people". A person decides what it was; the software only decides
-- that somebody should look.
create or replace function private.how_safe(p_url text, out concern text, out label text)
language plpgsql
immutable
set search_path to pg_temp
as $fn$
declare
  raw    text := coalesce(btrim(p_url), '');
  scheme text;
  rest   text;
  host   text;
  path   text;
begin
  concern := 'ordinary';
  label   := 'An ordinary web address';
  if raw = '' then
    label := 'A resource with no address';
    return;
  end if;

  scheme := lower(coalesce(substring(raw from '^([a-zA-Z][a-zA-Z0-9+.-]*):'), ''));

  -- A LINK THAT RUNS INSTEAD OF GOING SOMEWHERE. `javascript:` and `data:` are
  -- not addresses; they are code and content carried in the link itself, and
  -- inside an app that means running in this app's own origin.
  if scheme in ('javascript', 'data', 'vbscript', 'file') then
    concern := 'harmful'; label := 'A link that runs code instead of opening a page'; return;
  end if;

  rest := regexp_replace(raw, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  host := lower(split_part(split_part(split_part(rest, '/', 1), '?', 1), '#', 1));
  path := lower(substring(rest || '/' from position('/' in rest || '/')));

  -- SOMETHING BEFORE THE HOST. `https://faithlife.com@example.tld/` goes to
  -- example.tld and reads as Faithlife to a person. This is the oldest trick
  -- there is and it still works on everybody.
  if position('@' in host) > 0 then
    concern := 'harmful'; label := 'An address disguised as a different one'; return;
  end if;

  host := split_part(host, ':', 1);

  -- A HOST WRITTEN IN LETTERS THAT LOOK LIKE OTHER LETTERS. Punycode is how a
  -- Cyrillic 'a' becomes an English 'a' in a domain name.
  if host like 'xn--%' or host like '%.xn--%' then
    concern := 'harmful'; label := 'A name written to look like another name'; return;
  end if;

  -- A NUMBER INSTEAD OF A NAME. Things people legitimately share have names.
  if host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' or host ~ '^\[[0-9a-f:]+\]$' then
    concern := 'harmful'; label := 'A numbered address with no name behind it'; return;
  end if;

  -- SOMETHING THAT INSTALLS. An app, an installer or a script at the end of a
  -- path is not a page somebody reads.
  if path ~ '\.(exe|apk|msi|scr|bat|cmd|dmg|pkg|jar|vbs|ps1)($|\?|#|/)' then
    concern := 'harmful'; label := 'A file that installs something'; return;
  end if;

  -- ADULT AND GAMBLING, by the words in the host itself. Kept narrow on
  -- purpose: a word list that reaches for cleverness starts flagging Bible
  -- passages, and a record full of false alarms is a record nobody reads.
  if host ~ '(^|\.)(pornhub|xvideos|xnxx|xhamster|onlyfans|redtube|youporn|stripchat|chaturbate)\.'
     or host ~ '(porn|xxx|sexcam|escort)' then
    concern := 'harmful'; label := 'Adult content'; return;
  end if;
  if host ~ '(^|\.)(bet365|1xbet|stake|bovada|pokerstars)\.'
     or host ~ '(casino|betting|sportsbook|jackpot)' then
    concern := 'harmful'; label := 'Gambling'; return;
  end if;

  -- A LINK THAT CANNOT BE SEEN BEFORE IT IS OPENED. A shortener is not itself
  -- wrong; it is the one shape where nobody, including the person sharing it,
  -- can say where it goes.
  if host ~ '^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|ow\.ly|buff\.ly|rebrand\.ly|bit\.do|tiny\.cc)$' then
    concern := 'questionable';
    label := 'A shortened link, so where it goes cannot be seen first';
    return;
  end if;

  -- AN UNPROTECTED CONNECTION. Anything typed into it can be read on the way.
  if scheme = 'http' then
    concern := 'questionable'; label := 'Sent over an unprotected connection'; return;
  end if;

  -- A HOST THAT COSTS NOTHING TO MAKE AND IS THROWN AWAY. Not wrong; worth a
  -- second look when it arrives from somebody you were not expecting it from.
  if host ~ '\.(zip|mov|top|xyz|tk|ml|ga|cf|gq|click|work|link)$' then
    concern := 'questionable'; label := 'A throwaway kind of web address'; return;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. THE RECORD ITSELF: labels in, address out.
-- ---------------------------------------------------------------------------
alter table public.library_activity
  add column if not exists source text not null default 'library',
  add column if not exists concern text not null default 'ordinary',
  add column if not exists label text not null default 'An ordinary web address',
  add column if not exists host_mark text;

-- Rows already here are labelled from the address they still have, so the
-- record does not start blank -- and then the address goes, for those rows too.
update public.library_activity a
   set concern = (private.how_safe(a.address)).concern,
       label = (private.how_safe(a.address)).label,
       host_mark = private.host_fingerprint(
         a.church_id,
         split_part(split_part(regexp_replace(coalesce(a.address, ''), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '/', 1), ':', 1))
 where a.address is not null;

-- AND THIS IS THE LINE THE WHOLE FILE IS FOR. Not a revoke, not a narrowed
-- select: the column is gone, so no function written later can return it by
-- accident and no backup of this table carries it.
alter table public.library_activity drop column if exists address;

alter table public.library_activity
  drop constraint if exists library_activity_source_check,
  add constraint library_activity_source_check
    check (source in ('library', 'pocket'));

alter table public.library_activity
  drop constraint if exists library_activity_concern_check,
  add constraint library_activity_concern_check
    check (concern in ('ordinary', 'questionable', 'harmful'));

alter table public.library_activity
  drop constraint if exists library_activity_action_check;
alter table public.library_activity
  add constraint library_activity_action_check
    check (action in ('added', 'shared', 'pocketed'));

comment on table public.library_activity is
  'What members did with links, for the rank above to read. It holds no address '
  'by design: see 20260917140000. Chat is deliberately not recorded here.';

commit;

begin;

-- ---------------------------------------------------------------------------
-- 4. EVERY WAY A LINK CAN ARRIVE, LABELLED AS IT ARRIVES
-- ---------------------------------------------------------------------------
--
-- ONE HELPER, THREE CALLERS. A Guide adding a resource, a Guide or an Explorer
-- sharing one, and an Explorer putting a web app in their pocket are three
-- different tables and one rule. Writing the rule three times is how two of
-- them end up different a month from now.
create or replace function private.record_activity(
  p_actor uuid, p_action text, p_source text,
  p_title text, p_url text, p_with text, p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
declare
  actor public.profiles%rowtype;
  verdict record;
  host text;
begin
  select * into actor from public.profiles where id = p_actor;
  if actor.id is null or actor.church_id is null then return; end if;

  select * into verdict from private.how_safe(p_url);
  host := split_part(split_part(
            regexp_replace(coalesce(p_url, ''), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
            '/', 1), ':', 1);

  insert into public.library_activity
    (church_id, actor_id, actor_name, actor_role, action, source,
     title, with_name, concern, label, host_mark, occurred_at)
  values
    (actor.church_id, actor.id, coalesce(actor.full_name, 'A member'), actor.role::text,
     p_action, p_source, p_title, p_with,
     verdict.concern, verdict.label,
     private.host_fingerprint(actor.church_id, host),
     coalesce(p_at, now()));

  -- THE ALERT. Only for the loudest label, and that restraint is the feature:
  -- a church whose Directors are told about every ordinary link stops reading
  -- the alerts, and then the one that mattered arrives in a pile of forty.
  if verdict.concern = 'harmful' then
    insert into public.notifications (user_id, type, title, body)
    select leader.id, 'watch',
           'Something needs a look',
           format('%s (%s) %s something labelled: %s. Open the activity record '
                  || 'to see it, and open a case if it should be answered for.',
                  coalesce(actor.full_name, 'A member'),
                  case actor.role::text when 'dm' then 'Guide' when 'ds' then 'Explorer'
                                        when 'admin' then 'Director' else 'Executive Director' end,
                  case p_action when 'shared' then 'shared' when 'pocketed' then 'added to their pocket'
                                else 'added' end,
                  verdict.label)
      from public.profiles leader
     where leader.church_id = actor.church_id
       and leader.role::text in ('admin', 'executive')
       and leader.is_approved
       and leader.id <> actor.id;
  end if;

  perform private.prune_library_activity();
end;
$fn$;

-- A GUIDE ADDS A RESOURCE.
create or replace function private.record_library_add()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
begin
  perform private.record_activity(
    new.added_by, 'added', 'library', new.title, new.external_url, null, new.created_at);
  return new;
end;
$fn$;

-- SOMEBODY SHARES ONE WITH THE PERSON THEY WALK WITH.
create or replace function private.record_library_share()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
declare
  item     public.materials%rowtype;
  other_id uuid;
  other    public.profiles%rowtype;
begin
  select * into item from public.materials where id = new.material_id;
  -- dm_id AND ds_id ARE THE COLUMN NAMES. Guide and Explorer are what the app
  -- calls the people; they have never been what the table calls the columns,
  -- and this function shipped once with the friendly words in it. It is an
  -- AFTER INSERT trigger, so the error did not degrade sharing -- it aborted
  -- the insert, and nobody could share anything at all.
  select case when p.dm_id = new.shared_by then p.ds_id else p.dm_id end
    into other_id
    from public.pairings p where p.id = new.pairing_id;
  select * into other from public.profiles where id = other_id;

  perform private.record_activity(
    new.shared_by, 'shared', 'library',
    coalesce(item.title, 'A resource'), item.external_url,
    coalesce(other.full_name, 'the other person'), new.created_at);
  return new;
end;
$fn$;

-- AN EXPLORER PUTS A WEB APP IN THEIR POCKET.
--
-- THIS IS NEW, and it is the half the owner named that had no record at all.
-- The pocket already refuses social media, which is a PRODUCT rule about
-- distraction. Nothing looked at whether the thing being added was dangerous,
-- and nothing told anybody it had been added.
create or replace function private.record_pocket_add()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $fn$
begin
  perform private.record_activity(
    new.owner_id, 'pocketed', 'pocket',
    coalesce(nullif(btrim(new.label), ''), 'A web app'), new.url, null, new.created_at);
  return new;
end;
$fn$;

drop trigger if exists pocket_apps_activity on public.pocket_apps;
create trigger pocket_apps_activity
  after insert on public.pocket_apps
  for each row execute function private.record_pocket_add();

-- ---------------------------------------------------------------------------
-- 5. WHAT LEADERSHIP READS
-- ---------------------------------------------------------------------------
--
-- TWO CHANGES, AND THE SECOND WAS ASKED FOR IN SO MANY WORDS. There is no
-- address in the returned columns any more, because there is no address in the
-- table. And "Head ED, ED, and Directors can detect the activities of Guide and
-- Explorer" -- so an Executive Director now reads the Guides and the Explorers
-- as well as the Directors, where before they were shown nothing at all below
-- the rank of Director.
--
-- Nobody reads their own row and nobody reads upward: an account that appears
-- in its own oversight has none, and a Director watching an Executive Director
-- is not oversight, it is the chain of authority pointing the wrong way.
drop function if exists public.library_activity_feed(integer);
drop function if exists private.library_activity_feed(integer);

create or replace function private.library_activity_feed(p_limit integer default 100)
returns table (
  id uuid,
  actor_name text,
  actor_role text,
  action text,
  source text,
  title text,
  with_name text,
  concern text,
  label text,
  host_mark text,
  seen_before bigint,
  blocked boolean,
  actor_id uuid,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $fn$
declare
  me public.profiles%rowtype;
  row_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  select profile.* into me from public.profiles as profile
   where profile.id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may read the activity record.' using errcode = '42501';
  end if;

  perform private.prune_library_activity();

  return query
  select
    event.id,
    event.actor_name,
    event.actor_role,
    event.action,
    event.source,
    event.title,
    event.with_name,
    event.concern,
    event.label,
    event.host_mark,
    -- HOW MANY TIMES THIS SITE HAS COME UP FOR THIS PERSON. A Director cannot
    -- be told which site it is; being told it is the fourth time is what turns
    -- a slip into something worth asking about.
    (select count(*) from public.library_activity other
      where other.host_mark is not null
        and other.host_mark = event.host_mark
        and other.actor_id = event.actor_id),
    public.library_blocked(event.actor_id),
    event.actor_id,
    event.occurred_at
  from public.library_activity event
  where public.leads_church(event.church_id)
    and event.actor_id is distinct from me.id
    and (
      (me.role = 'admin'     and event.actor_role in ('dm', 'ds'))
      or (me.role = 'executive' and event.actor_role in ('dm', 'ds', 'admin'))
    )
  order by event.occurred_at desc
  limit row_limit;
end;
$fn$;

create or replace function public.library_activity_feed(p_limit integer default 100)
returns table (
  id uuid,
  actor_name text,
  actor_role text,
  action text,
  source text,
  title text,
  with_name text,
  concern text,
  label text,
  host_mark text,
  seen_before bigint,
  blocked boolean,
  actor_id uuid,
  occurred_at timestamptz
)
language sql
set search_path to public, private, pg_temp
as $$ select * from private.library_activity_feed(p_limit); $$;

revoke all on function public.library_activity_feed(integer) from public, anon;
grant execute on function public.library_activity_feed(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. AND A CASE CAN BE OPENED FROM IT
-- ---------------------------------------------------------------------------
--
-- "Once those inappropriate things happen, Head ED, ED, and Directors can file
-- an open case."
--
-- IT GOES THROUGH `report_person`, the path that already exists, rather than
-- writing a report row directly. Everything a report already does -- who may
-- see it, who may claim it, the record that survives the account -- comes free,
-- and there is one kind of report in the church rather than two.
--
-- THE DETAIL CARRIES THE LABEL AND NOT THE ADDRESS, which is the same rule one
-- step further on. A Director cannot see the link, so a Director cannot put the
-- link in a report, so nothing downstream of this can leak it either.
create or replace function public.open_case_from_activity(p_activity uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to public, private, pg_temp
as $fn$
declare
  me    public.profiles%rowtype;
  event public.library_activity%rowtype;
  said  text;
begin
  select profile.* into me from public.profiles as profile where profile.id = (select auth.uid());
  if me.id is null or not me.is_approved or me.role not in ('admin', 'executive') then
    raise exception 'Only church leadership may open a case from the record.' using errcode = '42501';
  end if;

  select * into event from public.library_activity where id = p_activity;
  if event.id is null or not public.leads_church(event.church_id) then
    raise exception 'That activity is not one you can act on.' using errcode = '42501';
  end if;
  if event.actor_id is null then
    raise exception 'That activity has no one left to answer for it.' using errcode = '42501';
  end if;
  if event.actor_id = me.id then
    raise exception 'You cannot open a case about yourself.' using errcode = '42501';
  end if;
  if not (
    (me.role = 'admin'     and event.actor_role in ('dm', 'ds'))
    or (me.role = 'executive' and event.actor_role in ('dm', 'ds', 'admin'))
  ) then
    raise exception 'That is not somebody you oversee.' using errcode = '42501';
  end if;

  said := format('From the activity record, %s: %s %s "%s", labelled %s.',
                 to_char(event.occurred_at, 'DD Mon YYYY HH24:MI'),
                 case event.actor_role when 'dm' then 'a Guide' when 'ds' then 'an Explorer'
                                       when 'admin' then 'a Director' else 'an Executive Director' end,
                 case event.action when 'shared' then 'shared' when 'pocketed' then 'put in their pocket'
                                   else 'added' end,
                 coalesce(event.title, 'a resource'),
                 event.label);
  if coalesce(btrim(p_note), '') <> '' then
    said := said || E'\n\n' || btrim(p_note);
  end if;

  return public.report_person(
    event.actor_id,
    case when event.concern = 'harmful' then 'unsafe' else 'inappropriate' end,
    said,
    null);
end;
$fn$;

revoke all on function public.open_case_from_activity(uuid, text) from public, anon;
grant execute on function public.open_case_from_activity(uuid, text) to authenticated;

commit;
