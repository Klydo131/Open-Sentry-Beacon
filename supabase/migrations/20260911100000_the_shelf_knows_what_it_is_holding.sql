-- The kind on a library row matches what is actually at the address.
--
-- WHAT WENT WRONG. The add form asks for a Kind, offers five, defaults to
-- "Link", and puts the dropdown BELOW the address box -- so somebody pasting a
-- YouTube URL reaches the Add button before they reach the question. The field
-- is whatever the form defaulted to on almost every row.
--
-- Harmless while the kind was a small icon. Then filter chips were built on it
-- ("Video 2", "PDF 1"), and a field nobody maintains became a control that
-- LIES: on this church's shelf two of the nine rows filed as 'link' are
-- YouTube videos, so tapping Video hid half the real videos and the person
-- tapping had no way to know.
--
-- The form now reads the address and offers the answer as a default
-- (lib/live/kind-from-url.ts). This migration is the other half: the rows that
-- were already wrong before the form learned to help.
--
-- ONLY ROWS STILL SITTING ON THE DEFAULT. `where kind = 'link'` is the whole
-- safety of this migration, and it is not a filter for convenience. A row filed
-- as 'audio' pointing at a YouTube link is a Guide who DECIDED the congregation
-- should listen to it, and quietly "correcting" that to 'video' would overwrite
-- a real choice with a guess. 'link' is the only value that cannot be
-- distinguished from nobody having answered, so it is the only one touched.
--
-- THE HOST MATCH ENDS AT A BOUNDARY. `like '%youtube.com%'` is also true of
-- `youtube.com.example.net`, which is somebody else's domain wearing this one
-- as a prefix. Each pattern below requires the host to END at the domain --
-- followed by `/`, `?`, `#`, `:` or the end of the string -- and allows
-- subdomains before it. Same rule as the browser-side reader, on purpose: two
-- halves of one decision that must not disagree.
--
-- THE PATH ONLY, FOR EXTENSIONS. `?redirect=/a.pdf` is a parameter ABOUT a PDF,
-- not a PDF. The extension patterns stop at the first `?` or `#`.

begin;

-- The host part of a URL, lowercased, with any leading `www.` removed.
-- Local to this migration: it is a one-off correction, not a shared utility.
create or replace function pg_temp.url_host(u text)
returns text language sql immutable as $$
  select regexp_replace(
           lower(split_part(regexp_replace(u, '^https?://', '', 'i'), '/', 1)),
           '^www\.', '');
$$;

-- The path part, without query string or fragment.
create or replace function pg_temp.url_path(u text)
returns text language sql immutable as $$
  select split_part(split_part(
           regexp_replace(u, '^https?://[^/]*', '', 'i'), '?', 1), '#', 1);
$$;

-- Does this host equal the domain, or sit under it as a subdomain?
create or replace function pg_temp.host_is(h text, domain text)
returns boolean language sql immutable as $$
  select h = domain or h like ('%.' || domain);
$$;

update public.materials m
   set kind = 'video'
 where m.kind = 'link'
   and (
     pg_temp.host_is(pg_temp.url_host(m.external_url), 'youtube.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'youtu.be')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'vimeo.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'dailymotion.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'rumble.com')
     or pg_temp.url_path(m.external_url) ~* '\.(mp4|mov|webm|mkv|avi)$'
   );

update public.materials m
   set kind = 'audio'
 where m.kind = 'link'
   and (
     pg_temp.host_is(pg_temp.url_host(m.external_url), 'spotify.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'soundcloud.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'anchor.fm')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'podcasts.apple.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'buzzsprout.com')
     or pg_temp.host_is(pg_temp.url_host(m.external_url), 'podbean.com')
     or pg_temp.url_path(m.external_url) ~* '\.(mp3|m4a|wav|ogg|aac|flac)$'
   );

update public.materials m
   set kind = 'pdf'
 where m.kind = 'link'
   and pg_temp.url_path(m.external_url) ~* '\.pdf$';

update public.materials m
   set kind = 'image'
 where m.kind = 'link'
   and pg_temp.url_path(m.external_url) ~* '\.(jpg|jpeg|png|gif|webp|avif|svg)$';

commit;
