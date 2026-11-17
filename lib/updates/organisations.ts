// The Adventist organisations whose news Home can show.
//
// Every address here was confirmed as the organisation's own before it was
// added (12 November 2026). Add one only the same way: a wrong link under an
// organisation's name is worse than no link.

export interface Organisation {
  /** In the address and in what a device remembers. Lowercase letters. */
  id: string;
  /** On a chip: "GC". */
  short: string;
  name: string;
  /** Where a person reads its news. Always offered, feed or no feed. */
  news: string;
  /** Its public feed, when it publishes one. */
  feed?: string;
  /**
   * For an organisation whose news is published by another: that
   * organisation's id, and the words a story about this one carries.
   */
  from?: string;
  mentions?: string[];
  /** The tile behind its initials. Dark enough for white letters (4.5:1). */
  colour: string;
}

export const ORGANISATIONS: readonly Organisation[] = [
  {
    id: 'gc',
    short: 'GC',
    name: 'General Conference',
    news: 'https://adventist.news/',
    feed: 'https://adventist.news/feed',
    colour: '#1F5FD6',
  },
  {
    id: 'ssd',
    short: 'SSD',
    name: 'Southern Asia-Pacific Division',
    news: 'https://news.adventist.asia/all',
    feed: 'https://news.adventist.asia/feed',
    colour: '#0F7B5F',
  },
  {
    id: 'slpum',
    short: 'SLPUM',
    name: 'Southern Luzon Philippine Union Mission',
    // Its own site and its own feed. Until 17 November 2026 its headlines were
    // the Division's stories that named it, but the Division's feed answers an
    // automatic reader with a security checkpoint; the Union's own feed
    // answered a server on Vercel's network with ten stories and their photos.
    news: 'https://adventisthope.ph/',
    feed: 'https://adventisthope.ph/feed/',
    colour: '#8A4B08',
  },
  // Added 17 November 2026: each feed answered a server on Vercel's network
  // with stories on the organisation's own site.
  {
    id: 'spd',
    short: 'SPD',
    name: 'South Pacific Division (Adventist Record)',
    news: 'https://record.adventistchurch.com/',
    feed: 'https://record.adventistchurch.com/feed/',
    colour: '#1D4E89',
  },
  {
    id: 'iad',
    short: 'IAD',
    name: 'Inter-American Division',
    news: 'https://interamerica.org/',
    feed: 'https://www.interamerica.org/feed/',
    colour: '#7A1F3D',
  },
  {
    id: 'ted',
    short: 'TED',
    name: 'Trans-European Division',
    news: 'https://ted.adventist.org/',
    feed: 'https://ted.adventist.org/feed/',
    colour: '#2E5E2A',
  },
  {
    id: 'adra',
    short: 'ADRA',
    name: 'Adventist Development and Relief Agency',
    news: 'https://adra.org/news',
    feed: 'https://adra.org/feed',
    colour: '#166534',
  },
  {
    id: 'awr',
    short: 'AWR',
    name: 'Adventist World Radio',
    news: 'https://awr.org/',
    feed: 'https://www.awr.org/feed/',
    colour: '#9A3412',
  },
  {
    id: 'nad',
    short: 'NAD',
    name: 'North American Division',
    news: 'https://www.nadadventist.org/news',
    colour: '#5B3FA0',
  },
];

/** Where every other division and union is listed, by the church itself. */
export const WORLD_CHURCH = 'https://adventist.org/church/world-church/';

export const organisation = (id: string): Organisation | undefined =>
  ORGANISATIONS.find((o) => o.id === id);

/**
 * What Home follows when the deployment names nothing: the world church and a
 * division, beside two whose feeds carry photos, so a fresh copy opens on
 * pictures rather than only links.
 */
const STARTING = ['gc', 'ssd', 'spd', 'iad'];

/** What a device shows until somebody chooses: the deployment's own list, or the starting four. */
export function featured(setting: string | undefined): string[] {
  const asked = (setting ?? '').split(',').map((s) => s.trim().toLowerCase())
    .filter((id) => organisation(id));
  return asked.length ? [...new Set(asked)] : STARTING;
}
