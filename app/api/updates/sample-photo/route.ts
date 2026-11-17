// One of the sample church's real photographs (lib/updates/sample-photos.ts),
// fetched from the address written there and handed on as this app's own
// image. Asked for by name, never by address. Anything that goes wrong sends
// the browser to the drawing it replaces, so the tutorial never shows a
// broken picture, offline or on a private network.

import { SAMPLE_PHOTOS } from '@/lib/updates/sample-photos';
import { CALLER } from '@/lib/updates/read';

const A_WEEK = 7 * 24 * 60 * 60;
const MOST_BYTES = 4 * 1024 * 1024;

export const maxDuration = 20;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const photo = Object.prototype.hasOwnProperty.call(SAMPLE_PHOTOS, id) ? SAMPLE_PHOTOS[id] : null;
  if (!photo) return new Response(null, { status: 404 });
  const instead = () => Response.redirect(new URL(photo.fallback, request.url), 302);

  try {
    const answer = await fetch(photo.src, {
      headers: { Accept: 'image/jpeg,image/webp', 'User-Agent': CALLER },
      redirect: 'manual',
      next: { revalidate: A_WEEK },
      signal: AbortSignal.timeout(10_000),
    });
    const type = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!answer.ok || !/^image\/(jpeg|webp)$/.test(type)) return instead();
    const bytes = new Uint8Array(await answer.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MOST_BYTES) return instead();
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': type,
        'Cache-Control': `public, max-age=${A_WEEK}, s-maxage=${A_WEEK}, stale-while-revalidate=${4 * A_WEEK}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return instead();
  }
}
