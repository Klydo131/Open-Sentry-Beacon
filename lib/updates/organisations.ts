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
    // Its own site (the founder, 12 November 2026: the card led to the
    // Division's news instead). Headlines still come from the Division's feed,
    // the stories that name the Union; the card and "See more" open the Union.
    news: 'https://adventisthope.ph/',
    from: 'ssd',
    mentions: ['Southern Luzon', 'SLPUM'],
    colour: '#8A4B08',
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

/** What a device shows until somebody chooses: the deployment's own list, or the first two. */
export function featured(setting: string | undefined): string[] {
  const asked = (setting ?? '').split(',').map((s) => s.trim().toLowerCase())
    .filter((id) => organisation(id));
  return asked.length ? [...new Set(asked)] : ORGANISATIONS.slice(0, 2).map((o) => o.id);
}
