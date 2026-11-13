// Turn the links people type into links they can tap.
//
// Somebody shares a passage, a video, a church notice — and until now it landed
// as dead text that the other person had to select, copy and paste into a
// browser. On a phone that is a genuine barrier, and the people this app is for
// are not the people who will bother.
//
// ---------------------------------------------------------------------------
// THIS IS AN INJECTION SURFACE, AND IT IS BUILT LIKE ONE.
//
// Everything below takes text that one member typed and renders it into a
// screen another member is reading. The obvious implementation — a regular
// expression that wraps matches in <a> tags, fed to dangerouslySetInnerHTML —
// is the single most common way an app of this shape gets an XSS hole, because
// the same string then carries both the link AND any markup the author felt
// like including.
//
// So this never produces HTML. It splits the text into plain strings and React
// elements, and React escapes every string it renders. There is no path from
// what somebody types to markup, whatever they type.
//
// THE SECOND HALF, which the escaping does not cover: a URL is not safe merely
// because it was escaped. `javascript:alert(1)` is a perfectly well-formed URL,
// and putting it in an href gives you script execution on click. So every
// candidate is parsed with the URL constructor and its protocol checked against
// an allowlist of exactly two. Anything else is left as the text it was.
//
// Both halves matter. The escaping stops markup; the allowlist stops schemes.
// ---------------------------------------------------------------------------

import { parseSafeHttpUrl } from './url.ts';

// The endings that may start a link on their own.
//
// WHY THERE IS A LIST AT ALL, RATHER THAN "any dot followed by letters".
//
// Every link in the church's actual lesson studies was written as a bare
// domain: `adventist.org/beliefs`, `whiteestate.org`,
// `voiceofprophecy.com/study/discover`. Not one carried `https://` or `www.`,
// so not one of them was tappable, in the room where an Explorer is being
// asked to go and read something. That is the whole reason this exists.
//
// But matching any `word.word` turns the commonest typo in prose -- a missing
// space after a full stop -- into a link. And the words that collide are
// decided by which endings are real: `.is`, `.it`, `.at`, `.so`, `.be`, `.me`,
// `.us`, `.life`, `.love`, `.faith`, `.church` and `.bible` are ALL genuine
// endings, and in a church app the sentence "saved by grace.Faith is the gift"
// is not a hypothetical. Every one of those is left out on purpose, and the
// rule is simple enough to keep: if the ending is also an English word,
// it is not on this list.
//
// Adding to it is safe in the way that matters. Nothing here decides what is
// SAFE to open -- `safeHref` below still parses every candidate and still
// allows exactly two protocols. This list only decides what looks like
// somebody meant to write a link.
const BARE_ENDINGS = [
  'com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'app', 'dev',
  'info', 'biz', 'tv', 'xyz', 'ph', 'uk', 'ca', 'au', 'nz', 'sg',
];

// Bare `www.` is included because that is how people actually write a link when
// they are not thinking about it. `<` is excluded from the run so a URL can
// never swallow the start of something that looks like a tag.
//
// The third branch is the bare domain. It requires at least one dot, an ending
// from the list above, and that the ending is not merely the front of a longer
// label -- without that lookahead, `adventist.organisation` would link as
// `adventist.org`.
const CANDIDATE = new RegExp(
  '(https?://[^\\s<]+'
  + '|www\\.[^\\s<]+'
  + `|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${BARE_ENDINGS.join('|')})(?![a-z0-9-])(?::\\d{2,5})?(?:[/?#][^\\s<]*)?`
  + ')',
  'gi',
);

/**
 * Is this whole string shaped like an address, rather than merely containing
 * one? The one question `safeHref` may use to decide whether to supply a
 * missing `https://`.
 *
 * Anchored at both ends on purpose: `7.30pm` contains a dot and is a time,
 * and the difference between it and `zoom.us` is entirely the ending.
 */
const HOST_SHAPE = new RegExp(
  '^(?:www\\.[^\\s<]+'
  + `|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${BARE_ENDINGS.join('|')})(?![a-z0-9-])(?::\\d{2,5})?(?:[/?#][^\\s<]*)?`
  + ')$',
  'i',
);

/**
 * Trailing punctuation belongs to the sentence, not the address.
 *
 * "Have a look at https://example.org/psalms." — the full stop is the writer's,
 * and including it gives a broken link. Closing brackets are only trimmed when
 * the URL does not open one itself, so links that legitimately contain
 * parentheses survive.
 */
function trimTrailing(raw: string): { url: string; tail: string } {
  let url = raw;
  let tail = '';
  for (;;) {
    const last = url[url.length - 1];
    if (!last) break;
    if ('.,;:!?"\''.includes(last)) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    if (last === ')' && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    if ((last === ']' || last === '}') ) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, tail };
}

/**
 * The href for a candidate, or null if it must stay plain text.
 *
 * Parsing rather than pattern-matching, because a regular expression that
 * decides what is safe is a regular expression somebody will eventually get
 * past. The URL constructor either understands it or throws, and then exactly
 * two protocols are allowed through.
 */
export function safeHref(candidate: string): string | null {
  // `www.example.org` and `adventist.org/beliefs` are how people write a link
  // when they are not thinking about schemes. Everything after that is the
  // shared decision in lib/url.ts, so prose links and typed-in link fields
  // cannot drift apart on what counts as safe.
  //
  // THE GUARD IS THE POINT OF THIS LINE, not the convenience. Prefixing
  // anything that lacks a scheme would prefix `javascript:alert(1)` too, and
  // `https://javascript:alert(1)` is a different string that a parser might
  // yet accept. So a candidate that already carries ANY scheme is passed
  // through untouched and refused by parseSafeHttpUrl, which allows exactly
  // http and https. Only something with no scheme at all is completed.
  //
  // ONLY SOMETHING SHAPED LIKE AN ADDRESS IS COMPLETED, and the gate is what
  // taught this. The first version completed anything without a scheme, and
  // `safeHref` is shared with lib/live/meeting-link.ts, whose whole design
  // rests on it NOT doing that: that file runs its own stricter shape test and
  // then hands the raw text over, trusting a refusal. So `https://` was
  // prefixed onto `7.30pm`, `4.30`, `192.168.1.1` and `idn-soex-nkb`, every one
  // of which the URL parser then accepts as a perfectly good host -- and a time
  // of day became a Join button on a meeting card. Exactly the failure that
  // file's comments say it exists to prevent, reintroduced from underneath it.
  //
  // THE SHAPE TEST IS THE WHOLE DECISION, with no "does it already have a
  // scheme" test beside it. There was one, and it was wrong in a way worth
  // recording: a scheme is `[a-z][a-z0-9+.-]*:` by the spec, so `example.com:`
  // reads as a scheme and `example.com:8080/x` was refused as though somebody
  // had typed `mailto:`. HOST_SHAPE is anchored at both ends and demands a
  // known ending, which no real scheme can satisfy -- `javascript:alert(1)`
  // and `data:text/html,...` have no dotted host in front of the colon, and
  // `data.io:evil` fails because what follows the colon is not a port. So the
  // one question answers both, and anything it refuses passes through to the
  // guard that allows exactly http and https.
  const completable = HOST_SHAPE.test(candidate);
  return parseSafeHttpUrl(completable ? `https://${candidate}` : candidate)?.href ?? null;
}

/**
 * The words a link is shown with: what was written, except a host written in
 * letters outside plain ASCII, which is shown the way the browser will reach
 * it.
 *
 * FOUND BY THE SECURITY REVIEW OF 1 OCTOBER 2026. `https://\u0430pple.com`,
 * with a Cyrillic \u0430, looks exactly like the real name on screen and opens
 * somewhere else entirely. The address the tap opens is `xn--pple-43d.com`,
 * so that is what the reader is shown. A genuine name with an accent in it
 * shows in the same form; it is less pretty, and it is honest about where the
 * link goes, which is what the underline promises.
 */
function shownLabel(written: string, href: string): string {
  const host = /^(?:https?:\/\/)?([^/?#:]+)/i.exec(written)?.[1] ?? '';
  if (!/[^\u0000-\u007f]/.test(host)) return written;
  try {
    return written.replace(host, new URL(href).hostname);
  } catch {
    return href;
  }
}

/**
 * Split text into plain strings and anchors.
 *
 * Exported for the tests, which check the pieces rather than a rendered blob.
 */
export function linkifyParts(text: string): Array<string | { href: string; label: string }> {
  const parts: Array<string | { href: string; label: string }> = [];
  let cursor = 0;

  // A fresh regex per call: /g regexes carry lastIndex between uses, and a
  // shared one silently skips matches on every other call.
  const re = new RegExp(CANDIDATE.source, 'gi');
  let match = re.exec(text);

  while (match) {
    // A link has to START somewhere a link can start. Without this the pattern
    // happily matches the `https://...` buried inside `blob:https://...`, and
    // links a fragment of a larger token that the writer never wrote as a link.
    const before = match.index === 0 ? '' : text[match.index - 1];
    const atBoundary = before === '' || /[\s(<[{'"]/.test(before);

    // AND IT HAS TO END SOMEWHERE A LINK CAN END. A domain immediately
    // followed by `@` or `:` is user info or a mangled address, never a link
    // anybody meant to write. The `:` case is the sharper of the two:
    // `meet.google.com:pass@evil.example/x` reads as Google Meet and goes
    // somewhere else, and because a real port is digits the run stops at the
    // colon and would otherwise leave `meet.google.com` underlined in front of
    // the trick. A genuine `example.com:8080/x` is matched WHOLE by the pattern
    // above, port and all, so this refuses only the malformed shape. `adventist.org@evil.example/give` is the shape: the
    // scheme'd version is already refused by parseSafeHttpUrl for carrying
    // user info, but written bare the run stops at the `@` and what is left,
    // `adventist.org`, is perfectly safe on its own. Linking it is not an
    // attack -- the tap goes to adventist.org, which is the opposite of what
    // whoever wrote it wanted -- but it puts an underline under half of a
    // string and leaves the rest as text, which reads as though the whole
    // thing is the destination. Refuse the whole run instead.
    const after = text[match.index + match[0].length] ?? '';

    const { url, tail } = trimTrailing(match[0]);
    const href = atBoundary && after !== '@' && after !== ':' ? safeHref(url) : null;

    if (href) {
      if (match.index > cursor) parts.push(text.slice(cursor, match.index));
      parts.push({ href, label: shownLabel(url, href) });
      if (tail) parts.push(tail);
      cursor = match.index + match[0].length;
    }
    // No href means it stays text, and the slice below picks it up.

    match = re.exec(text);
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
