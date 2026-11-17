// Discover: cards on Home for apps and study sites worth opening. Each can be
// skipped (×) or kept in the person's Pocket.
//
// APPS ONLY, NEVER NEWS (the founder, 17 November 2026). News and stories
// from the wider church belong to Church & Mission Updates, and only there,
// so the two never show the same thing twice.
//
// ---------------------------------------------------------------------------
// WHERE THE LINKS COME FROM. A study site is a recommendation, and who
// recommends what is each church's decision, not this project's. So the code
// ships no list of its own: a deployment names its sites in
// NEXT_PUBLIC_DISCOVER_LINKS (see .env.example), one per line or separated by
// semicolons, as `Title | https://address | One line about it`. Every address
// goes through the same gate as anything typed into the Pocket (tidyUrl, then
// pocketRefusal), so a setting cannot smuggle in what the Pocket refuses.
// Unset, Discover shows nothing at all.
//
// WHAT IS REMEMBERED. Which cards this person skipped, on this device only,
// by address. Nothing about it leaves the browser.
// ---------------------------------------------------------------------------

import { pocketRefusal, tidyUrl } from './pocket.ts';

export interface DiscoverLink { title: string; url: string; about: string }
export interface DiscoverCard {
  key: string;
  title: string;
  url: string;
  about: string;
}

export const DISCOVER_SKIPPED_KEY = 'hb-discover-skipped';
export const DISCOVER_MOST = 8;

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

/** The cards to show: the deployment's apps, minus anything skipped on this device. */
export function discoverCards(links: DiscoverLink[], skipped: string[]): DiscoverCard[] {
  const gone = new Set(skipped);
  return links
    .map((l) => ({ key: l.url, title: l.title, url: l.url, about: l.about }))
    .filter((c) => !gone.has(c.key));
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
