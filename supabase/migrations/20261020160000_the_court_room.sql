-- The court room.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR (20 October 2026): a court room for Directors and Executive
-- Directors that works, is simple, has simple advanced settings, holds "one of
-- the highest" securities in the app at its door because it holds some of the
-- most sensitive things a church ever writes down, and has digital forensic and
-- exhibit tools, so evidence is handled the way evidence should be.
--
-- WHAT THIS ADDS, in the order a case meets it:
--
--   1. THE DOOR. Everything in the court room asks for a fresh pass. A Director
--      or an Executive Director needs two-step sign-in and a code typed in the
--      last 30 minutes. Anybody else called to a case needs to have signed in,
--      with a password or a code, in the last 30 minutes. The pass is read from
--      the sign-in token's own record of how and when the person proved who
--      they are (the `amr` claim), which the sign-in service writes and signs;
--      nothing the browser says about itself is consulted. The data API, the
--      live socket and the file store all evaluate the same rule, because the
--      rule lives in the policies and functions rather than in a screen.
--
--   2. A PLACE IN THE ROOM. Reading what was said, and the exhibits, takes a
--      place: called to the case, hearing it, having opened it, or a recorded
--      seat in the gallery. Leadership may still see that a case exists and may
--      take a gallery seat, which is written down, so the case always says who
--      read it.
--
--   3. THE RECORD. Every act in a case -- opened, summoned, a statement, an
--      exhibit, a seat taken, a setting changed, a file opened, the verdict --
--      is appended to a chain in which each entry carries the SHA-256 of the
--      entry before it. Change or remove any entry and every later hash stops
--      matching, which `court_check_record` reports. At the verdict the last
--      hash is kept on the case as its seal.
--
--   4. EXHIBITS. Files and written statements entered as evidence, lettered A,
--      B, C in the order they were entered, each with the SHA-256 of its bytes
--      taken on the device that entered it and checked again on every device
--      that opens it. The files sit in a private bucket with no update and no
--      delete, so an exhibit, once entered, stays as it was entered.
--
--   5. THE RECORD OUTLIVES THE PEOPLE IN IT. A case, what was said in it and
--      who said it stay when an account goes, as the privacy manual says the
--      safeguarding record does ("permanently, deliberately"). Names are kept
--      beside the links for that reason.
--
--   6. A CASE BELONGS TO ITS CHURCH: the church of the person it is about.
--      Anybody summoned to it is of that church, and a report linked to it is
--      that church's report about that person.
--
-- NOTHING HERE DECIDES WHO MAY JUDGE. discipline_check, may_sit_on_trial and
-- the head-judge rule are unchanged and still have one home each.
-- ---------------------------------------------------------------------------

begin;

-- =========================================================== the door ======

/** How long a pass to the court room lasts after the code or password. */
create or replace function private.court_pass_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30 $$;

/**
 * When the caller's pass to the court room runs out, or null if they have none.
 *
 * Leadership's pass is a code from an authenticator app (`totp`) on a token
 * that has finished two-step sign-in (`aal2`). Everybody else's is any proof
 * of identity: a password or a code. Either way it is the time the sign-in
 * service recorded, plus court_pass_minutes(). A refreshed token keeps the time
 * of the proof it was refreshed from, so leaving a phone signed in does not
 * keep the door open.
 */
create or replace function private.court_pass_until()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  leader boolean;
  latest bigint;
begin
  if coalesce(claims ->> 'role', '') <> 'authenticated' or (select auth.uid()) is null then
    return null;
  end if;

  select p.role in ('admin', 'executive') into leader
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_approved
     and p.suspended_at is null;
  if leader is null then
    return null;
  end if;

  if leader and coalesce(claims ->> 'aal', '') <> 'aal2' then
    return null;
  end if;

  select max((e ->> 'timestamp')::bigint) into latest
    from jsonb_array_elements(
           case when jsonb_typeof(claims -> 'amr') = 'array'
                then claims -> 'amr' else '[]'::jsonb end) as e
   where coalesce(e ->> 'timestamp', '') ~ '^[0-9]{1,12}$'
     and (not leader or e ->> 'method' = 'totp');

  if latest is null then
    return null;
  end if;
  return to_timestamp(latest) + make_interval(mins => private.court_pass_minutes());
end;
$$;

create or replace function private.court_door_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.court_pass_until() > now(), false) $$;

/** Refuse, in one sentence the screen recognises, when the door is shut. */
create or replace function private.court_require_door()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.court_door_open() then
    raise exception 'The court room is locked.'
      using errcode = '42501',
            hint = 'Enter your code, or your password, to open the court room.';
  end if;
end;
$$;

/**
 * What the door needs from this person. Answers whether the door is shut or
 * open, so the screen can ask for the right thing; it opens nothing itself.
 */
create or replace function public.court_door()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me       public.profiles%rowtype;
  until_   timestamptz := private.court_pass_until();
  two_step boolean;
  open_    boolean;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    return jsonb_build_object('open', false, 'needs', 'sign_in');
  end if;
  two_step := exists (
    select 1 from auth.mfa_factors f
     where f.user_id = me.id and f.status::text = 'verified');
  open_ := coalesce(until_ > now(), false);
  return jsonb_build_object(
    'open',     open_,
    'until',    until_,
    'minutes',  private.court_pass_minutes(),
    'leader',   me.role in ('admin', 'executive'),
    'two_step', two_step,
    'needs', case
      when open_ then null
      when me.role in ('admin', 'executive') and not two_step then 'two_step'
      when two_step then 'code'
      else 'password'
    end);
end;
$$;

-- ==================================================== the record outlives ==

alter table public.trials add column if not exists opener_name   text;
alter table public.trials add column if not exists judge_name    text;
alter table public.trials add column if not exists gallery_open  boolean not null default true;
alter table public.trials add column if not exists seal_hash     text;
alter table public.trials add column if not exists sealed_at     timestamptz;
alter table public.trials add column if not exists touched_at    timestamptz not null default now();

update public.trials t
   set opener_name = coalesce((select p.full_name from public.profiles p where p.id = t.opened_by), 'Someone')
 where t.opener_name is null;
update public.trials t
   set judge_name = coalesce((select p.full_name from public.profiles p where p.id = t.head_judge_id), 'Someone')
 where t.judge_name is null;

alter table public.trials drop constraint if exists trials_opened_by_fkey;
alter table public.trials
  add constraint trials_opened_by_fkey
  foreign key (opened_by) references public.profiles(id) on delete set null;
alter table public.trials alter column opened_by drop not null;

alter table public.trials drop constraint if exists trials_head_judge_id_fkey;
alter table public.trials
  add constraint trials_head_judge_id_fkey
  foreign key (head_judge_id) references public.profiles(id) on delete set null;
alter table public.trials alter column head_judge_id drop not null;

alter table public.trial_statements add column if not exists author_name text;
alter table public.trial_statements add column if not exists for_person  uuid;
alter table public.trial_statements add column if not exists for_name    text;
alter table public.trial_statements add column if not exists body_sha256 text;

update public.trial_statements s
   set author_name = coalesce((select p.full_name from public.profiles p where p.id = s.author_id), 'Someone')
 where s.author_name is null;
update public.trial_statements s
   set body_sha256 = encode(extensions.digest(s.body, 'sha256'), 'hex')
 where s.body_sha256 is null;

alter table public.trial_statements drop constraint if exists trial_statements_author_id_fkey;
alter table public.trial_statements
  add constraint trial_statements_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.trial_statements alter column author_id drop not null;

-- ============================================================ the record ===

create table if not exists public.court_record (
  trial_id    uuid not null references public.trials(id) on delete cascade,
  seq         integer not null check (seq >= 1),
  at          timestamptz not null,
  at_us       bigint not null,
  -- No link to a profile: an entry must read the same after the person goes,
  -- and a link that turned to null would change what the hash covers.
  actor_id    uuid,
  actor_name  text not null,
  act         text not null check (act in (
                'opened', 'summoned', 'statement', 'statement_for',
                'exhibit', 'exhibit_viewed', 'exhibit_matched', 'exhibit_differed',
                'record_opened', 'record_exported', 'gallery_seat', 'setting',
                'judge_called', 'judge_seated', 'verdict')),
  about       text not null default '',
  detail      text not null default '',
  prev_hash   text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash        text not null check (hash ~ '^[0-9a-f]{64}$'),
  primary key (trial_id, seq)
);

alter table public.court_record enable row level security;

/**
 * Add one entry to a case's record, and return its hash.
 *
 * THE HASH COVERS, in this order, each followed by a newline except the last:
 * the previous entry's hash, the position, the time in microseconds since
 * 1970, the actor's id (or nothing), the actor's name, the act, `about` and
 * `detail`. That string is written down in docs/COURT-ROOM.md so anybody can
 * check a printed record with nothing but a SHA-256 tool. The first entry's
 * "previous hash" is the SHA-256 of "Hope Beacon court record", a newline and
 * the case's id, which ties the chain to its case.
 *
 * Only the court's own functions call this, as their owner. Nobody else may.
 */
create or replace function private.court_append(
  p_trial  uuid,
  p_act    text,
  p_about  text default '',
  p_detail text default '',
  p_actor  uuid default null,
  p_at     timestamptz default null
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, (select auth.uid()));
  v_name  text;
  v_last  public.court_record%rowtype;
  v_seq   integer;
  v_prev  text;
  v_at    timestamptz := coalesce(p_at, clock_timestamp());
  v_us    bigint;
  v_hash  text;
begin
  -- One writer per case at a time, so two people speaking at once cannot both
  -- take the same place in the chain.
  perform 1 from public.trials where id = p_trial for update;
  if not found then
    raise exception 'That case is not here.' using errcode = '42501';
  end if;

  select * into v_last from public.court_record
   where trial_id = p_trial order by seq desc limit 1;

  if v_last.seq is null then
    v_seq  := 1;
    v_prev := encode(extensions.digest(
                'Hope Beacon court record' || chr(10) || p_trial::text, 'sha256'), 'hex');
  else
    v_seq  := v_last.seq + 1;
    v_prev := v_last.hash;
    -- Never earlier than the entry before it.
    if v_at < v_last.at then v_at := v_last.at; end if;
  end if;

  v_us := (extract(epoch from v_at) * 1000000)::bigint;
  v_at := to_timestamp(v_us / 1000000.0);

  v_name := case
    when v_actor is null then 'The app'
    else coalesce((select p.full_name from public.profiles p where p.id = v_actor), 'Someone')
  end;

  v_hash := encode(extensions.digest(
      v_prev || chr(10) ||
      v_seq::text || chr(10) ||
      v_us::text || chr(10) ||
      coalesce(v_actor::text, '') || chr(10) ||
      v_name || chr(10) ||
      p_act || chr(10) ||
      coalesce(p_about, '') || chr(10) ||
      coalesce(p_detail, ''),
      'sha256'), 'hex');

  insert into public.court_record
    (trial_id, seq, at, at_us, actor_id, actor_name, act, about, detail, prev_hash, hash)
  values
    (p_trial, v_seq, v_at, v_us, v_actor, v_name, p_act,
     coalesce(p_about, ''), coalesce(p_detail, ''), v_prev, v_hash);

  -- Wake every screen that has the case open, except for the quiet entries
  -- (somebody reading), which would otherwise wake everybody else to read.
  if p_act not in ('record_opened', 'exhibit_viewed') then
    update public.trials set touched_at = now() where id = p_trial;
  end if;

  return v_hash;
end;
$$;

/** The SHA-256 of a piece of text, as lowercase hex. */
create or replace function private.court_sha256(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_text, ''), 'sha256'), 'hex') $$;

-- ============================================================ who is where ==

/**
 * This person's place in a case, or null: 'judge', the part they were called
 * to ('accused', 'reporter', 'witness'), 'observer' for a gallery seat, or
 * 'opener' for the Director who opened it after an Executive Director took the
 * seat. Asks nothing about the door; the callers do.
 */
create or replace function private.court_place(p_trial uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.head_judge_id = (select auth.uid()) then 'judge'
    when tp.part is not null then tp.part
    when t.opened_by = (select auth.uid()) then 'opener'
    else null
  end
  from public.trials t
  left join public.trial_parties tp
    on tp.trial_id = t.id and tp.person_id = (select auth.uid())
  where t.id = p_trial;
$$;

/** The judge, the Director who opened it, and those in the gallery. */
create or replace function private.court_on_the_bench(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.court_place(p_trial) in ('judge', 'opener', 'observer'), false) $$;

/** In the room at all, through the door. */
create or replace function private.court_in_the_room(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.court_door_open() and private.court_place(p_trial) is not null $$;

/**
 * In this case at all, through the door: a place in the room, or entitled to a
 * gallery seat. Kept under its old name because older functions and policies
 * ask it. The parties branch is unchanged, which is what keeps the person a
 * case is about able to read it and answer it.
 */
create or replace function public.in_trial(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.court_door_open() and (
    exists (
      select 1 from public.trial_parties tp
      where tp.trial_id = p_trial and tp.person_id = (select auth.uid())
    )
    or exists (
      select 1 from public.trials t
      where t.id = p_trial and (select auth.uid()) in (t.head_judge_id, t.opened_by)
    )
    or private.may_sit_on_trial(p_trial)
  );
$$;

-- ================================================================ policies ==

-- The case itself: in the room, or entitled to a gallery seat (which is how a
-- leader sees there is a hearing to watch at all).
drop policy if exists trials_read on public.trials;
create policy trials_read on public.trials
  for select to authenticated
  using (public.in_trial(id));

-- Who is in the case: the room only. The gallery is for the bench to see; a
-- person called to a case sees who else was called, not who is watching.
drop policy if exists trial_parties_read on public.trial_parties;
create policy trial_parties_read on public.trial_parties
  for select to authenticated
  using (
    private.court_in_the_room(trial_id)
    and (part <> 'observer'
         or person_id = (select auth.uid())
         or private.court_on_the_bench(trial_id))
  );

-- What was said: the room only, so reading it takes a recorded place.
drop policy if exists trial_statements_read on public.trial_statements;
create policy trial_statements_read on public.trial_statements
  for select to authenticated
  using (private.court_in_the_room(trial_id));

-- Speaking: as 20260923180000, through the door.
drop policy if exists trial_statements_speak on public.trial_statements;
create policy trial_statements_speak on public.trial_statements
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and private.court_door_open()
    and exists (
      select 1 from public.trials t
      where t.id = trial_statements.trial_id and t.status = 'open'
    )
    and (
      exists (
        select 1 from public.trials t
        where t.id = trial_statements.trial_id and t.head_judge_id = (select auth.uid())
      )
      or exists (
        select 1 from public.trial_parties tp
        where tp.trial_id = trial_statements.trial_id
          and tp.person_id = (select auth.uid())
          and tp.part in ('accused', 'reporter', 'witness')
      )
    )
  );

-- A statement's time, fingerprint and name are the server's. Somebody posting
-- directly names only the case, themselves and what they said.
revoke insert, update, delete on public.trial_statements from anon, authenticated;
grant insert (trial_id, author_id, body) on public.trial_statements to authenticated;

-- The record: the bench reads every entry. Everybody in the room can ask
-- court_check_record whether it holds, which needs no entry shown to them.
drop policy if exists court_record_read on public.court_record;
create policy court_record_read on public.court_record
  for select to authenticated
  using (private.court_door_open() and private.court_on_the_bench(trial_id));

revoke insert, update, delete on public.court_record from anon, authenticated;

/** Stamp a statement as it goes in, whoever sends it. */
create or replace function private.court_statement_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id          := gen_random_uuid();
  new.created_at  := clock_timestamp();
  new.body_sha256 := private.court_sha256(new.body);
  new.author_name := coalesce(
    (select p.full_name from public.profiles p where p.id = new.author_id), 'Someone');
  if new.for_person is not null then
    new.for_name := coalesce(
      (select p.full_name from public.profiles p where p.id = new.for_person), new.for_name, 'Someone');
  end if;
  return new;
end;
$$;

/** And put it on the record. */
create or replace function private.court_statement_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.for_person is null then
    perform private.court_append(new.trial_id, 'statement', new.body_sha256,
      'Statement ' || new.id::text, new.author_id);
  else
    perform private.court_append(new.trial_id, 'statement_for', new.body_sha256,
      'Statement ' || new.id::text || ', said by ' || coalesce(new.for_name, 'Someone')
        || ' and written down by the judge', new.author_id);
  end if;
  return new;
end;
$$;

drop trigger if exists court_statement_stamp on public.trial_statements;
create trigger court_statement_stamp
  before insert on public.trial_statements
  for each row execute function private.court_statement_stamp();

drop trigger if exists court_statement_recorded on public.trial_statements;
create trigger court_statement_recorded
  after insert on public.trial_statements
  for each row execute function private.court_statement_recorded();

-- ================================================================ exhibits ==

create table if not exists public.court_exhibits (
  id            uuid primary key default gen_random_uuid(),
  trial_id      uuid not null references public.trials(id) on delete cascade,
  label         text,
  kind          text not null check (kind in ('file', 'writing')),
  title         text not null check (length(btrim(title)) between 1 and 200),
  note          text check (note is null or length(note) <= 2000),
  file_name     text check (file_name is null or length(file_name) between 1 and 200),
  mime          text check (mime is null or length(mime) <= 120),
  size_bytes    bigint check (size_bytes is null or size_bytes between 1 and 26214400),
  writing       text check (writing is null or length(btrim(writing)) between 1 and 20000),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  path          text unique,
  shown_to      text not null default 'everyone' check (shown_to in ('everyone', 'bench')),
  -- No link to a profile, for the same reason as the record.
  entered_by    uuid,
  entered_name  text not null default 'Someone',
  entered_at    timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'entered')),
  constraint court_exhibits_shape check (
    (kind = 'file' and path is not null and file_name is not null
                   and size_bytes is not null and writing is null)
    or (kind = 'writing' and writing is not null and path is null)
  ),
  constraint court_exhibits_lettered_when_entered check ((status = 'entered') = (label is not null))
);

create unique index if not exists court_exhibits_label
  on public.court_exhibits (trial_id, label) where label is not null;
create index if not exists court_exhibits_by_trial
  on public.court_exhibits (trial_id, entered_at);

alter table public.court_exhibits enable row level security;

/** May this person see this exhibit? In the room, and bench-only stays with the bench. */
create or replace function private.court_may_see_exhibit(p_exhibit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.court_exhibits e
     where e.id = p_exhibit
       and e.status = 'entered'
       and private.court_in_the_room(e.trial_id)
       and (e.shown_to = 'everyone' or private.court_on_the_bench(e.trial_id))
  );
$$;

drop policy if exists court_exhibits_read on public.court_exhibits;
create policy court_exhibits_read on public.court_exhibits
  for select to authenticated
  using (private.court_may_see_exhibit(id));

-- No insert, update or delete policy: exhibits go in through the functions
-- below and are never changed afterwards.
revoke insert, update, delete on public.court_exhibits from anon, authenticated;

-- The file store. Private, 25 MB a file, and only the kinds of file the court
-- room can show safely: pictures, PDF, sound, video and plain text. Nothing
-- that a browser would run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'court-exhibits',
  'court-exhibits',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'application/pdf',
        'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/aac',
        'video/mp4', 'video/quicktime', 'video/webm',
        'text/plain']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/** May this person put something before the court? The judge, and those called to it. */
create or replace function private.court_may_present(p_trial uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.court_door_open()
     and exists (select 1 from public.trials t where t.id = p_trial and t.status = 'open')
     and coalesce(private.court_place(p_trial) in ('judge', 'accused', 'reporter', 'witness'), false);
$$;

/**
 * Is an exhibit this person began waiting for a file at this place?
 *
 * Asked by the upload rule. A definer, because a waiting exhibit is not yet
 * readable by anybody -- the read rule shows only entered ones -- so a plain
 * subquery in the policy would never find it.
 */
create or replace function private.court_file_awaited(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.court_door_open() and exists (
    select 1 from public.court_exhibits e
     where e.path = p_name
       and e.kind = 'file'
       and e.status = 'pending'
       and e.entered_by = (select auth.uid())
       and private.court_may_present(e.trial_id)
  );
$$;

/**
 * May this person read the file at this place? Whoever may see its exhibit,
 * and the person uploading it while it waits, which some file stores ask for
 * as part of the upload itself.
 */
create or replace function private.court_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.court_exhibits e
     where e.path = p_name
       and (private.court_may_see_exhibit(e.id)
            or (e.status = 'pending' and e.entered_by = (select auth.uid())
                and private.court_door_open()))
  );
$$;

-- Uploading: only to the place an exhibit the uploader began is waiting for.
drop policy if exists court_exhibit_upload on storage.objects;
create policy court_exhibit_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'court-exhibits' and private.court_file_awaited(name));

-- Reading: whoever may see the exhibit. No update and no delete policy.
drop policy if exists court_exhibit_read on storage.objects;
create policy court_exhibit_read on storage.objects
  for select to authenticated
  using (bucket_id = 'court-exhibits' and private.court_file_readable(name));

/** Exhibit letters: A to Z, then AA, AB, and so on. */
create or replace function private.court_letter(p_n integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n   integer := p_n;
  out text := '';
begin
  if n < 1 then return 'A'; end if;
  while n > 0 loop
    out := chr(65 + ((n - 1) % 26)) || out;
    n := (n - 1) / 26;
  end loop;
  return out;
end;
$$;


/** Give the next free letter to an exhibit, put it on the record, and return the letter. */
create or replace function private.court_enter_exhibit(p_exhibit uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e      public.court_exhibits%rowtype;
  letter text;
begin
  select * into e from public.court_exhibits where id = p_exhibit;
  -- The case row is locked by court_append; take it first so two exhibits
  -- entered at once cannot be given the same letter.
  perform 1 from public.trials where id = e.trial_id for update;
  letter := private.court_letter(
    (select count(*)::integer + 1 from public.court_exhibits x
      where x.trial_id = e.trial_id and x.status = 'entered'));
  update public.court_exhibits
     set status = 'entered', label = letter, entered_at = clock_timestamp()
   where id = p_exhibit;
  perform private.court_append(e.trial_id, 'exhibit', e.sha256,
    'Exhibit ' || letter || ': ' || e.title
      || case when e.kind = 'file'
              then ' (' || e.file_name || ', ' || e.size_bytes::text || ' bytes, '
                   || coalesce(e.mime, 'unknown type') || ')'
              else ' (written)' end
      || case when e.shown_to = 'bench' then ', shown to the judge and the gallery only' else '' end,
    e.entered_by);
  return letter;
end;
$$;

/**
 * Begin entering a file as an exhibit. Returns where to upload it.
 *
 * The SHA-256 is taken on the device before the upload, and recorded here
 * before the file exists, so the fingerprint is on the record before the bytes
 * it describes are in anybody else's hands.
 */
create or replace function public.court_exhibit_begin(
  p_trial     uuid,
  p_title     text,
  p_file_name text,
  p_mime      text,
  p_size      bigint,
  p_sha256    text,
  p_note      text default null,
  p_shown_to  text default 'everyone'
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_path text;
begin
  perform private.court_require_door();
  if not private.court_may_present(p_trial) then
    raise exception 'Only the judge and the people called to this case can enter an exhibit.'
      using errcode = '42501';
  end if;
  if p_sha256 is null or lower(p_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'The file''s fingerprint is missing. Choose the file again.';
  end if;
  if p_size is null or p_size < 1 or p_size > 26214400 then
    raise exception 'An exhibit can be up to 25 MB.';
  end if;
  if (select count(*) from public.court_exhibits
       where trial_id = p_trial and entered_by = (select auth.uid()) and status = 'pending') >= 10 then
    raise exception 'Finish the exhibits already started before adding more.';
  end if;

  v_path := p_trial::text || '/' || v_id::text;
  insert into public.court_exhibits
    (id, trial_id, kind, title, note, file_name, mime, size_bytes, sha256, path,
     shown_to, entered_by, entered_name)
  values
    (v_id, p_trial, 'file', btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
     left(btrim(coalesce(p_file_name, 'file')), 200), nullif(btrim(coalesce(p_mime, '')), ''),
     p_size, lower(p_sha256), v_path,
     case when p_shown_to = 'bench' then 'bench' else 'everyone' end,
     (select auth.uid()),
     coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), 'Someone'));

  return jsonb_build_object('id', v_id, 'bucket', 'court-exhibits', 'path', v_path);
end;
$$;

/** The file is up: check it is there and the size the device said, then letter it. */
create or replace function public.court_exhibit_seal(p_exhibit uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e      public.court_exhibits%rowtype;
  stored bigint;
begin
  perform private.court_require_door();
  select * into e from public.court_exhibits where id = p_exhibit;
  if e.id is null or e.entered_by is distinct from (select auth.uid()) or e.status <> 'pending' then
    raise exception 'That exhibit is not waiting for you.' using errcode = '42501';
  end if;
  if not private.court_may_present(e.trial_id) then
    raise exception 'This case is no longer taking exhibits.' using errcode = '42501';
  end if;

  select coalesce((o.metadata ->> 'size')::bigint, -1) into stored
    from storage.objects o
   where o.bucket_id = 'court-exhibits' and o.name = e.path;
  if stored is null then
    raise exception 'The file has not arrived yet. Try again.';
  end if;
  if stored >= 0 and stored <> e.size_bytes then
    raise exception 'The file that arrived is not the size of the one chosen. Choose it again.';
  end if;

  return private.court_enter_exhibit(p_exhibit);
end;
$$;

/** Enter something written as an exhibit: a transcript, a message copied out, a note. */
create or replace function public.court_exhibit_write(
  p_trial    uuid,
  p_title    text,
  p_writing  text,
  p_note     text default null,
  p_shown_to text default 'everyone'
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  perform private.court_require_door();
  if not private.court_may_present(p_trial) then
    raise exception 'Only the judge and the people called to this case can enter an exhibit.'
      using errcode = '42501';
  end if;
  insert into public.court_exhibits
    (id, trial_id, kind, title, note, writing, sha256, shown_to, entered_by, entered_name)
  values
    (v_id, p_trial, 'writing', btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
     p_writing, private.court_sha256(p_writing),
     case when p_shown_to = 'bench' then 'bench' else 'everyone' end,
     (select auth.uid()),
     coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), 'Someone'));
  return private.court_enter_exhibit(v_id);
end;
$$;

/**
 * Somebody opened an exhibit, or checked its fingerprint. 'viewed' and
 * 'matched' are written once per person per exhibit per pass, so reopening a
 * photo does not fill the record; 'differed' every time, and a difference is
 * told to the judge at once.
 */
create or replace function public.court_exhibit_handled(p_exhibit uuid, p_what text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e   public.court_exhibits%rowtype;
  v_act text;
begin
  perform private.court_require_door();
  select * into e from public.court_exhibits where id = p_exhibit;
  if e.id is null or not private.court_may_see_exhibit(p_exhibit) then
    raise exception 'That exhibit is not one you can see.' using errcode = '42501';
  end if;
  v_act := case p_what when 'viewed' then 'exhibit_viewed'
                     when 'matched' then 'exhibit_matched'
                     when 'differed' then 'exhibit_differed' end;
  if v_act is null then
    raise exception 'Say viewed, matched or differed.';
  end if;

  if v_act in ('exhibit_viewed', 'exhibit_matched') and exists (
    select 1 from public.court_record r
     where r.trial_id = e.trial_id and r.act = v_act
       and r.actor_id = (select auth.uid()) and r.about = e.id::text
       and r.at > now() - make_interval(mins => private.court_pass_minutes())
  ) then
    return;
  end if;

  perform private.court_append(e.trial_id, v_act, e.id::text,
    'Exhibit ' || e.label || ': ' || e.title
      || case v_act when 'exhibit_matched' then ', fingerprint matches the record'
                  when 'exhibit_differed' then ', fingerprint DOES NOT match the record'
                  else '' end);

  if v_act = 'exhibit_differed' then
    insert into public.notifications (user_id, type, title, body)
    select t.head_judge_id, 'trial', 'An exhibit did not match its fingerprint',
           'Exhibit ' || e.label || ' was checked on a device and its bytes were not the ones recorded. Open the case.'
      from public.trials t
     where t.id = e.trial_id and t.head_judge_id is not null;
  end if;
end;
$$;

-- ============================================================ the hearing ==

/** Say something in a case. The same rule as the insert policy, with plain refusals. */
create or replace function public.court_say(p_trial uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.court_require_door();
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'Write what you want to say first.';
  end if;
  if not exists (select 1 from public.trials t where t.id = p_trial and t.status = 'open') then
    raise exception 'This case is closed.';
  end if;
  if coalesce(private.court_place(p_trial) not in ('judge', 'accused', 'reporter', 'witness'), true) then
    raise exception 'Only the judge and the people called to this case speak in it.'
      using errcode = '42501';
  end if;
  insert into public.trial_statements (trial_id, author_id, body)
  values (p_trial, (select auth.uid()), p_body)
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * The judge writes down what somebody said, for somebody who cannot type it
 * themselves: a person whose account is suspended, somebody who answered in
 * person or by phone. It is recorded as said by them and written by the judge,
 * never as if they had typed it.
 */
create or replace function public.court_record_for(p_trial uuid, p_person uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.court_require_door();
  if coalesce(private.court_place(p_trial), '') <> 'judge' then
    raise exception 'Only the judge writes down what somebody said.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trials t where t.id = p_trial and t.status = 'open') then
    raise exception 'This case is closed.';
  end if;
  if not exists (
    select 1 from public.trial_parties tp
     where tp.trial_id = p_trial and tp.person_id = p_person
       and tp.part in ('accused', 'reporter', 'witness')
  ) then
    raise exception 'Only somebody called to this case can be recorded in it.';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'Write what they said first.';
  end if;
  insert into public.trial_statements (trial_id, author_id, body, for_person)
  values (p_trial, (select auth.uid()), p_body, p_person)
  returning id into v_id;
  return v_id;
end;
$$;

/** Call a witness: a member of the case's church, told at once. */
create or replace function public.court_summon(p_trial uuid, p_person uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t      public.trials%rowtype;
  person public.profiles%rowtype;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge calls a witness.';
  end if;
  if t.status <> 'open' then return 'This case is closed.'; end if;
  select * into person from public.profiles where id = p_person;
  if person.id is null or person.church_id is distinct from t.church_id
     or not person.is_approved or person.suspended_at is not null then
    return 'That person is not a member of this church who can be called.';
  end if;
  if person.id = t.head_judge_id then
    return 'The judge cannot also be a witness.';
  end if;
  if exists (select 1 from public.trial_parties tp
              where tp.trial_id = p_trial and tp.person_id = p_person) then
    return 'They are already in this case.';
  end if;

  insert into public.trial_parties (trial_id, person_id, part)
  values (p_trial, p_person, 'witness');

  insert into public.notifications (user_id, type, title, body)
  values (p_person, 'trial', 'You have been called to a trial room',
          'A Director has opened a case and asked to hear from you.');

  perform private.court_append(p_trial, 'summoned', p_person::text,
    coalesce(person.full_name, 'Someone') || ' called as a witness');
  return 'ok';
end;
$$;

/** Open or close the gallery. Closed: nobody new may take a seat; those seated stay on the record. */
create or replace function public.court_gallery(p_trial uuid, p_open boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.trials%rowtype;
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  if t.id is null or coalesce(private.court_place(p_trial), '') <> 'judge' then
    return 'Only the judge decides who may watch.';
  end if;
  if t.status <> 'open' then return 'This case is closed.'; end if;
  if t.gallery_open = coalesce(p_open, true) then return 'ok'; end if;
  update public.trials set gallery_open = coalesce(p_open, true) where id = p_trial;
  perform private.court_append(p_trial, 'setting', '',
    case when coalesce(p_open, true) then 'Gallery opened: leadership may watch'
         else 'Gallery closed: heard in private from now on' end);
  return 'ok';
end;
$$;

/** The record was printed or saved. Written down, because a copy left the room. */
create or replace function public.court_exported(p_trial uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.court_require_door();
  if private.court_place(p_trial) is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  perform private.court_append(p_trial, 'record_exported', '', 'A copy of the record was saved');
end;
$$;

/**
 * Does the record hold? Walks the chain from the first entry, recomputing every
 * hash, and checks each statement and exhibit against the fingerprint the
 * record took of it. Anybody in the room may ask; the answer names no entry
 * they are not allowed to read.
 */
create or replace function public.court_check_record(p_trial uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  entry   public.court_record%rowtype;
  prev    text;
  want    text;
  n       integer := 0;
  broken  integer;
  bad_statements integer;
  bad_exhibits   integer;
  t       public.trials%rowtype;
begin
  perform private.court_require_door();
  if private.court_place(p_trial) is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  select * into t from public.trials where id = p_trial;

  prev := encode(extensions.digest('Hope Beacon court record' || chr(10) || p_trial::text, 'sha256'), 'hex');
  for entry in select * from public.court_record where trial_id = p_trial order by seq loop
    n := n + 1;
    want := encode(extensions.digest(
        prev || chr(10) || entry.seq::text || chr(10) || entry.at_us::text || chr(10) ||
        coalesce(entry.actor_id::text, '') || chr(10) || entry.actor_name || chr(10) ||
        entry.act || chr(10) || entry.about || chr(10) || entry.detail, 'sha256'), 'hex');
    if entry.seq <> n or entry.prev_hash <> prev or entry.hash <> want then
      broken := entry.seq;
      exit;
    end if;
    prev := entry.hash;
  end loop;

  -- Every statement is on the record with its own fingerprint, and still says
  -- what it said when it was recorded.
  select count(*) into bad_statements
    from public.trial_statements s
   where s.trial_id = p_trial
     and (s.body_sha256 is distinct from private.court_sha256(s.body)
          or not exists (
            select 1 from public.court_record r
             where r.trial_id = p_trial
               and r.act in ('statement', 'statement_for')
               and r.about = s.body_sha256
               and r.detail like 'Statement ' || s.id::text || '%'));

  select count(*) into bad_exhibits
    from public.court_exhibits e
   where e.trial_id = p_trial and e.status = 'entered'
     and ((e.kind = 'writing' and e.sha256 <> private.court_sha256(e.writing))
          or not exists (
            select 1 from public.court_record r
             where r.trial_id = p_trial and r.act = 'exhibit'
               and r.about = e.sha256
               and r.detail like 'Exhibit ' || e.label || ':%'));

  return jsonb_build_object(
    'holds',      broken is null and bad_statements = 0 and bad_exhibits = 0,
    'entries',    n,
    'head',       prev,
    'broken_at',  broken,
    'statements_differing', bad_statements,
    'exhibits_differing',   bad_exhibits,
    'seal',       t.seal_hash,
    'seal_holds', t.seal_hash is null or exists (
                    select 1 from public.court_record r
                     where r.trial_id = p_trial and r.hash = t.seal_hash and r.act = 'verdict'));
end;
$$;

-- ======================================================= the case, in full ==

/** Every case this person may see, with what they may do in it. Through the door. */
create or replace function public.court_cases()
returns table (
  id            uuid,
  summary       text,
  status        text,
  verdict       text,
  verdict_note  text,
  opened_at     timestamptz,
  closed_at     timestamptz,
  subject_name  text,
  subject_role  text,
  opener_name   text,
  judge_name    text,
  escalation    text,
  gallery_open  boolean,
  seal_hash     text,
  my_place      text,
  may_watch     boolean,
  watching      bigint,
  exhibits      bigint,
  statements    bigint,
  touched_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i_lead boolean;
begin
  perform private.court_require_door();
  select p.role in ('admin', 'executive') into i_lead
    from public.profiles p where p.id = (select auth.uid());

  return query
  select t.id, t.summary, t.status, t.verdict, t.verdict_note, t.opened_at, t.closed_at,
         coalesce(t.subject_name, s.full_name, 'Someone'),
         case when i_lead then s.role::text else null end,
         coalesce(o.full_name, t.opener_name, 'Someone'),
         coalesce(j.full_name, t.judge_name, 'Someone'),
         case when i_lead then t.escalation else null end,
         t.gallery_open,
         t.seal_hash,
         private.court_place(t.id),
         private.court_place(t.id) is null and t.status = 'open' and t.gallery_open,
         case when i_lead then (select count(*) from public.trial_parties tp
                                 where tp.trial_id = t.id and tp.part = 'observer') else null end,
         (select count(*) from public.court_exhibits e
           where e.trial_id = t.id and e.status = 'entered'
             and (e.shown_to = 'everyone' or private.court_on_the_bench(t.id))),
         (select count(*) from public.trial_statements st where st.trial_id = t.id),
         t.touched_at
    from public.trials t
    left join public.profiles s on s.id = t.subject_id
    left join public.profiles o on o.id = t.opened_by
    left join public.profiles j on j.id = t.head_judge_id
   where private.court_place(t.id) is not null or private.may_sit_on_trial(t.id)
   order by t.status = 'open' desc, t.touched_at desc;
end;
$$;

/**
 * One case, as the person asking may see it. Opening it is written on the
 * record once per pass, so the record says who read it.
 */
create or replace function public.court_case(p_trial uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t      public.trials%rowtype;
  place  text;
  bench  boolean;
  i_lead boolean;
  me     uuid := (select auth.uid());
begin
  perform private.court_require_door();
  select * into t from public.trials where id = p_trial;
  place := private.court_place(p_trial);
  if t.id is null or place is null then
    raise exception 'That case is not one you are in.' using errcode = '42501';
  end if;
  bench := place in ('judge', 'opener', 'observer');
  select p.role in ('admin', 'executive') into i_lead from public.profiles p where p.id = me;

  if not exists (
    select 1 from public.court_record r
     where r.trial_id = p_trial and r.act = 'record_opened' and r.actor_id = me
       and r.at > now() - make_interval(mins => private.court_pass_minutes())
  ) then
    perform private.court_append(p_trial, 'record_opened', '', 'Opened the case');
  end if;

  return jsonb_build_object(
    'case', jsonb_build_object(
      'id', t.id, 'summary', t.summary, 'status', t.status,
      'verdict', t.verdict, 'verdict_note', t.verdict_note,
      'opened_at', t.opened_at, 'closed_at', t.closed_at,
      'subject_id', t.subject_id,
      'subject_name', coalesce(t.subject_name, 'Someone'),
      'opener_name', coalesce((select p.full_name from public.profiles p where p.id = t.opened_by), t.opener_name, 'Someone'),
      'judge_id', t.head_judge_id,
      'judge_name', coalesce((select p.full_name from public.profiles p where p.id = t.head_judge_id), t.judge_name, 'Someone'),
      'escalation', case when i_lead then t.escalation else null end,
      'gallery_open', t.gallery_open,
      'seal_hash', t.seal_hash, 'sealed_at', t.sealed_at,
      'my_place', place,
      'i_lead', coalesce(i_lead, false),
      'may_speak', t.status = 'open' and place in ('judge', 'accused', 'reporter', 'witness'),
      'may_present', t.status = 'open' and place in ('judge', 'accused', 'reporter', 'witness'),
      'may_decide', t.status = 'open' and place = 'judge'),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', tp.person_id,
               'name', coalesce(p.full_name, 'Someone'),
               'part', tp.part,
               'since', tp.summoned_at) order by tp.summoned_at)
        from public.trial_parties tp
        left join public.profiles p on p.id = tp.person_id
       where tp.trial_id = p_trial and (tp.part <> 'observer' or bench)), '[]'::jsonb),
    'statements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'author_id', s.author_id,
               'author_name', coalesce(s.author_name, 'Someone'),
               'for_name', s.for_name,
               'body', s.body,
               'sha256', s.body_sha256,
               'at', s.created_at) order by s.created_at, s.id)
        from public.trial_statements s
       where s.trial_id = p_trial), '[]'::jsonb),
    'exhibits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'label', e.label, 'kind', e.kind, 'title', e.title,
               'note', e.note, 'file_name', e.file_name, 'mime', e.mime,
               'size_bytes', e.size_bytes, 'writing', e.writing,
               'sha256', e.sha256, 'path', e.path, 'shown_to', e.shown_to,
               'entered_name', e.entered_name, 'entered_at', e.entered_at)
             order by e.entered_at)
        from public.court_exhibits e
       where e.trial_id = p_trial and e.status = 'entered'
         and (e.shown_to = 'everyone' or bench)), '[]'::jsonb),
    'record', case when bench then coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', r.seq, 'at', r.at, 'at_us', r.at_us,
               'actor_id', r.actor_id, 'actor_name', r.actor_name,
               'act', r.act, 'about', r.about, 'detail', r.detail,
               'prev_hash', r.prev_hash, 'hash', r.hash) order by r.seq)
        from public.court_record r
       where r.trial_id = p_trial), '[]'::jsonb) else null end);
end;
$$;

-- ================================================ the acts, through the door ==

/**
 * Open a case. As 0028, with the case placed in the church of the person it
 * is about, the other side and any linked report checked against that church
 * and that person, and the opening put on the record.
 */
create or replace function public.open_trial(
  p_subject uuid,
  p_summary text,
  p_report  uuid default null,
  p_other   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  me      public.profiles%rowtype;
  subject public.profiles%rowtype;
  other_  public.profiles%rowtype;
  allowed text;
  t_id    uuid;
  r       record;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved or me.suspended_at is not null then
    raise exception 'Your account cannot open a trial.';
  end if;
  if me.role not in ('admin', 'executive') then
    raise exception 'Only a Director or an Executive Director can open a trial.';
  end if;
  perform private.court_require_door();
  if btrim(coalesce(p_summary, '')) = '' then
    raise exception 'Say what the case is about.';
  end if;
  if length(btrim(p_summary)) > 2000 then
    raise exception 'Say what the case is about in 2000 characters or fewer.';
  end if;

  allowed := public.discipline_check(p_subject);
  if allowed <> 'ok' then raise exception '%', allowed; end if;

  select * into subject from public.profiles where id = p_subject;
  if subject.church_id is null then
    raise exception 'That person is not in a church.';
  end if;

  if p_other is not null and p_other <> p_subject and p_other <> me.id then
    select * into other_ from public.profiles where id = p_other;
    if other_.id is null or other_.church_id is distinct from subject.church_id
       or not other_.is_approved then
      raise exception 'The other person must be a member of the same church.';
    end if;
  end if;

  if p_report is not null and not exists (
    select 1 from public.reports rp
     where rp.id = p_report and rp.church_id = subject.church_id
       and rp.subject_id = p_subject and rp.status = 'open'
  ) then
    raise exception 'That report is not an open report about this person.';
  end if;

  insert into public.trials (church_id, opened_by, head_judge_id, report_id,
                             subject_id, subject_name, summary, opener_name, judge_name)
  values (subject.church_id, me.id, me.id, p_report,
          p_subject, coalesce(subject.full_name, 'Someone'), btrim(p_summary),
          coalesce(me.full_name, 'Someone'), coalesce(me.full_name, 'Someone'))
  returning id into t_id;

  perform private.court_append(t_id, 'opened', private.court_sha256(btrim(p_summary)),
    'Case opened about ' || coalesce(subject.full_name, 'Someone'));

  insert into public.trial_parties (trial_id, person_id, part)
  values (t_id, p_subject, 'accused');

  if other_.id is not null then
    insert into public.trial_parties (trial_id, person_id, part)
    values (t_id, other_.id, 'reporter')
    on conflict do nothing;
  elsif p_report is not null then
    insert into public.trial_parties (trial_id, person_id, part)
    select t_id, rp.reporter_id, 'reporter'
      from public.reports rp
     where rp.id = p_report and rp.reporter_id <> p_subject and rp.reporter_id <> me.id
    on conflict do nothing;
  end if;

  for r in
    select tp.person_id, tp.part, coalesce(p.full_name, 'Someone') as name
      from public.trial_parties tp
      left join public.profiles p on p.id = tp.person_id
     where tp.trial_id = t_id
     order by tp.part
  loop
    perform private.court_append(t_id, 'summoned', r.person_id::text,
      r.name || ' called as ' || case r.part when 'accused' then 'the person the case is about'
                                             when 'reporter' then 'the person who raised it'
                                             else 'a witness' end);
  end loop;

  insert into public.notifications (user_id, type, title, body)
  select tp.person_id, 'trial', 'You have been called to a trial room',
         case when tp.part = 'accused'
              then 'A Director has opened a case and you are asked to answer it.'
              else 'A Director has opened a case and asked to hear from you.'
         end
  from public.trial_parties tp
  where tp.trial_id = t_id;

  return t_id;
end;
$fn$;

/** A Director asks for an Executive Director. As 0024, through the door and on the record. */
create or replace function public.call_head_judge(p_trial uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare t public.trials%rowtype;
begin
  if not private.court_door_open() then return 'The court room is locked.'; end if;
  select * into t from public.trials where id = p_trial;
  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if t.head_judge_id is distinct from (select auth.uid()) then
    return 'Only the head judge of this case can call for an Executive Director.';
  end if;
  if t.escalation = 'accepted' then
    return 'An Executive Director is already the head judge here.';
  end if;

  update public.trials
     set escalation = 'requested', escalated_at = now()
   where id = p_trial;

  insert into public.notifications (user_id, type, title, body)
  select p.id, 'trial', 'A Director has asked you to judge a case',
         'You can take the seat as head judge, or leave it and the Director will decide it.'
  from public.profiles p
  where p.role = 'executive'
    and p.is_approved
    and p.suspended_at is null
    and p.id <> (select auth.uid())
    and p.id is distinct from t.subject_id
    and (p.church_id = t.church_id
         or exists (select 1 from public.church_executives ce
                    where ce.executive_id = p.id and ce.church_id = t.church_id));

  perform private.court_append(p_trial, 'judge_called', '', 'Asked for another judge to take the seat');
  return 'ok';
end;
$$;

/**
 * An Executive Director takes the seat: when asked, or when the judge's
 * account has gone and the case would otherwise have nobody to decide it.
 */
create or replace function public.take_head_judge(p_trial uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  t  public.trials%rowtype;
  me public.profiles%rowtype;
begin
  if not private.court_door_open() then return 'The court room is locked.'; end if;
  select * into t  from public.trials where id = p_trial;
  select * into me from public.profiles where id = (select auth.uid());

  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if me.id is null or not me.is_approved or me.suspended_at is not null or me.role <> 'executive' then
    return 'Only an Executive Director can take the seat.';
  end if;
  if me.church_id is distinct from t.church_id
     and not exists (select 1 from public.church_executives ce
                     where ce.executive_id = me.id and ce.church_id = t.church_id) then
    return 'That case is not in a church you oversee.';
  end if;
  if t.escalation <> 'requested' and t.head_judge_id is not null then
    return 'Nobody has asked for an Executive Director on this case.';
  end if;
  if t.subject_id = me.id then
    return 'You cannot judge a case about yourself.';
  end if;
  if exists (select 1 from public.trial_parties tp
              where tp.trial_id = p_trial and tp.person_id = me.id
                and tp.part in ('accused', 'reporter', 'witness')) then
    return 'You are called to this case, so you cannot judge it.';
  end if;

  update public.trials
     set head_judge_id = me.id, escalation = 'accepted',
         judge_name = coalesce(me.full_name, 'Someone')
   where id = p_trial;
  -- A seat in the gallery is not needed by the judge.
  delete from public.trial_parties
   where trial_id = p_trial and person_id = me.id and part = 'observer';

  if t.opened_by is not null then
    insert into public.notifications (user_id, type, title, body)
    values (t.opened_by, 'trial', 'An Executive Director took your case',
            coalesce(me.full_name, 'An Executive Director') || ' is now head judge.');
  end if;

  perform private.court_append(p_trial, 'judge_seated', '', 'Took the seat as judge');
  return 'ok';
end;
$$;

/** Decide the case. As 0024, through the door, on the record, and sealed. */
create or replace function public.close_trial(
  p_trial   uuid,
  p_verdict text,
  p_note    text default null
)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  t      public.trials%rowtype;
  result text;
  seal   text;
begin
  if not private.court_door_open() then return 'The court room is locked.'; end if;
  select * into t from public.trials where id = p_trial;
  if t.id is null then return 'That case is not here.'; end if;
  if t.status <> 'open' then return 'That case is already closed.'; end if;
  if t.head_judge_id is distinct from (select auth.uid()) then
    return 'Only the head judge can decide this case.';
  end if;
  if p_verdict not in ('dismissed', 'suspended', 'removed') then
    return 'A case ends dismissed, suspended or removed.';
  end if;

  if p_verdict = 'suspended' then
    result := public.suspend_member(t.subject_id, coalesce(p_note, t.summary));
    if result <> 'ok' then return result; end if;
  elsif p_verdict = 'removed' then
    result := public.remove_member_by_leader(t.subject_id);
    if result <> 'ok' then return result; end if;
  end if;

  seal := private.court_append(p_trial, 'verdict',
    private.court_sha256(p_verdict || chr(10) || coalesce(btrim(p_note), '')),
    'Verdict: ' || p_verdict
      || coalesce(' -- ' || nullif(btrim(coalesce(p_note, '')), ''), ''));

  update public.trials
     set status = 'closed', verdict = p_verdict,
         verdict_note = nullif(btrim(coalesce(p_note, '')), ''),
         closed_at = now(),
         seal_hash = seal, sealed_at = now()
   where id = p_trial;

  if t.report_id is not null then
    update public.reports
       set status = case when p_verdict = 'dismissed' then 'dismissed' else 'actioned' end,
           decided_by = (select auth.uid()),
           decided_at = now(),
           outcome = 'Trial: ' || p_verdict
     where id = t.report_id and status = 'open' and church_id = t.church_id;
  end if;

  if p_verdict <> 'removed' then
    insert into public.notifications (user_id, type, title, body)
    select tp.person_id, 'trial', 'The trial room reached a decision',
           'The case was ' || p_verdict || '.'
    from public.trial_parties tp
    where tp.trial_id = p_trial and tp.part <> 'observer';
  end if;

  return 'ok';
end;
$$;

/** Watch a hearing. As 20260916130000, through the door, while the gallery is open, on the record. */
create or replace function public.join_trial(p_trial uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me public.profiles%rowtype;
begin
  perform private.court_require_door();
  select * into me from public.profiles where id = (select auth.uid());
  if not private.may_sit_on_trial(p_trial) then
    raise exception 'That hearing is not yours to watch.';
  end if;
  if exists (select 1 from public.trial_parties tp where tp.trial_id = p_trial and tp.person_id = me.id)
     or exists (select 1 from public.trials t where t.id = p_trial and me.id in (t.head_judge_id, t.opened_by)) then
    return;
  end if;
  if not exists (select 1 from public.trials t where t.id = p_trial and t.gallery_open and t.status = 'open') then
    raise exception 'This hearing is being heard in private.';
  end if;
  insert into public.trial_parties (trial_id, person_id, part)
  values (p_trial, me.id, 'observer')
  on conflict (trial_id, person_id) do nothing;
  perform private.court_append(p_trial, 'gallery_seat', me.id::text, 'Took a seat in the gallery');
end;
$$;

/** The hall's list, as 20260916130000, with the snapshot name and only a gallery seat counted as watching. */
create or replace function public.trials_i_may_sit_on()
returns table (
  id           uuid,
  summary      text,
  status       text,
  verdict      text,
  opened_at    timestamptz,
  accused_name text,
  accused_role text,
  watching     bigint,
  i_am_watching boolean,
  i_am_judge   boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.summary, t.status, t.verdict, t.opened_at,
         coalesce(t.subject_name, p.full_name, 'Someone'), p.role,
         (select count(*) from public.trial_parties tp
           where tp.trial_id = t.id and tp.part = 'observer') as watching,
         exists (select 1 from public.trial_parties tp
                  where tp.trial_id = t.id and tp.person_id = (select auth.uid())
                    and tp.part = 'observer') as i_am_watching,
         t.head_judge_id = (select auth.uid()) as i_am_judge
    from public.trials t
    left join public.profiles p on p.id = t.subject_id
   where private.court_door_open() and private.may_sit_on_trial(t.id)
   order by t.status = 'open' desc, t.opened_at desc;
$$;

-- ====================================================== what is already here ==
--
-- Cases opened before this migration are put on the record in the order they
-- happened, at the times they happened, each entry saying it was carried over.
-- The chain therefore starts at the opening of each case, not at this
-- migration, and nobody reading it is told it is more than it is.

do $$
declare
  t record;
  s record;
  p record;
  seal text;
begin
  for t in select * from public.trials tr
            where not exists (select 1 from public.court_record r where r.trial_id = tr.id)
            order by tr.opened_at loop
    perform private.court_append(t.id, 'opened', private.court_sha256(t.summary),
      'Case opened about ' || coalesce(t.subject_name, 'Someone') || ' (carried over)',
      t.opened_by, t.opened_at);
    for p in select tp.*, coalesce(pr.full_name, 'Someone') as name
               from public.trial_parties tp
               left join public.profiles pr on pr.id = tp.person_id
              where tp.trial_id = t.id
              order by tp.summoned_at loop
      perform private.court_append(t.id,
        case when p.part = 'observer' then 'gallery_seat' else 'summoned' end,
        p.person_id::text,
        case when p.part = 'observer' then 'Took a seat in the gallery (carried over)'
             else p.name || ' called as ' || p.part || ' (carried over)' end,
        case when p.part = 'observer' then p.person_id else t.opened_by end,
        p.summoned_at);
    end loop;
    for s in select * from public.trial_statements st
              where st.trial_id = t.id order by st.created_at, st.id loop
      perform private.court_append(t.id, 'statement', s.body_sha256,
        'Statement ' || s.id::text || ' (carried over)', s.author_id, s.created_at);
    end loop;
    if t.status = 'closed' then
      seal := private.court_append(t.id, 'verdict',
        private.court_sha256(t.verdict || chr(10) || coalesce(btrim(t.verdict_note), '')),
        'Verdict: ' || t.verdict || coalesce(' -- ' || nullif(btrim(coalesce(t.verdict_note, '')), ''), '')
          || ' (carried over)',
        t.head_judge_id, coalesce(t.closed_at, now()));
      update public.trials set seal_hash = seal, sealed_at = coalesce(t.closed_at, now())
       where id = t.id;
    end if;
  end loop;
end
$$;

-- ================================================================== grants ==

revoke all on function private.court_pass_minutes()                 from public, anon;
revoke all on function private.court_pass_until()                   from public, anon;
revoke all on function private.court_door_open()                    from public, anon;
revoke all on function private.court_require_door()                 from public, anon, authenticated;
revoke all on function private.court_append(uuid, text, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.court_sha256(text)                   from public, anon, authenticated;
revoke all on function private.court_place(uuid)                    from public, anon;
revoke all on function private.court_on_the_bench(uuid)             from public, anon;
revoke all on function private.court_in_the_room(uuid)              from public, anon;
revoke all on function private.court_may_see_exhibit(uuid)          from public, anon;
revoke all on function private.court_letter(integer)                from public, anon, authenticated;
revoke all on function private.court_file_awaited(text)             from public, anon;
revoke all on function private.court_file_readable(text)            from public, anon;
revoke all on function private.court_may_present(uuid)              from public, anon, authenticated;
revoke all on function private.court_enter_exhibit(uuid)            from public, anon, authenticated;
revoke all on function private.court_statement_stamp()              from public, anon, authenticated;
revoke all on function private.court_statement_recorded()           from public, anon, authenticated;

-- The ones the policies ask, as the person asking.
grant execute on function private.court_pass_minutes()        to authenticated;
grant execute on function private.court_pass_until()          to authenticated;
grant execute on function private.court_door_open()           to authenticated;
grant execute on function private.court_place(uuid)           to authenticated;
grant execute on function private.court_on_the_bench(uuid)    to authenticated;
grant execute on function private.court_in_the_room(uuid)     to authenticated;
grant execute on function private.court_may_see_exhibit(uuid) to authenticated;
grant execute on function private.court_file_awaited(text)    to authenticated;
grant execute on function private.court_file_readable(text)   to authenticated;

revoke all on function public.court_door()                                       from public, anon;
revoke all on function public.court_cases()                                      from public, anon;
revoke all on function public.court_case(uuid)                                   from public, anon;
revoke all on function public.court_say(uuid, text)                              from public, anon;
revoke all on function public.court_record_for(uuid, uuid, text)                 from public, anon;
revoke all on function public.court_summon(uuid, uuid)                           from public, anon;
revoke all on function public.court_gallery(uuid, boolean)                       from public, anon;
revoke all on function public.court_exported(uuid)                               from public, anon;
revoke all on function public.court_check_record(uuid)                           from public, anon;
revoke all on function public.court_exhibit_begin(uuid, text, text, text, bigint, text, text, text) from public, anon;
revoke all on function public.court_exhibit_seal(uuid)                           from public, anon;
revoke all on function public.court_exhibit_write(uuid, text, text, text, text)  from public, anon;
revoke all on function public.court_exhibit_handled(uuid, text)                  from public, anon;
revoke all on function public.in_trial(uuid)                                     from public, anon;
revoke all on function public.open_trial(uuid, text, uuid, uuid)                 from public, anon;
revoke all on function public.call_head_judge(uuid)                              from public, anon;
revoke all on function public.take_head_judge(uuid)                              from public, anon;
revoke all on function public.close_trial(uuid, text, text)                      from public, anon;
revoke all on function public.join_trial(uuid)                                   from public, anon;
revoke all on function public.trials_i_may_sit_on()                              from public, anon;

grant execute on function public.court_door()                                       to authenticated;
grant execute on function public.court_cases()                                      to authenticated;
grant execute on function public.court_case(uuid)                                   to authenticated;
grant execute on function public.court_say(uuid, text)                              to authenticated;
grant execute on function public.court_record_for(uuid, uuid, text)                 to authenticated;
grant execute on function public.court_summon(uuid, uuid)                           to authenticated;
grant execute on function public.court_gallery(uuid, boolean)                       to authenticated;
grant execute on function public.court_exported(uuid)                               to authenticated;
grant execute on function public.court_check_record(uuid)                           to authenticated;
grant execute on function public.court_exhibit_begin(uuid, text, text, text, bigint, text, text, text) to authenticated;
grant execute on function public.court_exhibit_seal(uuid)                           to authenticated;
grant execute on function public.court_exhibit_write(uuid, text, text, text, text)  to authenticated;
grant execute on function public.court_exhibit_handled(uuid, text)                  to authenticated;
grant execute on function public.in_trial(uuid)                                     to authenticated;
grant execute on function public.open_trial(uuid, text, uuid, uuid)                 to authenticated;
grant execute on function public.call_head_judge(uuid)                              to authenticated;
grant execute on function public.take_head_judge(uuid)                              to authenticated;
grant execute on function public.close_trial(uuid, text, text)                      to authenticated;
grant execute on function public.join_trial(uuid)                                   to authenticated;
grant execute on function public.trials_i_may_sit_on()                              to authenticated;

commit;
