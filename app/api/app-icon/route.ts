// The real logo of a web app somebody put in their pocket.
//
// ---------------------------------------------------------------------------
// WHY THE SERVER FETCHES IT AND NOT THE PHONE. Asked for plainly: "I wanted to
// see the logo of the web app please if there is a logo." The pocket drew a
// letter on a colour instead, and the note in lib/pocket.ts gave two reasons.
// Both are answered by moving the fetch rather than by accepting them:
//
//   1. THE CONTENT POLICY. `img-src` is `'self' data: blob:`. A tile pointing
//      straight at https://faithlife.com/favicon.ico would need it widened to
//      arbitrary origins, which weakens the policy for every page in the app,
//      for ever, to draw an icon. An image served from THIS origin needs no
//      change at all, so the policy stays exactly as narrow as it was.
//
//   2. THE PRIVACY. A favicon loaded by the browser is a request from a church
//      member's phone to that company, carrying their IP address, every time
//      the rail renders. Spotify and Facebook would learn that somebody is
//      sitting in this app and roughly where they are. Fetched here, the only
//      thing those companies see is a server asking for a picture, once, and
//      nothing about any member at all.
//
// So this is not a workaround for the CSP. It is a better answer than the
// direct version would have been, and the CSP is what made it obvious.
//
// WHAT THIS IS, SECURITY-WISE. A server that fetches a URL somebody typed is
// a request-forgery engine unless it is fenced, because "the server" is inside
// the network and the person typing is not. Every fence is below and each one
// is checked by tests/the-pocket-keeps-a-web-app-safely.mjs: only http(s), no
// address that resolves onto a private network -- checked again AT THE MOMENT
// OF CONNECTING, so a name server that changes its answer in between gets
// nowhere -- redirects followed by hand and re-checked at every hop, a byte cap
// counted after decompression, one deadline per request, and only an image
// ever returned.

import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';
import { safeExternalUrl } from '@/lib/url';

// `nodejs`, not edge: the address checks below need DNS, which the edge runtime
// does not provide. Without it the SSRF fence cannot be built at all.
export const runtime = 'nodejs';

const FETCH_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

/**
 * Is this address somewhere the server can reach but the public cannot?
 *
 * The list is the one that matters on a cloud host: loopback, the RFC1918
 * ranges, carrier-grade NAT, and link-local -- which includes 169.254.169.254,
 * the cloud metadata address, and is the single most valuable target for a
 * request-forgery bug.
 */
function isPrivateAddress(ip: string): boolean {
  const v4 = ip.split('.').map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = v4;
    if (a === 0 || a === 127) return true;            // this host, loopback
    if (a === 10) return true;                        // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;          // private
    if (a === 169 && b === 254) return true;          // link-local + metadata
    if (a === 100 && b >= 64 && b <= 127) return true;// carrier-grade NAT
    if (a >= 224) return true;                        // multicast, reserved
    return false;
  }
  const h = hextets(ip);
  if (!h) return true; // not an address we can read is not one we will open
  if (h.every((x) => x === 0)) return true;                        // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if ((h[0] & 0xfe00) === 0xfc00) return true;                     // unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true;                     // link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true;                     // site-local
  if ((h[0] & 0xff00) === 0xff00) return true;                     // multicast
  // AN IPv4 ADDRESS WEARING AN IPv6 COAT still goes to the same place, and
  // there are four coats: mapped (::ffff:a.b.c.d, which may also be written
  // ::ffff:7f00:1), the old "compatible" form (::a.b.c.d), NAT64
  // (64:ff9b::a.b.c.d) and 6to4 (2002:AABB:CCDD::, the address in the middle).
  const quad = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    return isPrivateAddress(quad(h[6], h[7]));
  }
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    // 64:ff9b:1::/48 is NAT64 for a local network by definition.
    if (h[2] === 1) return true;
    return isPrivateAddress(quad(h[6], h[7]));
  }
  if (h[0] === 0x2002) return isPrivateAddress(quad(h[1], h[2]));
  return false;
}

/** An IPv6 address as its eight 16-bit groups, or null if it is not one. */
function hextets(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0];
  // A dotted IPv4 tail becomes the last two groups.
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const q = tail.slice(1).map(Number);
    if (q.some((n) => n > 255)) return null;
    text = text.slice(0, tail.index)
      + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(':') : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** A URL this server is willing to open: http(s), public, and parseable. */
async function publicUrl(raw: string): Promise<URL | null> {
  const safe = safeExternalUrl(raw);
  if (!safe) return null;
  let url: URL;
  try {
    url = new URL(safe);
  } catch {
    return null;
  }
  if (!url.hostname.includes('.')) return null;
  try {
    // `all`, because a host that answers with one public and one private
    // address would otherwise pass on the public one and be fetched on the
    // other. Every address it resolves to has to be acceptable.
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0) return null;
    if (addresses.some((a) => isPrivateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return url;
}

/**
 * THE SAME FENCE, AT THE MOMENT OF CONNECTING.
 *
 * publicUrl() asks DNS where a host is and refuses a private answer. That is
 * necessary and it is not enough, because the connection that follows asks DNS
 * AGAIN, and nothing obliges the second answer to match the first. A domain
 * whose name server says "a public address" the first time and "127.0.0.1" the
 * second -- DNS rebinding, a few lines of configuration for whoever owns the
 * domain -- walks straight past a check made beforehand. On a serverless host
 * the thing listening on loopback is the platform's own runtime interface.
 *
 * So the socket is given this lookup instead of the system's: the address it
 * connects to is the address that was checked, in the same call, with no
 * second question in between.
 */
function fencedLookup(
  hostname: string,
  options: { family?: number | string; all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  lookup(hostname, { all: true }).then(
    (found) => {
      const family = options.family === 4 || options.family === 'IPv4' ? 4
        : options.family === 6 || options.family === 'IPv6' ? 6 : 0;
      const addresses = family ? found.filter((a) => a.family === family) : found;
      if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        const refused: NodeJS.ErrnoException = new Error(`refused to connect to ${hostname}`);
        refused.code = 'EREFUSED';
        callback(refused, options.all ? [] : '', 4);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (err: NodeJS.ErrnoException) => callback(err, options.all ? [] : '', 4),
  );
}

type Fetched = {
  status: number;
  type: string;
  location: string | null;
  body: Readable;
  /** Stop the clock and let the socket go. Always called, once. */
  close: () => void;
};

/**
 * One request, no redirects followed, and one deadline for ALL of it -- headers
 * and body together -- so a server that answers at once and then drips a byte
 * a second cannot hold a worker for longer than FETCH_TIMEOUT_MS.
 */
function open(url: URL, accept: string): Promise<Fetched | null> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), FETCH_TIMEOUT_MS);
    const close = () => { clearTimeout(timer); req.destroy(); };
    const req = client.request(url, {
      method: 'GET',
      lookup: fencedLookup,
      signal: deadline.signal,
      headers: {
        accept,
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': 'Mozilla/5.0 (compatible; icon-fetch)',
      },
    }, (res) => {
      // Decompressed HERE so the byte caps below count what is actually read,
      // not what was sent -- a small gzip that inflates to gigabytes is the
      // other way to hold a worker.
      const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
      const inflate = encoding === 'gzip' ? zlib.createGunzip()
        : encoding === 'deflate' ? zlib.createInflate()
          : encoding === 'br' ? zlib.createBrotliDecompress() : null;
      const body: Readable = inflate ? res.pipe(inflate) : res;
      if (inflate) res.on('error', (e) => inflate.destroy(e));
      resolve({
        status: res.statusCode ?? 0,
        type: String(res.headers['content-type'] ?? ''),
        location: typeof res.headers.location === 'string' ? res.headers.location : null,
        body,
        close,
      });
    });
    req.on('error', () => { close(); resolve(null); });
    req.end();
  });
}

async function get(url: URL, accept: string): Promise<Fetched | null> {
  let current: URL | null = url;
  for (let hop = 0; hop <= MAX_REDIRECTS && current; hop += 1) {
    const res = await open(current, accept);
    if (!res) return null;

    // BY HAND, because following blindly would take the redirect without
    // asking, and a public URL that redirects to 169.254.169.254 is the
    // ordinary way this kind of fence is climbed.
    if (res.status >= 300 && res.status < 400) {
      res.close();
      if (!res.location) return null;
      let next: string;
      try { next = new URL(res.location, current).toString(); } catch { return null; }
      current = await publicUrl(next);
      continue;
    }
    if (res.status >= 200 && res.status < 300) return res;
    res.close();
    return null;
  }
  return null;
}

/** Read at most `cap` bytes, so a slow endless response cannot hold a worker. */
async function readCapped(res: Fetched, cap: number): Promise<Buffer | null> {
  const parts: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of res.body) {
      const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += piece.byteLength;
      if (total > cap) return null;
      parts.push(piece);
    }
    return Buffer.concat(parts);
  } catch {
    return null;
  } finally {
    res.close();
  }
}

/** The icon a page declares, preferred over guessing at /favicon.ico. */
function declaredIcon(html: string, base: URL): string | null {
  const links = html.matchAll(/<link\b[^>]*>/gi);
  let best: { href: string; score: number } | null = null;
  for (const [tag] of links) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/\bicon\b/.test(rel)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    // A bigger declared size wins, and an apple-touch-icon beats a bare one:
    // both are more likely to be the real square mark rather than a 16px glyph.
    const size = Number(/(\d{2,4})x\1/.exec(tag)?.[1] ?? 0);
    const score = size + (rel.includes('apple-touch') ? 180 : 0);
    if (!best || score > best.score) best = { href, score };
  }
  if (!best) return null;
  try {
    return new URL(best.href, base).toString();
  } catch {
    return null;
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get('url');
  if (!asked) return new NextResponse(null, { status: 400 });

  const site = await publicUrl(asked);
  // 404 rather than an explanation: this answers a browser drawing a tile, and
  // a detailed refusal would turn it into a scanner that reports which internal
  // addresses exist.
  if (!site) return new NextResponse(null, { status: 404 });

  const candidates: string[] = [];
  const page = await get(site, 'text/html');
  if (page && !/text\/html/i.test(page.type)) page.close();
  else if (page) {
    const body = await readCapped(page, MAX_HTML_BYTES);
    if (body) {
      const declared = declaredIcon(body.toString('utf8'), site);
      if (declared) candidates.push(declared);
    }
  }
  candidates.push(new URL('/favicon.ico', site.origin).toString());

  for (const candidate of candidates) {
    const iconUrl = await publicUrl(candidate);
    if (!iconUrl) continue;
    const res = await get(iconUrl, 'image/*');
    if (!res) continue;
    const type = res.type.split(';')[0].trim().toLowerCase();
    // ONLY EVER AN IMAGE. Without this the route would hand back whatever any
    // address returned, which is the difference between an icon proxy and an
    // open one.
    if (!type.startsWith('image/')) { res.close(); continue; }
    const bytes = await readCapped(res, MAX_ICON_BYTES);
    if (!bytes || bytes.byteLength === 0) continue;

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': type,
        // A logo does not change. Cached hard so a rail full of tiles costs
        // one request each, once, rather than on every render.
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
        'content-security-policy': "default-src 'none'; sandbox",
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // No logo found is an ordinary outcome, not an error: the tile falls back to
  // the letter mark it drew before, which is why this feature cannot regress.
  return new NextResponse(null, { status: 404 });
}
