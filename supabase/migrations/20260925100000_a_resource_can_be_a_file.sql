-- A resource can be a file, not only a link.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ASKED, 25 September 2026: "I cant even upload files in the
-- resources but I can do that in the Library for all users ... files must be
-- drag and drop please, and easy to share for all users ... easy to add, easy
-- to delete."
--
-- WHY IT WAS NOT POSSIBLE. The library was links only, on purpose: My Files
-- ("On this device") keeps a file in the phone that saved it, and a file on one
-- phone cannot be opened on another. So a Guide could keep a handout for
-- themselves but never put it in front of the person they walk with -- except
-- by attaching it to a study, which goes through the church's own storage and
-- always has. This does the same for resources.
--
-- WHERE THE FILE LIVES. The one private bucket the app already uses, under
-- `library/<the uploader>/`, with the bucket's existing limits: 10 MB a file,
-- pictures, PDFs, office documents, audio and text. No video files: a video is
-- a link (YouTube and the like), which costs the church nothing to hold.
--
-- WHO CAN OPEN IT is exactly who can read the resource. The read rule on the
-- object asks the resources table, under the reader's own row rules, whether a
-- resource points at this file -- so sharing a resource with somebody is what
-- lets them open its file, and unsharing or deleting it is what stops them.
-- The uploader can always open their own. Leadership gets no extra reach: the
-- church's leaders see the shape of the library (the activity record), not the
-- private files in it.
--
-- NOBODY CAN BORROW SOMEBODY ELSE'S FILE. A resource may only point at a file
-- in the folder of the person who added it, and the browser can neither write
-- the file columns after the fact nor change who added a resource. Without that,
-- anybody who learned a file's path could publish a resource pointing at it
-- and hand themselves the key.
--
-- A SECOND DOOR, CLOSED ON THE WAY. The browser could update EVERY column of a
-- resource it owns -- including `church_id` and `added_by`. A Director could
-- have moved their own resource, published, onto another church's shelf. It may
-- now update only what the app edits: the title, the note, the kind, the link,
-- and whether it is on the church shelf (which a trigger still reserves for
-- leadership).
--
-- PROVEN on the live database in a transaction that was discarded; the figures
-- are in the commit that added this file.
-- ---------------------------------------------------------------------------

begin;

-- A FILE, OR A LINK -------------------------------------------------------------
alter table public.materials
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_size bigint;

alter table public.materials alter column external_url drop not null;

alter table public.materials drop constraint if exists materials_link_or_file;
alter table public.materials add constraint materials_link_or_file check (
  (external_url is not null and file_path is null)
  or (external_url is null and file_path is not null and file_name is not null)
);

-- In the uploader's own library folder, and nowhere else.
alter table public.materials drop constraint if exists materials_file_is_the_adders;
alter table public.materials add constraint materials_file_is_the_adders check (
  file_path is null
  or (file_path ~ '^library/[0-9a-f-]{36}/[^/]+$'
      and length(file_path) <= 400
      and split_part(file_path, '/', 2) = added_by::text)
);

alter table public.materials drop constraint if exists materials_file_details;
alter table public.materials add constraint materials_file_details check (
  (file_name is null or length(file_name) between 1 and 300)
  and (file_type is null or length(file_type) <= 200)
  and (file_size is null or file_size between 0 and 52428800)
);

create index if not exists materials_file_path_idx
  on public.materials (file_path) where file_path is not null;

-- A document that is not a picture, a PDF or audio.
alter type public.material_kind add value if not exists 'file';

-- WHAT THE BROWSER MAY WRITE --------------------------------------------------
revoke insert, update on public.materials from authenticated;
grant insert (church_id, added_by, title, description, kind, external_url,
              file_path, file_name, file_type, file_size)
  on public.materials to authenticated;
grant update (title, description, kind, external_url, is_published)
  on public.materials to authenticated;
grant select (file_path, file_name, file_type, file_size) on public.materials to authenticated;

-- THE FILES THEMSELVES --------------------------------------------------------
drop policy if exists library_file_write on storage.objects;
create policy library_file_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'library'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select public.auth_role()) in ('dm', 'ds', 'admin', 'executive')
    and not public.library_blocked((select auth.uid()))
  );

drop policy if exists library_file_read on storage.objects;
create policy library_file_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'library'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or exists (select 1 from public.materials m where m.file_path = objects.name)
    )
  );

drop policy if exists library_file_drop on storage.objects;
create policy library_file_drop on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pairing-media'
    and (storage.foldername(name))[1] = 'library'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.manages_church(public.uploader_church((storage.foldername(name))[2]))
    )
  );

-- THE LIBRARY RECORD NAMES A FILE AS A FILE -----------------------------------
-- It judged every addition by its web address, and a file has none: it would
-- have been filed as "A resource with no address". A file is passed in as
-- `upload:<its name>` (no link can start that way -- the address must begin
-- http), labelled as what it is, and still refused a clean bill if its name
-- says it installs something.
create or replace function private.how_safe(p_url text, out concern text, out label text)
returns record
language plpgsql
immutable
set search_path to 'pg_temp'
as $function$
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

  if raw like 'upload:%' then
    if lower(raw) ~ '\.(exe|apk|msi|scr|bat|cmd|dmg|pkg|jar|vbs|ps1)$' then
      concern := 'harmful'; label := 'A file that installs something'; return;
    end if;
    label := 'A file uploaded from a phone or computer';
    return;
  end if;

  scheme := lower(coalesce(substring(raw from '^([a-zA-Z][a-zA-Z0-9+.-]*):'), ''));

  if scheme in ('javascript', 'data', 'vbscript', 'file') then
    concern := 'harmful'; label := 'A link that runs code instead of opening a page'; return;
  end if;

  rest := regexp_replace(raw, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  host := lower(split_part(split_part(split_part(rest, '/', 1), '?', 1), '#', 1));
  path := lower(substring(rest || '/' from position('/' in rest || '/')));

  if position('@' in host) > 0 then
    concern := 'harmful'; label := 'An address disguised as a different one'; return;
  end if;

  host := split_part(host, ':', 1);

  if host like 'xn--%' or host like '%.xn--%' then
    concern := 'harmful'; label := 'A name written to look like another name'; return;
  end if;

  if host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' or host ~ '^\[[0-9a-f:]+\]$' then
    concern := 'harmful'; label := 'A numbered address with no name behind it'; return;
  end if;

  if path ~ '\.(exe|apk|msi|scr|bat|cmd|dmg|pkg|jar|vbs|ps1)($|\?|#|/)' then
    concern := 'harmful'; label := 'A file that installs something'; return;
  end if;

  if host ~ '(^|\.)(pornhub|xvideos|xnxx|xhamster|onlyfans|redtube|youporn|stripchat|chaturbate)\.'
     or host ~ '(porn|xxx|sexcam|escort)' then
    concern := 'harmful'; label := 'Adult content'; return;
  end if;
  if host ~ '(^|\.)(bet365|1xbet|stake|bovada|pokerstars)\.'
     or host ~ '(casino|betting|sportsbook|jackpot)' then
    concern := 'harmful'; label := 'Gambling'; return;
  end if;

  if host ~ '^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|ow\.ly|buff\.ly|rebrand\.ly|bit\.do|tiny\.cc)$' then
    concern := 'questionable';
    label := 'A shortened link, so where it goes cannot be seen first';
    return;
  end if;

  if scheme = 'http' then
    concern := 'questionable'; label := 'Sent over an unprotected connection'; return;
  end if;

  if host ~ '\.(zip|mov|top|xyz|tk|ml|ga|cf|gq|click|work|link)$' then
    concern := 'questionable'; label := 'A throwaway kind of web address'; return;
  end if;
end;
$function$;

create or replace function private.record_library_add()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $function$
begin
  perform private.record_activity(
    new.added_by, 'added', 'library', new.title,
    coalesce(new.external_url, 'upload:' || coalesce(new.file_name, '')),
    null, new.created_at);
  return new;
end;
$function$;

create or replace function private.record_library_share()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $function$
declare
  item     public.materials%rowtype;
  other_id uuid;
  other    public.profiles%rowtype;
begin
  select * into item from public.materials where id = new.material_id;
  select case when p.dm_id = new.shared_by then p.ds_id else p.dm_id end
    into other_id
    from public.pairings p where p.id = new.pairing_id;
  select * into other from public.profiles where id = other_id;

  perform private.record_activity(
    new.shared_by, 'shared', 'library',
    coalesce(item.title, 'A resource'),
    coalesce(item.external_url, 'upload:' || coalesce(item.file_name, '')),
    coalesce(other.full_name, 'the other person'), new.created_at);
  return new;
end;
$function$;

commit;
