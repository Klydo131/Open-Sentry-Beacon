// Takes the location out of a photo the file store has just kept, if it still
// carries one. Called by the database when a photo is stored or replaced
// (supabase/migrations/20261027170000_a_photo_is_checked_on_the_server.sql).
//
// WHY ON THE SERVER TOO. The app takes a photo's location out in the browser,
// before the photo is sent (lib/live/shrink-image.ts). A modified copy of the
// app, or somebody calling the file store directly, skips the browser. This is
// the second place it happens, so the privacy page's promise ("the location
// your camera recorded is removed") does not depend on the app being the one
// that sent the photo. Asked for on 27 October 2026, from the costed plan
// "Rust and Python for Hope Beacon", which found that no new language was
// needed for this: the reader the browser uses is plain TypeScript.
//
// WHAT IT DOES, for a file in `pairing-media` or `post-media`:
//   * a JPEG that says where it was taken is REMADE from its pixels by the
//     Rust remaker (tools/photo-remake, as WebAssembly): turned upright,
//     shrunk to the browser's 1600 pixels, encoded again with nothing else in
//     it, so no metadata and no hidden bytes survive. If the remaker cannot
//     read it, its EXIF, XMP and IPTC blocks are cut out instead, the
//     picture's bytes untouched;
//   * a PNG or WebP with metadata chunks is written back without them (not
//     remade: a remade PNG would lose its transparency, and drawings use it);
//   * a JPEG that says where it was taken and that neither can read is
//     REMOVED: a photo with an address in it does not stay because it was
//     malformed;
//   * anything else is left alone, and so is report evidence (`reports/`),
//     which leaders read as it was raised.
//
// WHAT IT CANNOT DO, said here and in docs/DATA-PROTECTION.md: read a HEIC
// photo (nothing here can decode one), or close the moments between the file
// arriving and this cleaning it. The browser has already cleaned every photo
// the real app sends; this is for the ones it did not send.
//
// THE PHOTO READER IS ../_shared/photo-location.ts, a byte-for-byte copy of
// lib/live/photo-location.ts (tests/a-photo-is-checked-on-the-server.mjs fails
// if the two differ), because a function is deployed from this folder alone.

import {
  jpegCarriesLocation,
  pngWithoutMetadata,
  webpWithoutMetadata,
  withoutJpegMetadata,
} from '../_shared/photo-location.ts';
import { remakePhoto } from '../_shared/photo-remake.ts';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');

/** The buckets photos go into, and the largest file either one accepts. */
const BUCKETS = new Set(['pairing-media', 'post-media']);
const MAX_BYTES = 50 * 1024 * 1024;

/** No wildcard: the only caller is the database, and it sends no Origin. */
const headers = { 'Content-Type': 'application/json' };

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

// Constant time: a wrong key takes as long to refuse as a nearly right one.
async function sameKey(a: string, b: string): Promise<boolean> {
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [x, y] = (await Promise.all([hash(a), hash(b)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type Verdict =
  | { action: 'keep' }
  | { action: 'replace'; bytes: Uint8Array; how: 'remade' | 'cut' }
  | { action: 'remove' };

/** What to do with a stored file, from its bytes and type alone. */
export async function verdictFor(bytes: Uint8Array, mime: string): Promise<Verdict> {
  if (mime === 'image/jpeg') {
    if (!jpegCarriesLocation(bytes)) return { action: 'keep' };
    const remade = await remakePhoto(bytes).catch(() => null);
    if (remade && !jpegCarriesLocation(remade)) return { action: 'replace', bytes: remade, how: 'remade' };
    const clean = withoutJpegMetadata(bytes);
    return clean ? { action: 'replace', bytes: clean, how: 'cut' } : { action: 'remove' };
  }
  if (mime === 'image/png' || mime === 'image/webp') {
    const clean = mime === 'image/png' ? pngWithoutMetadata(bytes) : webpWithoutMetadata(bytes);
    return clean && !sameBytes(clean, bytes) ? { action: 'replace', bytes: clean, how: 'cut' } : { action: 'keep' };
  }
  return { action: 'keep' };
}

/** A stored file's address, each part of its name encoded on its own. */
const objectUrl = (bucket: string, name: string) =>
  `${SUPABASE_URL}/storage/v1/object/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;

const asServer = () => ({ Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_KEY || !(await sameKey(bearer, SERVICE_KEY))) {
    return reply(401, { error: 'This function is called by the database.' });
  }

  let asked: { bucket?: unknown; name?: unknown };
  try {
    asked = await req.json();
  } catch {
    return reply(400, { error: 'Send JSON: { bucket, name }.' });
  }
  const bucket = typeof asked.bucket === 'string' ? asked.bucket : '';
  const name = typeof asked.name === 'string' ? asked.name : '';
  if (!BUCKETS.has(bucket)) return reply(200, { checked: false, why: 'not a bucket photos go into' });
  if (!name || name.length > 1024 || name.startsWith('/')
      || name.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return reply(400, { error: 'That is not a file name.' });
  }
  if (name.startsWith('reports/')) {
    return reply(200, { checked: false, why: 'report evidence is kept as it was raised' });
  }

  const got = await fetch(objectUrl(bucket, name), { headers: asServer() });
  // Gone already (replaced, or removed by its owner): nothing to clean.
  if (got.status === 400 || got.status === 404) return reply(200, { checked: false, why: 'gone' });
  if (!got.ok) return reply(502, { error: `The file store answered ${got.status}.` });
  const declared = Number(got.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) return reply(200, { checked: false, why: 'larger than any photo the app accepts' });
  const mime = (got.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await got.arrayBuffer());
  if (bytes.length > MAX_BYTES) return reply(200, { checked: false, why: 'larger than any photo the app accepts' });

  const verdict = await verdictFor(bytes, mime);
  if (verdict.action === 'keep') return reply(200, { checked: true, changed: false });

  if (verdict.action === 'replace') {
    const put = await fetch(objectUrl(bucket, name), {
      method: 'PUT',
      headers: { ...asServer(), 'Content-Type': mime, 'x-upsert': 'true' },
      body: verdict.bytes,
    });
    if (!put.ok) return reply(502, { error: `The cleaned photo could not be written back (${put.status}).` });
    // No file name in the log: the name carries the ids of the people in it.
    console.log(JSON.stringify({ at: 'photo-check', bucket, changed: 'cleaned', how: verdict.how }));
    return reply(200, { checked: true, changed: 'cleaned', how: verdict.how });
  }

  const gone = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...asServer(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [name] }),
  });
  if (!gone.ok) return reply(502, { error: `The photo could not be removed (${gone.status}).` });
  console.log(JSON.stringify({ at: 'photo-check', bucket, changed: 'removed' }));
  return reply(200, { checked: true, changed: 'removed' });
});
