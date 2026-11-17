// Discover: cards on Home that offer something worth opening, a study site or
// a fresh story from the wider church. Each can be skipped (×) or kept in the
// person's Pocket.
//
// ---------------------------------------------------------------------------
// WHERE THE LINKS COME FROM. A study site is a recommendation, and who
// recommends what is each church's decision, not this project's. So the code
// ships no list of its own: a deployment names its sites in
// NEXT_PUBLIC_DISCOVER_LINKS (see .env.example), one per line or separated by
// semicolons, as `Title | https://address | One line about it`. Every address
// goes through the same gate as anything typed into the Pocket (tidyUrl, then
// pocketRefusal), so a setting cannot smuggle in what the Pocket refuses.
// Unset, Discover shows only the newest official stories, which need no
// recommendation from anybody.
//
// WHAT IS REMEMBERED. Which cards this person skipped, on this device only,
// by address. Nothing about it leaves the browser.
// ---------------------------------------------------------------------------

import { pocketRefusal, tidyUrl } from './pocket.ts';

export interface DiscoverLink { title: string; url: string; about: string }
export interface DiscoverCard {
  key: string;
  kind: 'study' | 'news';
  title: string;
  url: string;
  about: string;
  /** For news: who published it and when, already in words. */
  source?: string;
  /** A picture on this app (the caller has already checked it), or none. */
  image?: string;
  /** The publisher's colour, behind a card with no picture. */
  colour?: string;
}

export const DISCOVER_SKIPPED_KEY = 'hb-discover-skipped';
export const DISCOVER_MOST = 8;
const NEWS_SHOWN = 3;

/** The deployment's own list, every entry checked; anything malformed is left out. */
export function discoverLinks(setting: string | undefined): DiscoverLink[] {
  if (!setting) return [];
  const seen = new Set<string>();
  const out: DiscoverLink[] = [];
  for (const line of setting.split(/\n|;/)) {
    const [rawTitle = '', rawUrl = '', ...rest] = line.split('|').map((s) => s.trim());
    const url = tidyUrl(rawUrl);
    if (!rawTitle || !url || !url.startsWith('https://') || pocketRefusal(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: rawTitle.slice(0, 60), url, about: rest.join(' | ').slice(0, 120) });
    if (out.length >= DISCOVER_MOST) break;
  }
  return out;
}

/** The cards to show: study sites first, then the newest stories, minus anything skipped. */
export function discoverCards(
  links: DiscoverLink[],
  stories: { title: string; link: string; summary?: string; source: string; image?: string; colour?: string }[],
  skipped: string[],
): DiscoverCard[] {
  const gone = new Set(skipped);
  const study: DiscoverCard[] = links.map((l) => ({ key: l.url, kind: 'study', title: l.title, url: l.url, about: l.about }));
  const news: DiscoverCard[] = [];
  for (const s of stories) {
    const url = tidyUrl(s.link);
    if (!url || !url.startsWith('https://') || news.some((n) => n.url === url)) continue;
    news.push({ key: url, kind: 'news', title: s.title.slice(0, 120), url, about: (s.summary ?? '').slice(0, 140), source: s.source, image: s.image, colour: s.colour });
    if (news.length >= NEWS_SHOWN) break;
  }
  return [...study, ...news].filter((c) => !gone.has(c.key));
}

/** Skipped addresses on this device; a private window that refuses storage skips nothing. */
export function readSkipped(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DISCOVER_SKIPPED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-200) : [];
  } catch { return []; }
}

export function skip(key: string): string[] {
  const next = [...readSkipped().filter((k) => k !== key), key].slice(-200);
  try { localStorage.setItem(DISCOVER_SKIPPED_KEY, JSON.stringify(next)); } catch { /* storage refused */ }
  return next;
}
