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
      summary: plain(field(block, 'description') || field(block, 'summary') || field(block, 'content'), 220),
      link,
      date: Number.isFinite(when) ? new Date(when).toISOString() : null,
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
