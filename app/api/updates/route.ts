// Church & Mission Updates: an organisation's own news, read by this app's
// server so a member's phone never talks to another site to draw Home.
//
// Only the addresses in lib/updates/organisations.ts are ever fetched: the
// caller names an organisation, never an address (lib/updates/read.ts). A feed
// that refuses or is not a feed is "no stories", and Home offers the
// organisation's news page.
//
// EVERY STORY GETS A PICTURE ADDRESS ON THIS APP, never the other site's: a
// phone loads /api/updates/picture, which fetches the organisation's own photo.
// So the content policy stays `img-src 'self'` and the member's phone tells no
// other site that it opened Home.

import { NextResponse } from 'next/server';
import { organisation } from '@/lib/updates/organisations';
import { AN_HOUR, readStories } from '@/lib/updates/read';

/** Room for a slow organisation's feed (lib/updates/read.ts waits up to 20 s). */
export const maxDuration = 30;

export async function GET(request: Request) {
  const org = organisation(new URL(request.url).searchParams.get('org') ?? '');
  if (!org) return NextResponse.json({ error: 'No such organisation.' }, { status: 404 });

  const stories = (await readStories(org)).map(({ picture: _src, ...story }, n) => ({
    ...story,
    // Every story is offered one: the picture route also looks on the story's
    // own page when the feed named none, and answers 404 when there is none.
    image: `/api/updates/picture?org=${org.id}&n=${n}`,
  }));

  return NextResponse.json(
    { org: org.id, stories },
    { headers: { 'Cache-Control': `public, s-maxage=${AN_HOUR}, stale-while-revalidate=${24 * AN_HOUR}` } },
  );
}
