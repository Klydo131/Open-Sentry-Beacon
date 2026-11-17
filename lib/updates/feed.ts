// Read an organisation's public news feed (RSS 2.0 or Atom) into stories.
//
// Pure: no network, so tests/church-and-mission-updates.mjs runs it in Node.
// What comes out is plain text and a link on the organisation's own site;
// nothing in a feed is ever drawn as HTML.

export interface Story {
  title: string;
  summary: string;
  link: string;
  /** ISO date, or null when the feed gave none this app can read. */
  date: string | null;
  /**
   * The story's own picture, as the feed names it (an https address on the
   * organisation's own host). Server side only: the API swaps it for this
   * app's own address before a phone sees it, so a phone never fetches from
   * another site and the content policy needs no widening.
   */
  picture?: string;
  /** What a phone is given instead: this app's own picture address. */
  image?: string;
}

export const MAX_STORIES = 8;

// Named by number: the house rule keeps typographic dashes out of the source,
// and a feed's own punctuation is the feed's to choose.
const at = (point: number) => String.fromCodePoint(point);
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: at(0x2019), lsquo: at(0x2018), rdquo: at(0x201d), ldquo: at(0x201c),
  ndash: at(0x2013), mdash: at(0x2014), hellip: at(0x2026),
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) && point > 31 && point < 0x10ffff ? String.fromCodePoint(point) : ' ';
  });
}

/** Markup and CDATA out, entities read, spaces tidied, cut at a word. */
export function plain(raw: string, limit: number): string {
  const text = decode(
    raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' '),
  ).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 40)).trimEnd()}…`;
}

function field(block: string, name: string): string {
  const found = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return found ? found[1] : '';
}

/**
 * WordPress puts "The post <title> appeared first on <site>." in a feed that
 * carries no excerpt. It says nothing a card does not already show, so a card
 * shows no summary instead (found on a Union's live feed, 17 November 2026).
 */
export function noBoilerplate(summary: string): string {
  return /^The post [\s\S]* appeared first on [\s\S]*\.?$/.test(summary.trim()) ? '' : summary;
}

/** An https link on one of the organisation's own hosts, or ''. */
export function ownLink(raw: string, hosts: string[]): string {
  try {
    const url = new URL(decode(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim());
    const host = url.hostname.toLowerCase();
    const theirs = hosts.some((h) => host === h || host.endsWith(`.${h}`));
    return url.protocol === 'https:' && theirs && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

// Small pictures a feed carries that are not the story's: logos, avatars,
// favicons, and the thumbnails WordPress names by their size.
const NOT_A_PHOTO = /cropped-|logo|avatar|gravatar|favicon|emoji|icon|\.svg(?:$|\?)/i;

/** A logo or a thumbnail by its address: a known mark, or a WordPress size under 400px. */
function notAPhoto(pathname: string): boolean {
  if (NOT_A_PHOTO.test(pathname)) return true;
  const size = /[-_](\d{2,4})x(\d{2,4})\.[a-z]+$/i.exec(pathname);
  return !!size && Math.min(Number(size[1]), Number(size[2])) < 400;
}

/** The first picture in a feed item that is a photo on the organisation's own host, or ''. */
export function pictureOf(block: string, hosts: string[]): string {
  const found: string[] = [];
  for (const [, url] of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["']/gi)) found.push(url);
  for (const [tag] of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const url = /\burl=["']([^"']+)["']/i.exec(tag)?.[1];
    if (url && /type=["']image\//i.test(tag)) found.push(url);
  }
  // Inside the story's own text, which a feed escapes or wraps in CDATA.
  const body = decode(block.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
  for (const [, url] of body.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) found.push(url);
  for (const raw of found) {
    const url = ownLink(raw, hosts);
    if (url && !notAPhoto(new URL(url).pathname)) return url;
  }
  return '';
}

/** The picture a story's own page names for sharing (og:image), on its own host, or ''. */
export function sharedPictureOf(html: string, hosts: string[]): string {
  for (const [tag] of html.slice(0, 300_000).matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i.test(tag)) continue;
    const url = ownLink(/\bcontent=["']([^"']+)["']/i.exec(tag)?.[1] ?? '', hosts);
    if (url && !notAPhoto(new URL(url).pathname)) return url;
  }
  return '';
}

/** The hosts an organisation's stories may link to: its feed's and its news page's. */
export function hostsOf(addresses: (string | undefined)[]): string[] {
  const hosts = new Set<string>();
  for (const address of addresses) {
    try { hosts.add(new URL(address ?? '').hostname.toLowerCase().replace(/^(www|news)\./, '')); } catch { /* not an address */ }
  }
  return [...hosts];
}

/**
 * The stories in a feed, newest first as the feed gives them. Anything that is
 * not a feed (an error page, a security checkpoint) is no stories, never a throw.
 */
export function parseFeed(xml: string, hosts: string[]): Story[] {
  if (typeof xml !== 'string' || !/<(rss|feed)[\s>]/i.test(xml.slice(0, 4000))) return [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const stories: Story[] = [];
  for (const block of blocks) {
    const title = plain(field(block, 'title'), 160);
    // RSS puts the address inside <link>; Atom puts it in href.
    const atom = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block);
    const link = ownLink(field(block, 'link') || (atom ? atom[1] : ''), hosts);
    if (!title || !link) continue;
    const when = Date.parse(decode(field(block, 'pubDate') || field(block, 'published') || field(block, 'updated')).trim());
    stories.push({
      title,
      summary: noBoilerplate(plain(field(block, 'description') || field(block, 'summary') || field(block, 'content'), 220)),
      link,
      date: Number.isFinite(when) ? new Date(when).toISOString() : null,
      ...(pictureOf(block, hosts) ? { picture: pictureOf(block, hosts) } : {}),
    });
    if (stories.length === MAX_STORIES) break;
  }
  return stories;
}

/** The stories that name one of these, in the title or the summary. */
export function mentioning(stories: Story[], words: string[]): Story[] {
  const wanted = words.map((w) => w.toLowerCase());
  return stories.filter((s) => {
    const text = `${s.title} ${s.summary}`.toLowerCase();
    return wanted.some((w) => text.includes(w));
  });
}
