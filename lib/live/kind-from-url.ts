// What kind of thing is at this address.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The library's add form asks for a Kind, offers five, and
// defaults to "Link". The dropdown sits BELOW the address box, so somebody
// pasting a YouTube URL reaches the button before they reach the question. The
// field is therefore whatever the form defaulted to, on almost every row.
//
// That was harmless while the kind was only a small icon. Then a filter was
// built on top of it -- chips reading "Video 2", "PDF 1" -- and a field nobody
// maintains became a control that LIES. On this church's shelf, two of the nine
// items filed as "link" are YouTube videos: tapping Video hides half the real
// videos, and the person doing the tapping has no way to tell.
//
// The fix is not a better dropdown. It is to stop asking somebody to classify
// something the address already says plainly. This reads the URL and offers the
// answer as the DEFAULT; the dropdown stays, and a deliberate choice still
// wins. See the add form for how "deliberate" is decided.
//
// DELIBERATELY CONSERVATIVE. It returns null rather than guessing. A wrong
// confident answer is worse than no answer here: it overwrites a correct
// default with an incorrect one and looks authoritative doing it. Only hosts
// and extensions that mean one specific thing are listed.
//
// NOT A SECURITY BOUNDARY, AND MUST NEVER BECOME ONE. The kind is a label for
// sorting a shelf. It decides an icon and a filter chip, never what is fetched,
// rendered, or trusted. The upload allowlist is a separate thing and lives
// elsewhere; if something here ever starts deciding whether content is safe,
// that decision belongs in the database, not in a string match in the browser.
// ---------------------------------------------------------------------------
import type { MaterialKind } from './data';

/** Hosts that only ever serve one kind of thing. */
const VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'rumble.com',
];

const AUDIO_HOSTS = [
  'spotify.com', 'soundcloud.com', 'anchor.fm', 'podcasts.apple.com',
  'buzzsprout.com', 'podbean.com',
];

/** Extensions that say it outright. The dot is part of the match. */
const BY_EXTENSION: ReadonlyArray<readonly [RegExp, MaterialKind]> = [
  [/\.pdf$/i, 'pdf'],
  [/\.(mp3|m4a|wav|ogg|aac|flac)$/i, 'audio'],
  [/\.(mp4|mov|webm|mkv|avi)$/i, 'video'],
  [/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i, 'image'],
];

/**
 * The kind this address plainly is, or null when it is not plain.
 *
 * null means "no opinion", and the caller should leave whatever is already
 * chosen alone. It does NOT mean 'link'.
 */
export function kindFromUrl(raw: string): MaterialKind | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Half-typed addresses arrive here on every keystroke. Not an error.
    return null;
  }

  // Only the two schemes the column's own check constraint allows. Anything
  // else is not a thing this app stores, so it gets no opinion.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // HOST MATCHED ON A LABEL BOUNDARY, NOT `includes`. `includes('youtube.com')`
  // is also true of `youtube.com.example.net`, which is somebody else's domain
  // wearing this one as a prefix. Matching the host exactly or as a subdomain
  // is the difference between reading an address and being fooled by one.
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const hostIs = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (VIDEO_HOSTS.some(hostIs)) return 'video';
  if (AUDIO_HOSTS.some(hostIs)) return 'audio';

  // The PATH only, never the query string. `?redirect=/a.pdf` is a parameter
  // about a PDF, not a PDF, and reading it as one would mislabel every share
  // link that carries a destination.
  for (const [pattern, kind] of BY_EXTENSION) {
    if (pattern.test(url.pathname)) return kind;
  }

  return null;
}
