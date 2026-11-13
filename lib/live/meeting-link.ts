// The way in to a meeting, whichever kind it is.
//
// THE GAP: an online meeting had nowhere to put the link to join it. The app
// arranged the time and then left two people to send a Zoom address to each
// other in a message, which is the errand a shared card was meant to remove,
// and the one thing somebody is hunting for in the sixty seconds before a call.
//
// The column was always meant to hold it. Migration 0009 documents `location`
// as "a place for in person, or a joining address for online" -- one field, on
// purpose, so nobody has to pick a category before typing where to meet. The
// write path in lib/live/data.ts then threw the value away whenever the meeting
// was online, so the half the schema described was never reachable.
//
// Kept out of the component so it can be run rather than read. What counts as a
// safe link is a security question, and a security question deserves a test
// that executes the real function.

import { linkifyParts, safeHref } from '../linkify.ts';
import type { MeetingMode } from '../types.ts';

/**
 * A web address written the way people actually copy one.
 *
 * REPORTED FROM A REAL APPOINTMENT. A Guide pasted
 * `meet.google.com/idn-soex-nkb` into "where", and the card showed it as dead
 * text with no Join button: `safeHref` only supplies a missing scheme for
 * addresses that begin `www.`, and almost nothing does any more. Google Meet,
 * Zoom and Teams all hand you an address with no `www.`, and the browser's
 * address bar hides the `https://` before you copy it — so the one thing a
 * person is most likely to paste was the one shape the field refused.
 *
 * THE SHAPE TEST IS DELIBERATELY MEAN, because the alternative failure is
 * worse than a missing button. "I will ring you at seven" must stay a
 * sentence, and `7.30pm` must not become a link to a website called
 * `https://7.30pm` — which is exactly what a naive "has a dot in it" test
 * does. So: no whitespace, at least one dot, and a final label that is
 * letters only, which is what a top-level domain is and what a time is not.
 *
 * Anything carrying its own scheme is left completely alone, so
 * `javascript:` and `mailto:` and `file:` reach the guard untouched and are
 * refused there. This function only ever ADDS `https://`; it never rewrites a
 * scheme somebody typed.
 */
const BARE_ADDRESS = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d{2,5})?(?:[/?#]|$)/i;

function withScheme(where: string): string {
  if (where.includes('://')) return where;
  return BARE_ADDRESS.test(where) ? `https://${where}` : where;
}

/**
 * The joining link for a meeting, or null if there is not one.
 *
 * `safeHref` is the same guard the chat linkifier uses, so a link in a meeting
 * and a link in a message cannot drift apart on what counts as safe. It allows
 * http and https and nothing else, and rejects a URL carrying user info:
 * `https://zoom.us@evil.example/j/123` reads as Zoom to a person and goes
 * somewhere else entirely. lib/url.ts explains why that one matters here in
 * particular -- a Guide misusing their position towards the Explorer they walk
 * with is inside this app's threat model, not outside it.
 *
 * Anything that is not a link comes back null and is shown as plain text. "I
 * will ring you at seven" is a perfectly good answer to "where", and it must
 * not become a button that goes nowhere.
 */
export function joinUrl(mode: MeetingMode, where: string | null | undefined): string | null {
  if (mode !== 'online' || !where) return null;
  const text = where.trim();
  if (!text) return null;

  // THE LINK IS USUALLY NOT THE WHOLE FIELD, and assuming it was produced two
  // failures, the second worse than the first.
  //
  //   "Zoom link: https://zoom.us/j/123"      -> no button at all
  //   "https://zoom.us/j/123 (password 4321)" -> a button to
  //                          https://zoom.us/j/123%20(password%204321)
  //
  // The second is the dangerous one. A URL parser does not reject a space, it
  // ESCAPES it, so the whole sentence was swallowed into the path and the card
  // showed a confident Join button that goes to a 404. Dead text at least looks
  // dead.
  //
  // Both are how people actually paste a meeting link: with a word in front of
  // it, or with the passcode after it. So find the link inside the text rather
  // than demanding the text be nothing but a link. linkifyParts is the same
  // extractor the chat uses, which is the point -- a link in an appointment and
  // a link in a message cannot drift apart on what counts as safe, and it
  // still refuses `https://zoom.us@evil.example/j/1`.
  const found = linkifyParts(text).find((part) => typeof part !== 'string');
  if (found) return (found as { href: string }).href;

  // A BARE ADDRESS ON ITS OWN, which the extractor deliberately does not match
  // because in prose `meet.google.com` may be a sentence about Google rather
  // than a link. In a field labelled "link to join the call" it is a link. Only
  // reached when nothing was extracted, and only for a single token, so it
  // cannot re-introduce the swallowing above: there is no space to swallow.
  if (/\s/.test(text)) return null;
  return safeHref(withScheme(text));
}

/**
 * True when the text carries a link, rather than being plain words.
 *
 * The card needs this to answer one question for both kinds of meeting: print
 * what they wrote, or let the button carry it? Without it the online branch
 * could ask `join ? ...` and the in-person branch could not, because a place
 * ALWAYS produces a button -- a map search of the words when there is no link.
 * One predicate, and the two branches become the same line.
 */
export function hasLink(where: string | null | undefined): boolean {
  if (!where) return false;
  return linkifyParts(where.trim()).some((part) => typeof part !== 'string');
}

/**
 * The words around the link, if the person wrote any.
 *
 * Used by both kinds of meeting: a passcode beside a Zoom link, and a place
 * name beside a map link, are the same problem wearing different clothes.
 *
 * THE PASSCODE PROBLEM. When the field held a link the card showed only the
 * Join button and dropped everything else, on the reasoning that repeating a
 * long URL pushes the row off a phone. That is right about the URL and wrong
 * about the rest: "(password 4321)" is the half you cannot join without, and it
 * was being thrown away silently.
 *
 * Returns '' when the field is nothing but the link, so the card stays clean in
 * the ordinary case.
 */
export function wordsBesideLink(where: string | null | undefined): string {
  if (!hasLink(where)) return '';
  const parts = linkifyParts((where as string).trim());
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:.,;·-]+|[\s:.,;·-]+$/g, '')
    .trim();
}

/**
 * What to call the button, so it is obvious before anybody taps it.
 *
 * Named after the service where it can be told, because "Join the Zoom call" is
 * recognised in a way a bare address never is, and somebody about to be late
 * reads the button rather than the URL. Anything unrecognised gets the honest
 * general wording instead of a guess.
 */
export function joinLabel(href: string): string {
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./i, ''); } catch { return 'Join the call'; }
  const is = (domain: string) => new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`, 'i').test(host);

  if (is('zoom.us')) return 'Join the Zoom call';
  if (is('meet.google.com')) return 'Join on Google Meet';
  if (is('teams.microsoft.com') || is('teams.live.com')) return 'Join on Teams';
  if (is('whereby.com')) return 'Join on Whereby';
  if (is('meet.jit.si')) return 'Join on Jitsi';
  if (is('messenger.com') || is('m.me')) return 'Join on Messenger';
  if (is('skype.com')) return 'Join on Skype';
  return 'Join the call';
}

/**
 * Where an IN-PERSON meeting is, as one tappable thing.
 *
 * THE SAME BUG AS THE JOIN LINK, one field along. The place was always turned
 * into a Google Maps SEARCH for whatever text was there. Paste a map link that
 * somebody shared from their phone and the app searched Maps for the URL --
 * a search for `https://maps.app.goo.gl/xyz` finds nothing, and the precise
 * pin the sender went to the trouble of sharing was thrown away in favour of
 * guessing from the characters in its address.
 *
 * So: a link somebody pasted wins, because it is exact and a search is a
 * guess. Only then does the free text become a search.
 *
 * NO BARE-ADDRESS FALLBACK HERE, deliberately, and this is the one real
 * difference from the online field. That field is labelled "link to join the
 * call", so a lone token like `meet.google.com/x` can only be a link. This one
 * is labelled "Church cafe, 12 Rizal St", where `St.Mary` is a place and would
 * become `https://St.Mary`.
 *
 * WHAT KEEPS THAT TRUE HAS CHANGED, so the reasoning is written out rather
 * than left as a rule of thumb. linkifyParts used to require a scheme or a
 * leading `www.`; it now also reads a bare domain, because every link in every
 * lesson study was written that way and every one of them was dead text. What
 * stops `St.Mary` becoming a link is no longer the absence of bare-domain
 * matching but the ENDING: `Mary` is not on the list of endings, and no ending
 * that is also an English word ever will be. `12 Rizal St` has no dot at all.
 *
 * A place field holding `meet.google.com` does now become a link rather than a
 * map search, which is the honest consequence and the better answer anyway.
 */
export function placeUrl(mode: MeetingMode, where: string | null | undefined): string | null {
  if (mode !== 'in_person') return null;
  const text = (where ?? '').trim();
  if (!text) return null;

  const found = linkifyParts(text).find((part) => typeof part !== 'string');
  if (found) return (found as { href: string }).href;

  // Free text somebody typed, so it is encoded. Whitespace alone yielded no
  // link rather than a map of nowhere, and still does: `text` is trimmed and
  // empty is handled above.
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/**
 * What to call the button for a place.
 *
 * "Open in Maps" was hard-coded, which was true while every link WAS a maps
 * search and stops being true the moment a pasted link is honoured. A button
 * that says Maps and opens a Facebook event is a small lie told at the moment
 * somebody is trying to find a room.
 */
export function placeLabel(href: string): string {
  let url: URL;
  try { url = new URL(href); } catch { return 'Open the link'; }
  const host = url.hostname.replace(/^www\./i, '');
  const is = (domain: string) => new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`, 'i').test(host);

  if (is('maps.app.goo.gl') || is('maps.google.com') || is('goo.gl')) return 'Open in Maps';
  if (is('google.com') && /^\/maps/.test(url.pathname)) return 'Open in Maps';
  if (is('waze.com')) return 'Open in Waze';
  if (is('facebook.com') || is('fb.me')) return 'Open on Facebook';
  return 'Open the link';
}
