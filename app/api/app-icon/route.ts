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
// address that resolves onto a private network, redirects followed by hand and
// re-checked at every hop, a byte cap, a timeout, and only an image ever
// returned.

import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
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
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;  // unique local
  if (v6.startsWith('fe80')) return true;                       // link-local
  // An IPv4 address wearing an IPv6 coat still goes to the same place.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
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

async function get(url: URL, accept: string): Promise<Response | null> {
  let current: URL | null = url;
  for (let hop = 0; hop <= MAX_REDIRECTS && current; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        // BY HAND, because `follow` would take the redirect without asking, and
        // a public URL that redirects to 169.254.169.254 is the ordinary way
        // this kind of fence is climbed.
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; icon-fetch)' },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      current = await publicUrl(new URL(location, current).toString());
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

/** Read at most `cap` bytes, so a slow endless response cannot hold a worker. */
async function readCapped(res: Response, cap: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) { await reader.cancel().catch(() => {}); return null; }
      parts.push(value);
    }
  }
  return Buffer.concat(parts);
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
  if (page && /text\/html/i.test(page.headers.get('content-type') ?? '')) {
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
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    // ONLY EVER AN IMAGE. Without this the route would hand back whatever any
    // address returned, which is the difference between an icon proxy and an
    // open one.
    if (!type.startsWith('image/')) continue;
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
