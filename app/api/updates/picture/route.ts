// A story's picture, fetched by this app's server from the organisation's own
// site and handed to the phone as this app's own image.
//
// ---------------------------------------------------------------------------
// WHY THROUGH THE SERVER. The content policy is `img-src 'self'`, so a phone
// draws only pictures from this app. Widening it to every church site would
// let any page of the app load from them; this keeps it shut and means a
// member's phone never tells another site it opened Home.
//
// WHAT CAN BE ASKED FOR: an organisation and a story's number, never an
// address. The address is the one in that organisation's own feed, or the
// og:image on the story's own page, and either must be https on the
// organisation's own host (ownLink). Redirects are not followed, so a
// picture cannot be bounced somewhere else. Only JPEG, PNG, WebP, GIF and
// AVIF are passed on (never SVG, which can carry script), at most 4 MB, with
// `nosniff` and a policy of its own that runs nothing.
// ---------------------------------------------------------------------------

import { organisation } from '@/lib/updates/organisations';
import { sharedPictureOf } from '@/lib/updates/feed';
import { CALLER, hostsFor, readStories } from '@/lib/updates/read';

const A_DAY = 24 * 60 * 60;
const MOST_BYTES = 4 * 1024 * 1024;
const PICTURE = /^image\/(jpeg|png|webp|gif|avif)$/;

const none = () => new Response(null, { status: 404, headers: { 'Cache-Control': `public, s-maxage=${A_DAY / 4}` } });

/** One request, no redirects, a deadline, and at most `cap` bytes, or null. */
async function take(url: string, accept: string, cap: number): Promise<{ type: string; bytes: Uint8Array } | null> {
  try {
    const answer = await fetch(url, {
      headers: { Accept: accept, 'User-Agent': CALLER },
      redirect: 'manual',
      next: { revalidate: A_DAY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!answer.ok || !answer.body) return null;
    const type = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const reader = answer.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
    return { type, bytes };
  } catch {
    return null;
  }
}

/** Room for a slow organisation's feed (lib/updates/read.ts waits up to 20 s). */
export const maxDuration = 30;

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams;
  const org = organisation(asked.get('org') ?? '');
  const n = Number(asked.get('n'));
  if (!org || !Number.isInteger(n) || n < 0 || n > 20) return none();

  const story = (await readStories(org))[n];
  if (!story) return none();

  let src = story.picture ?? '';
  if (!src) {
    // The feed named none: the picture the story's own page offers for sharing.
    const page = await take(story.link, 'text/html', 600 * 1024);
    if (page) src = sharedPictureOf(new TextDecoder().decode(page.bytes), hostsFor(org));
  }
  if (!src) return none();

  const picture = await take(src, 'image/avif,image/webp,image/jpeg,image/png,image/gif', MOST_BYTES);
  if (!picture || !PICTURE.test(picture.type)) return none();

  return new Response(picture.bytes as BodyInit, {
    headers: {
      'Content-Type': picture.type,
      'Cache-Control': `public, max-age=${A_DAY}, s-maxage=${A_DAY}, stale-while-revalidate=${7 * A_DAY}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
