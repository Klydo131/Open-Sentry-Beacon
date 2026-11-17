// Reading an organisation's stories, server side, for both the stories API and
// the picture API (app/api/updates and app/api/updates/picture).
//
// ONLY ADDRESSES WRITTEN IN THE CODE ARE FETCHED. The feed comes from
// lib/updates/organisations.ts; a story page or a picture is fetched only when
// it is https on that organisation's own host, as `ownLink` checks. No caller
// ever names an address.

import { organisation, type Organisation } from '@/lib/updates/organisations';
import { hostsOf, mentioning, parseFeed, type Story } from '@/lib/updates/feed';

/** Said to the organisation's server: who is asking, and why. Never a browser's name. */
export const CALLER = 'OpenSentryBeacon/1 (church app; official news headlines)';
export const AN_HOUR = 60 * 60;

/** The hosts an organisation's stories, pages and pictures may live on. */
export function hostsFor(org: Organisation): string[] {
  const source = org.from ? organisation(org.from) : org;
  return hostsOf([source?.feed, source?.news, org.news]);
}

/** That organisation's stories, newest first; unreachable or refused is none. */
export async function readStories(org: Organisation): Promise<Story[]> {
  const source = org.from ? organisation(org.from) : org;
  let stories: Story[] = [];
  if (source?.feed) {
    try {
      const answer = await fetch(source.feed, {
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9', 'User-Agent': CALLER },
        next: { revalidate: AN_HOUR },
        signal: AbortSignal.timeout(8000),
      });
      if (answer.ok) stories = parseFeed(await answer.text(), hostsFor(org));
    } catch {
      // Unreachable is the same as no stories: Home says where to read them.
    }
  }
  return org.mentions ? mentioning(stories, org.mentions) : stories;
}
