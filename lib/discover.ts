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
// AND FROM INSIDE THE APP (17 November 2026): the church's Admins and
// Executive Directors add apps on Home itself. Those live in the database
// (discover_apps) in the live app, and in this browser in the tutorial; they
// come after the deployment's own list, and an address in both shows once.
//
// WHAT IS REMEMBERED. Which cards this person skipped, on this device only,
// by address. Nothing about it leaves the browser.
// ---------------------------------------------------------------------------

import { pocketRefusal, tidyUrl } from './pocket.ts';

export interface DiscoverLink { title: string; url: string; about: string; /** Set for an app a leader added in the app. */ id?: string }
export interface DiscoverCard {
  key: string;
  title: string;
  url: string;
  about: string;
  /** Set when a leader added it in the app, so a leader can take it off. */
  id?: string;
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

/** The cards to show: the deployment's apps, then the church's own, minus anything skipped on this device. */
export function discoverCards(links: DiscoverLink[], skipped: string[]): DiscoverCard[] {
  const gone = new Set(skipped);
  const seen = new Set<string>();
  return links
    .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
    .map((l) => ({ key: l.url, title: l.title, url: l.url, about: l.about, id: l.id }))
    .filter((c) => !gone.has(c.key));
}

/** One app a leader typed in, checked the same way as the deployment's list; a reason when refused. */
export function checkNewApp(title: string, address: string): { link: DiscoverLink } | { refused: string } {
  const name = title.trim();
  if (!name) return { refused: 'Give the app a name.' };
  const url = tidyUrl(address);
  if (!url) return { refused: 'That does not look like a web address. Try pasting the whole thing.' };
  if (!url.startsWith('https://')) return { refused: 'Only secure (https) addresses can go on Discover.' };
  const refused = pocketRefusal(url);
  if (refused) return { refused };
  return { link: { title: name.slice(0, 60), url, about: '' } };
}

/** The tutorial's own apps, added by its sample leaders, kept in this browser. */
export const SAMPLE_APPS_KEY = 'hb-discover-sample-apps';
export function readSampleApps(): DiscoverLink[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SAMPLE_APPS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is DiscoverLink => !!x && typeof x.url === 'string' && typeof x.title === 'string').slice(0, 20) : [];
  } catch { return []; }
}
export function writeSampleApps(list: DiscoverLink[]): void {
  try { localStorage.setItem(SAMPLE_APPS_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* storage refused */ }
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
