// The pocket: a person's own shortcuts to the web apps they already use.
//
// ASKED FOR LIKE THIS: "First I will copy the URL of the web app like example,
// spotify, youtube, or facebook, then I will paste it on the URL of the pocket
// micro-app and I click the save button, then it automatically registers the
// logo and app URL, Now when I click the logo, it automatically goes in that
// web app destination... some people use office web app so that can be helpful
// to ALL users."
//
// WHY THE MARK IS DRAWN AND NOT FETCHED. "It automatically registers the logo"
// is the interesting half. The obvious way is to fetch each site's favicon, and
// it is the wrong way twice over. The app's CSP allows images from `'self'`,
// `data:` and `blob:` only, so every real favicon would need img-src widened to
// arbitrary origins -- and once it is, every tile on a person's desk quietly
// tells that company the person is here, each time the rail renders. A church
// member's screen should not report to Facebook that it exists.
//
// So the mark is computed from the address instead: the services people
// actually paste are recognised by hostname and given their own colour and
// glyph, and anything unrecognised gets its first letter on a colour derived
// from the name. No request leaves the device, the CSP is untouched, and it
// still looks like the app it stands for. Swapping in real favicons later is a
// CSP decision, not a code one.
//
// WHY IT IS NOT IN THE DATABASE. These are one person's bookmarks to public
// websites, not church records. Keeping them in the browser means every role
// has the feature immediately -- Explorers included, which is the point of
// "ALL users" -- with no table, no policy and no migration to get wrong.

import { safeExternalUrl } from '@/lib/url';

export type Pocket = { id: string; url: string; label: string };

export const POCKET_KEY = 'beacon-pocket';
export const POCKET_LIMIT = 12;

/**
 * Accept only addresses a browser can safely open.
 *
 * THE PROTOCOL DECISION IS NOT MADE HERE. lib/url.ts already owns "is this safe
 * to put in an href", and a second, weaker copy of a safety check is how one of
 * the two ends up wrong -- which this repository has already had to fix once,
 * when a component reached for navigator.clipboard instead of the guarded
 * copyText. `javascript:`, `data:` and anything else that is not http(s) is
 * refused there. This adds only the courtesy on top: somebody pasting
 * "spotify.com" means https, and refusing them over a missing prefix is the
 * kind of pedantry that makes people give up.
 */
export function tidyUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
  const safe = safeExternalUrl(withScheme);
  if (!safe) return null;
  // A host with no dot is a typo or an intranet name, not a web app somebody
  // meant to keep.
  try {
    if (!new URL(safe).hostname.includes('.')) return null;
  } catch {
    return null;
  }
  return safe;
}

/**
 * Sites the pocket will not keep, and why.
 *
 * ASKED FOR: "I want to limit (with a disclosure of course to every user) to
 * take our social media apps in the pocket application (Except for Youtube).
 * Facebook, X, Instagram, Tiktok, LinkedIn, etc. are not allowed in the pocket
 * application because it can bring distractions to all users."
 *
 * THIS IS A PRODUCT RULE, NOT A SAFETY ONE, and the difference matters for how
 * it is written. `tidyUrl` refuses things that could HARM somebody -- a
 * `javascript:` address that would run in this app's origin. This refuses
 * things that are perfectly safe and that the church has decided do not belong
 * one tap from a study. So it fails with an explanation rather than silently,
 * and the reason is said on the screen before anybody tries rather than only
 * after.
 *
 * YOUTUBE IS DELIBERATELY IN AND MESSAGING IS DELIBERATELY OUT OF SCOPE.
 * YouTube was named as the exception: the church links studies and hymns there,
 * and the app deliberately keeps video out of its own uploads for storage and
 * egress reasons, so YouTube is where that material already lives. Messaging --
 * Messenger, WhatsApp, Viber, Telegram -- is NOT on this list, because what was
 * named was social media and because in this congregation those are how people
 * arrange a lift to church rather than how they lose an evening. Say the word
 * and the list widens; that is a decision rather than an oversight.
 */
export const NOT_IN_THE_POCKET: { match: RegExp; name: string }[] = [
  { match: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/,       name: 'Facebook' },
  { match: /(^|\.)(x\.com|twitter\.com|t\.co)$/,             name: 'X' },
  { match: /(^|\.)instagram\.com$/,                          name: 'Instagram' },
  { match: /(^|\.)(tiktok\.com|douyin\.com)$/,               name: 'TikTok' },
  { match: /(^|\.)linkedin\.com$/,                           name: 'LinkedIn' },
  { match: /(^|\.)threads\.(net|com)$/,                      name: 'Threads' },
  { match: /(^|\.)snapchat\.com$/,                           name: 'Snapchat' },
  { match: /(^|\.)reddit\.com$/,                             name: 'Reddit' },
  { match: /(^|\.)pinterest\.[a-z.]+$/,                      name: 'Pinterest' },
  { match: /(^|\.)tumblr\.com$/,                             name: 'Tumblr' },
  { match: /(^|\.)(bsky\.app|bluesky\.social)$/,             name: 'Bluesky' },
  { match: /(^|\.)(weibo\.com|vk\.com)$/,                    name: 'a social network' },
];

/** The one exception, named because it was named. */
export const ALWAYS_WELCOME = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/;

/**
 * Why this address cannot be kept, or null if it can.
 *
 * Checked AFTER YouTube, so a link to a study on YouTube is never caught by a
 * rule about feeds.
 */
export function pocketRefusal(url: string): string | null {
  const host = hostOf(url);
  if (ALWAYS_WELCOME.test(host)) return null;
  const blocked = NOT_IN_THE_POCKET.find((b) => b.match.test(host));
  if (!blocked) return null;
  return `${blocked.name} is not kept in the pocket. The pocket is for the tools `
    + 'you work with, and social feeds are left out so they are not one tap '
    + 'from a study. YouTube is the exception.';
}

/** The bare name a person recognises: "youtube.com" from a long watch link. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A readable label: the site's own name, capitalised. */
export function labelFor(url: string): string {
  const host = hostOf(url);
  const name = host.split('.')[0] || host;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// The services people actually paste. Recognised by hostname, drawn locally.
const KNOWN: { match: RegExp; glyph: string; color: string }[] = [
  { match: /(^|\.)spotify\.com$/,                     glyph: '♪',  color: '#1DB954' },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/,          glyph: '▶',  color: '#FF0000' },
  { match: /(^|\.)facebook\.com$/,                     glyph: 'f',  color: '#1877F2' },
  { match: /(^|\.)messenger\.com$/,                    glyph: '✆',  color: '#0084FF' },
  { match: /(^|\.)(whatsapp\.com|wa\.me)$/,            glyph: '✆',  color: '#25D366' },
  { match: /(^|\.)(office\.com|office365\.com|live\.com|microsoft\.com)$/,
                                                      glyph: '⊞',  color: '#D83B01' },
  { match: /(^|\.)(google\.com|gmail\.com)$/,          glyph: 'G',  color: '#4285F4' },
  { match: /(^|\.)(docs\.google\.com|drive\.google\.com)$/, glyph: '▤', color: '#0F9D58' },
  { match: /(^|\.)zoom\.us$/,                          glyph: '▣',  color: '#2D8CFF' },
  { match: /(^|\.)canva\.com$/,                        glyph: '✦',  color: '#00C4CC' },
  { match: /(^|\.)(bible\.com|youversion\.com)$/,      glyph: '✝',  color: '#6B4FBB' },
  { match: /(^|\.)adventist\.org$/,                    glyph: '✝',  color: '#F5A623' },
  { match: /(^|\.)(faithlife\.com|logos\.com)$/,        glyph: '✦',  color: '#4A9C2D' },
];

// Colours for everything else, chosen to sit against both a light and a dark
// desk rather than to be bright.
const FALLBACK = ['#2F80ED', '#7FB03A', '#E2725B', '#6B4FBB', '#0F9D58', '#D97706', '#0E7490'];

export function markFor(url: string): { glyph: string; color: string } {
  const host = hostOf(url);
  for (const k of KNOWN) if (k.match.test(host)) return { glyph: k.glyph, color: k.color };
  // Deterministic, so a tile keeps its colour for ever rather than changing
  // every time the rail renders.
  let sum = 0;
  for (let i = 0; i < host.length; i += 1) sum = (sum + host.charCodeAt(i)) % 9973;
  return {
    glyph: (host[0] ?? '?').toUpperCase(),
    color: FALLBACK[sum % FALLBACK.length],
  };
}

/**
 * What a pocket starts with.
 *
 * ASKED FOR: "please make faithlife as the default (can be removed or add by
 * users too) web app in the pocket app please."
 *
 * A DEFAULT THAT COMES BACK IS NOT A DEFAULT, IT IS A NAG. Somebody who removes
 * a tile has said what they want, and an app that quietly puts it back the next
 * time they open the room is arguing with them. So in the live app this is not
 * seeded by the screen at all: a trigger gives it to an account once, when the
 * account is made, and after that the rows are entirely the person's own. There
 * is nothing anywhere that can add it a second time.
 *
 * In the walkthrough, which has no account and no database, it is seeded once
 * per device against the flag below and then left alone for the same reason.
 */
export const STARTER_APPS: { url: string; label: string }[] = [
  { url: 'https://faithlife.com', label: 'Faithlife' },
];

/** Remembers that the walkthrough's pocket has been given its starter tiles. */
export const POCKET_SEEDED_KEY = 'beacon-pocket-seeded';

/**
 * The walkthrough's pocket, with its starter tiles added the first time only.
 *
 * ONCE PER DEVICE, AND NEVER AGAIN. The flag is written before the tiles are,
 * so a storage failure halfway through leaves somebody with no starter rather
 * than with one that reappears every visit. Of the two, the nag is worse.
 */
export function pocketWithStarters(): Pocket[] {
  const existing = readPocket();
  try {
    if (window.localStorage.getItem(POCKET_SEEDED_KEY)) return existing;
    window.localStorage.setItem(POCKET_SEEDED_KEY, String(Date.now()));
  } catch {
    // No storage at all. Nothing can be remembered, so nothing is seeded: a
    // tile that came back on every page load would be worse than none.
    return existing;
  }
  if (existing.length > 0) return existing;

  const starters: Pocket[] = STARTER_APPS.map((app, i) => ({
    id: `starter-${i}`,
    url: app.url,
    label: app.label,
  }));
  writePocket(starters);
  return starters;
}

/** Everything in the pocket. A private window refuses storage; that is empty, not broken. */
export function readPocket(): Pocket[] {
  try {
    const raw = window.localStorage.getItem(POCKET_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Pocket =>
        !!p && typeof p === 'object'
        && typeof (p as Pocket).url === 'string'
        && typeof (p as Pocket).id === 'string')
      // Re-checked on the way OUT as well as in. Anything already in storage
      // from an older version, or edited by hand, goes through the same gate.
      .filter((p) => tidyUrl(p.url) !== null)
      .slice(0, POCKET_LIMIT);
  } catch {
    return [];
  }
}

export function writePocket(items: Pocket[]): void {
  try {
    window.localStorage.setItem(POCKET_KEY, JSON.stringify(items.slice(0, POCKET_LIMIT)));
  } catch {
    // Nothing to do and nothing worth saying. The tiles stay for this visit.
  }
}
