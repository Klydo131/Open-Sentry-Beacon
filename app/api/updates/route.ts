// Church & Mission Updates: an organisation's own news, read by this app's
// server so a member's phone never talks to another site to draw Home.
//
// Only the addresses in lib/updates/organisations.ts are ever fetched: the
// caller names an organisation, never an address. A feed that refuses or is
// not a feed is "no stories", and Home offers the organisation's news page.

import { NextResponse } from 'next/server';
import { organisation } from '@/lib/updates/organisations';
import { hostsOf, mentioning, parseFeed, type Story } from '@/lib/updates/feed';

/** Said to the organisation's server: who is asking, and why. Never a browser's name. */
const CALLER = 'OpenSentryBeacon/1 (church app; official news headlines)';
const AN_HOUR = 60 * 60;

export async function GET(request: Request) {
  const org = organisation(new URL(request.url).searchParams.get('org') ?? '');
  if (!org) return NextResponse.json({ error: 'No such organisation.' }, { status: 404 });

  const source = org.from ? organisation(org.from) : org;
  let stories: Story[] = [];
  if (source?.feed) {
    try {
      const answer = await fetch(source.feed, {
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9', 'User-Agent': CALLER },
        next: { revalidate: AN_HOUR },
        signal: AbortSignal.timeout(8000),
      });
      if (answer.ok) stories = parseFeed(await answer.text(), hostsOf([source.feed, source.news]));
    } catch {
      // Unreachable is the same as no stories: Home says where to read them.
    }
  }
  if (org.mentions) stories = mentioning(stories, org.mentions);

  return NextResponse.json(
    { org: org.id, stories },
    { headers: { 'Cache-Control': `public, s-maxage=${AN_HOUR}, stale-while-revalidate=${24 * AN_HOUR}` } },
  );
}
