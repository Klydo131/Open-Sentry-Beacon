-- The pocket is for tools, not feeds.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "I want to limit (with a disclosure of course to every user) to
-- take our social media apps in the pocket application (Except for Youtube).
-- Facebook, X, Instagram, Tiktok, LinkedIn, etc. are not allowed in the pocket
-- application because it can bring distractions to all users."
--
-- WHY THIS IS IN THE DATABASE AND NOT ONLY IN THE BROWSER. Until today the
-- pocket lived in localStorage and a client-side rule would have been the whole
-- of it. It is rows now, and a row can be written by anything holding a session
-- -- so a rule that lives only on the screen is a rule that holds until
-- somebody uses something other than the screen. The browser refuses with an
-- explanation, which is the kind thing; this refuses regardless, which is the
-- true thing.
--
-- A PRODUCT RULE, NOT A SAFETY ONE. The url check already on this table refuses
-- what could HARM somebody. This refuses what is perfectly safe and simply does
-- not belong one tap from a study, which is why it fails with words a person
-- can read rather than a constraint name.
--
-- YOUTUBE IS CHECKED FIRST, so a link to a study or a hymn is never caught by a
-- rule about feeds. Messaging is deliberately absent from the list: what was
-- named was social media, and in this congregation Messenger and Viber are how
-- somebody arranges a lift to church.
-- ---------------------------------------------------------------------------

create or replace function private.the_pocket_is_for_tools()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  host text;
begin
  -- The host, lowercased, without a leading www. Parsed rather than matched
  -- against the whole address, so a blocked name appearing in a PATH --
  -- example.com/why-i-left-facebook -- is not refused.
  host := lower(regexp_replace(new.url, '^https?://(www\.)?([^/?#]+).*$', '\2'));

  if host ~ '(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$' then
    return new;
  end if;

  if host ~ ('(^|\.)(facebook\.com|fb\.com|fb\.watch|x\.com|twitter\.com|t\.co'
           || '|instagram\.com|tiktok\.com|douyin\.com|linkedin\.com'
           || '|threads\.net|threads\.com|snapchat\.com|reddit\.com'
           || '|pinterest\.[a-z.]+|tumblr\.com|bsky\.app|bluesky\.social'
           || '|weibo\.com|vk\.com)$') then
    raise exception 'That one is not kept in the pocket. The pocket is for the '
      'tools you work with, and social feeds are left out so they are not one '
      'tap from a study. YouTube is the exception.';
  end if;

  return new;
end;
$$;

drop trigger if exists pocket_apps_are_tools on public.pocket_apps;
create trigger pocket_apps_are_tools
  before insert or update on public.pocket_apps
  for each row execute function private.the_pocket_is_for_tools();
