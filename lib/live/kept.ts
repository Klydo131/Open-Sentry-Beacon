'use client';

// THE LAST COPY OF WHAT YOU READ, FOR WHEN THERE IS NO SIGNAL.
//
// The owner, 16 October 2026: "How is it still and "offline" first local web
// app if all of the features are not usable offline?" For the signed-in app
// the honest answer was that none of it was. Every screen asked the church's
// database as it opened, so a phone with no signal opened on "Could not load
// your account", in the church hall where the app is most needed.
//
// So every READ the app makes is kept, on this device, as it arrives; with no
// signal, the same read is answered with the copy. What somebody saw is what
// they see again, and the pill at the top says Offline.
//
// WHAT IS KEPT, AND WHAT NEVER IS:
//   - plain reads of the database's tables (GET and HEAD, /rest/v1/);
//   - reads through the database's functions, but only the ones the database
//     itself declares STABLE, meaning they change nothing. READ_FUNCTIONS
//     below is that list, and tests/the-app-works-with-no-signal.mjs checks
//     it against the migrations, so a function that writes can never be
//     answered from a copy. Answering a write from a copy would tell somebody
//     their message was sent when it was not;
//   - nothing else: no sign-in, no files, no writes. A write with no signal
//     fails and says "That could not reach the church" (lib/live/errors.ts);
//   - and nothing the church has since taken away: a read the database now
//     refuses deletes its kept copy.
//
// WHOSE IT IS. Each read is kept under the account that asked for it (the
// `sub` in the token it carried), in a cache of that account's own, and only
// ever answered to that same account. Signing out deletes every kept copy on
// the device (lib/supabase/client.ts, clearBrowserSession), and a different
// account signing in deletes the last one's. It is the same data the screens
// already showed on this device, kept where the browser keeps the app itself.

import { forgetEveryLocalRoom } from '@/lib/study/local-names';

const PREFIX = 'beacon-kept-';

/** The database functions that change nothing, by the database's own word. */
export const READ_FUNCTIONS = new Set([
  'blog_feed',
  'church_activity',
  'church_invitations',
  'church_meeting_summary',
  'church_pulse',
  'discipline_check',
  'discipline_history',
  'guide_room_people',
  'guild_metrics',
  'list_guilds',
  'minors_in_church',
  'my_blog_posts',
  'my_reports',
  'my_study_progress',
  'my_temporary_password_ends',
  'my_threads',
  'prayer_wall',
  'report_thread',
  'suggest_pairings',
  'unpaired_explorers',
  'why_library_sharing_is_paused',
]);

/** The headers that change what an answer looks like, so they are part of its name. */
const SHAPING = ['accept', 'prefer', 'range', 'accept-profile'];

/** How many answers one account keeps before the oldest are let go. */
const MOST_KEPT = 600;

export type Ask = { url: URL; method: string; headers: Headers; body: string };

/** The name a read is kept under, or null when it is not a read that is kept. */
export function keptKey(ask: Ask): string | null {
  const { url } = ask;
  const method = ask.method.toUpperCase();
  if (!url.pathname.startsWith('/rest/v1/')) return null;
  const fn = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : null;
  if (method === 'GET' || method === 'HEAD') {
    if (fn !== null && !READ_FUNCTIONS.has(fn)) return null;
  } else if (method === 'POST') {
    if (fn === null || !READ_FUNCTIONS.has(fn)) return null;
  } else {
    return null;
  }
  const key = new URL(url.toString());
  key.searchParams.set('beacon-method', method);
  for (const h of SHAPING) {
    const v = ask.headers.get(h);
    if (v) key.searchParams.set(`beacon-${h}`, v);
  }
  if (method === 'POST') key.searchParams.set('beacon-body', ask.body);
  return key.toString();
}

/** Whose read this is: the account id in the token it carries, or null. */
export function reader(headers: Headers): string | null {
  const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof claims.sub === 'string' && /^[0-9a-f-]{36}$/i.test(claims.sub) ? claims.sub : null;
  } catch {
    return null;
  }
}

const hasCaches = () => typeof caches !== 'undefined';

/** Delete every kept copy on this device: signing out. */
export async function forgetEverythingKept(): Promise<void> {
  // The study room's copy on this device goes too: a shared tablet must not
  // keep somebody's study notes after they sign out (lib/study/local-names.ts).
  await forgetEveryLocalRoom().catch(() => undefined);
  if (!hasCaches()) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((k) => caches.delete(k)));
  } catch {
    // Storage refused: there is nothing to delete that could be read either.
  }
}

/** A different account is using this device: the last one's copy goes. */
let settledFor: string | null = null;
async function forgetOthers(who: string) {
  if (settledFor === who) return;
  settledFor = who;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== PREFIX + who).map((k) => caches.delete(k)));
}

let writes = 0;
async function keep(who: string, key: string, res: Response) {
  try {
    await forgetOthers(who);
    const headers = new Headers(res.headers);
    headers.set('x-beacon-kept-at', new Date().toISOString());
    const copy = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
    const cache = await caches.open(PREFIX + who);
    await cache.put(key, copy);
    // Now and then, let the oldest go. A cache answers keys oldest-written
    // first, so the front of the list is what was read longest ago.
    if (++writes % 25 === 0) {
      const all = await cache.keys();
      await Promise.all(all.slice(0, Math.max(0, all.length - MOST_KEPT)).map((k) => cache.delete(k)));
    }
  } catch {
    // Full, private window, or refused. The read itself already succeeded.
  }
}

/**
 * The database refused this read now: whatever was kept for it goes. A
 * leader who stepped down, or a Guide whose Explorer moved to somebody else,
 * keeps nothing the church has since taken away; the next refused read of it
 * deletes the copy, rather than leaving it until they sign out.
 */
async function drop(who: string, key: string) {
  try {
    const keys = await caches.keys();
    if (keys.includes(PREFIX + who)) await (await caches.open(PREFIX + who)).delete(key);
  } catch {
    // Nothing kept, or storage refused: nothing to answer from either.
  }
}

/** The kept answer to a read, marked as one, or null. */
async function keptAnswer(who: string, key: string): Promise<Response | null> {
  try {
    const keys = await caches.keys();
    if (!keys.includes(PREFIX + who)) return null;
    const hit = await (await caches.open(PREFIX + who)).match(key);
    if (!hit) return null;
    const at = hit.headers.get('x-beacon-kept-at');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('beacon:kept-shown', { detail: { at } }));
    }
    return hit;
  } catch {
    return null;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * fetch, for the database client: a read is kept as it arrives and answered
 * from the copy when the network cannot answer. Anything else goes straight
 * through, untouched.
 */
export async function keptFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  send: typeof fetch,
): Promise<Response> {
  if (!hasCaches()) return send(input, init);
  let url: URL;
  try {
    url = new URL(urlOf(input));
  } catch {
    return send(input, init);
  }
  if (!url.pathname.startsWith('/rest/v1/')) return send(input, init);

  const fromRequest = typeof input === 'object' && !(input instanceof URL) ? input : null;
  const method = (init?.method ?? fromRequest?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? fromRequest?.headers);
  // Only a body the client wrote as text can name a read; anything else is
  // not one of ours to keep.
  if (method === 'POST' && typeof init?.body !== 'string') return send(input, init);
  const who = reader(headers);
  const key = who ? keptKey({ url, method, headers, body: typeof init?.body === 'string' ? init.body : '' }) : null;
  if (!who || !key) return send(input, init);

  // No signal at all: answer at once rather than wait for a request that
  // cannot leave the phone.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const hit = await keptAnswer(who, key);
    if (hit) return hit;
  }
  try {
    const res = await send(input, init);
    if (res.ok) void keep(who, key, res.clone());
    // Refused (no longer allowed, or the row is gone). A server that is down
    // (5xx) says nothing about what this person may see, so it drops nothing.
    else if (res.status >= 400 && res.status < 500) void drop(who, key);
    return res;
  } catch (cause) {
    // Cancelled on purpose is not "no signal".
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    const hit = await keptAnswer(who, key);
    if (hit) return hit;
    throw cause;
  }
}
