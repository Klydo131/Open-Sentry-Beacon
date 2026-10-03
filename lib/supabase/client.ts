'use client';

// The browser's connection to your database, or null when there is none.
//
// RETURNS NULL RATHER THAN THROWING, and that is the whole point. A client that
// throws when the keys are absent means the app cannot start without a
// database, which would quietly kill the promise that you can clone this and
// look at it. Every caller checks for null and falls back to the sample data.
//
// tests/no-backend.js enforces this: a bare `process.env.X!` or a throw on a
// missing key fails the build.

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { IS_LIVE } from '@/lib/mode';
import { shouldRecheckSession } from '@/lib/supabase/session-recheck';

let cached: SupabaseClient<any> | null = null;
let authCached: SupabaseClient<any> | null = null;

function authStorageKey() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const projectRef = new URL(url).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
}

export function saveBrowserSession(session: Session) {
  const key = authStorageKey();
  if (typeof window === 'undefined' || !key) {
    throw new Error('The live session store is unavailable.');
  }
  const encoded = JSON.stringify(session);
  window.localStorage.setItem(key, encoded);
  if (window.localStorage.getItem(key) !== encoded) {
    throw new Error('The live session could not be saved.');
  }
}

export function readBrowserSession(): Session | null {
  const key = authStorageKey();
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (
      typeof session.access_token !== 'string' ||
      typeof session.refresh_token !== 'string' ||
      typeof session.user?.id !== 'string'
    ) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearBrowserSession() {
  const key = authStorageKey();
  if (typeof window !== 'undefined' && key) window.localStorage.removeItem(key);
}

// ---------------------------------------------------------------------------
// STAYING SIGNED IN.
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS FOR: "Your account is not ready. JWT expired."
//
// An access token from Supabase lasts ONE HOUR. A refresh token lasts months
// and is what turns a one-hour token into staying signed in until you sign
// out, which is how every app people are used to behaves.
//
// Nothing here ever used the refresh token. The data client was built with
// `accessToken: () => readBrowserSession()?.access_token`, and passing that
// option switches OFF the library's own session management entirely: it stops
// refreshing, stops scheduling, and simply calls that function. The function
// returned whatever was written to storage at sign-in. So exactly one hour
// later every request began failing, and the app told the person their account
// was not ready, which is not what had happened and not something they could
// act on.
//
// THE EXPIRY IS READ FROM THE TOKEN, NOT FROM THE STORED FIELD. `expires_at`
// is written by whatever produced the session, and ours comes from a custom
// sign-in route; the `exp` claim inside the token is the only copy the server
// will actually enforce. Reading the authority rather than the annotation is
// the difference between refreshing at the right moment and being sure you did.
//
// ONE REFRESH AT A TIME, SHARED. A page load fires several requests at once.
// Supabase ROTATES the refresh token on every use, so two concurrent refreshes
// race: the second presents a token the first has already spent, is refused,
// and the person is signed out by the very code meant to keep them in. The
// in-flight promise is what makes that impossible.

/** Seconds of headroom, so a token never expires mid-request. */
const REFRESH_MARGIN_SECONDS = 120;

/** The `exp` claim, in seconds since the epoch, or 0 when it cannot be read. */
function tokenExpiry(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return 0;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    // Unreadable means "treat as expired": refreshing an unexpired token costs
    // one request, while trusting an expired one signs somebody out.
    return 0;
  }
}

let refreshing: Promise<Session | null> | null = null;

// ---------------------------------------------------------------------------
// SAYING SO WHEN A SESSION ENDS.
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS FOR, from a phone: a Guide's own screen showing their
// name and their reminders, with "permission denied for table pairings" and
// "permission denied for function blog_feed" printed in red where the church's
// pairings and blogs should be.
//
// That is not a rules problem. `pairings` grants SELECT to `authenticated` and
// nothing to `anon`; every one of those functions grants EXECUTE the same way.
// A raw "permission denied for table" is Postgres saying the request arrived as
// NOBODY. The session had been cleared underneath a screen that was already
// drawn, so `liveAccessToken` returned null, the client sent the anon key
// alone, and every card on the page failed in a way that reads like the church
// forgot who this person was.
//
// React never found out. The provider re-checks on mount, on another tab
// writing storage, and on the tab becoming visible again — and clearing
// storage from THIS tab fires none of those. So the app sat there, signed out
// at the network and signed in on the screen, which is the worst of both: the
// person cannot use it and is not offered the one thing that would fix it.
const SIGNED_OUT = 'beacon:signed-out';

/** Announce that the stored session is gone, so the app can show the door. */
function announceSignedOut() {
  if (typeof window === 'undefined') return;
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(SIGNED_OUT)));
}

/** Listen for it. Returns the unsubscribe, for an effect. */
export function onSignedOut(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SIGNED_OUT, run);
  return () => window.removeEventListener(SIGNED_OUT, run);
}

/**
 * Trade the refresh token for a new session, at most once at a time.
 *
 * Called directly rather than through a second client, because a client
 * configured to persist would write this same storage key in ITS OWN format,
 * and readBrowserSession above expects plain JSON. Two writers, two formats,
 * one key is a signed-out member on the day the library changes its encoding.
 */
function refreshBrowserSession(session: Session): Promise<Session | null> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key) return null;

    const spend = (token: string) =>
      fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ refresh_token: token }),
      });

    try {
      let res = await spend(session.refresh_token);

      // A 400 IS USUALLY A RACE, NOT AN ENDING.
      //
      // Supabase ROTATES the refresh token on every use, so a token can only
      // be spent once. The in-flight promise above stops two refreshes racing
      // inside one page — it cannot stop a SECOND PLACE the app is open. A
      // phone with Beacon on the home screen and the same church opened from a
      // link in Gmail is two contexts, and this is exactly the report: the
      // screen came from a Gmail link.
      //
      // What happened next was the damage. The loser of that race got a 400,
      // called clearBrowserSession(), and wiped the perfectly good session the
      // winner had just written. So opening the app a second way signed the
      // person out of both.
      //
      // The token captured at the top of this call may therefore be one
      // version behind what is in storage right now. Re-read, and if somebody
      // else has moved it on, that is the answer — no second request needed.
      if (res.status === 400 || res.status === 401) {
        const current = readBrowserSession();
        if (current && current.refresh_token !== session.refresh_token) {
          const now = Math.floor(Date.now() / 1000);
          // Already fresh: another context did the work. Take it.
          if (tokenExpiry(current.access_token) - now > REFRESH_MARGIN_SECONDS) {
            return current;
          }
          // Moved on but also stale — spend the newer one, once.
          res = await spend(current.refresh_token);
        }
      }

      if (!res.ok) {
        // Now a refused refresh does mean the session is over: signed out
        // elsewhere, or the account removed. Clearing it is what turns the
        // next page load into the sign-in screen rather than a loop — and the
        // announcement is what stops the CURRENT page carrying on as though
        // nothing happened, firing anonymous requests behind the person's own
        // name. See the note on SIGNED_OUT above.
        if (res.status === 400 || res.status === 401) {
          clearBrowserSession();
          announceSignedOut();
        }
        return null;
      }
      const next = (await res.json()) as Session | null;
      if (!next || typeof next.access_token !== 'string'
          || typeof next.refresh_token !== 'string') return null;
      // Keep the user object when the refresh response omits it, so nothing
      // downstream that reads session.user.id starts finding undefined.
      const merged = { ...session, ...next } as Session;
      saveBrowserSession(merged);
      return merged;
    } catch {
      // Offline. NOT a sign-out: the token may be perfectly valid and the
      // request simply could not leave the device.
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/**
 * A token that will still be valid when the request lands, refreshing first if
 * it will not be. This is what the data client asks for before every call.
 */
export async function liveAccessToken(): Promise<string | null> {
  const session = readBrowserSession();
  if (!session) {
    // A DATA CALL WITH NO SESSION IS A SIGN-OUT THE SCREEN HAS NOT HEARD ABOUT.
    //
    // Returning null here does not stop the request; the client sends the anon
    // key on its own and Postgres answers "permission denied for table
    // pairings", which is then printed in red on a page still showing the
    // person's name. Saying so out loud is what turns that into the sign-in
    // screen. It is safe to say often — the provider re-reads storage and does
    // nothing if a session is there after all.
    announceSignedOut();
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokenExpiry(session.access_token) - now > REFRESH_MARGIN_SECONDS) {
    return session.access_token;
  }
  const fresh = await refreshBrowserSession(session);
  // On a failed refresh return the old token rather than null. If the failure
  // was the network, the token may still work; if it really has expired, the
  // request fails the same way it would have anyway. Returning null instead
  // reads to every caller as "signed out", which is a worse guess.
  return fresh?.access_token ?? session.access_token;
}

// ---------------------------------------------------------------------------
// SIGNING OUT ENDS THE SESSION, NOT ONLY THIS DEVICE'S COPY OF IT.
// ---------------------------------------------------------------------------
//
// Found by the audit of 3 October 2026. "Sign out" used to delete the session
// from this browser and nothing else, so the sign-in server went on honouring
// it. A copy taken before the person pressed Sign out (a shared computer, a
// browser backup, anything that read storage) kept working afterwards, for as
// long as its refresh token did.
//
// So the server is told first, for THIS session only (`scope=local`): the
// person's phone stays signed in when they sign out of the church office's
// computer. Ending the session also ends its access token at once, because the
// database checks that the session still exists (an_ended_session_ends_at_once).
//
// Called directly, like the refresh above, and for the same reason: a second
// client would write this storage key in its own format.
//
// NEVER A REASON NOT TO SIGN OUT. Offline, slow, or refused, this device still
// forgets the session, and the wait is capped so the button never hangs.
const SIGN_OUT_WAIT_MS = 4000;

export async function endBrowserSession(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (url && key && readBrowserSession()) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), SIGN_OUT_WAIT_MS);
    try {
      // A token that is still valid, refreshed first if it is not: the server
      // only ends a session for somebody who can prove it is theirs.
      const token = await liveAccessToken();
      if (token) {
        await fetch(`${url}/auth/v1/logout?scope=local`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${token}` },
          signal: stop.signal,
        });
      }
    } catch {
      // Offline or too slow. The device below still forgets it.
    } finally {
      clearTimeout(timer);
    }
  }
  clearBrowserSession();
}

// ---------------------------------------------------------------------------
// A SESSION ENDED ELSEWHERE ENDS HERE TOO, AT ONCE.
// ---------------------------------------------------------------------------
//
// The database refuses a request whose session has been ended with a 401
// (lib/supabase/session-recheck.ts says why and when). Without this, a device
// signed out from somewhere else would sit on its own screen with every card
// failing until its next scheduled refresh, up to an hour later. With it, the
// first refused request asks the sign-in server once; the server's refusal
// signs the device out by the ordinary path, and the front door appears.
let lastRecheckAt = 0;

const dataFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const now = Date.now();
  if (shouldRecheckSession(res.status, lastRecheckAt, now)) {
    const session = readBrowserSession();
    if (session) {
      lastRecheckAt = now;
      void refreshBrowserSession(session);
    }
  }
  return res;
};

export function supabase() {
  if (!IS_LIVE) return null;
  if (cached) return cached;
  // Data calls use the already-verified first-party session directly. This
  // prevents privacy shields from turning an unnecessary second Auth request
  // into a false "not signed in" result after a successful gateway login.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  cached = createClient<any>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    // Refreshes when needed. See liveAccessToken: handing over the STORED
    // token is what expired every session after exactly one hour.
    { accessToken: liveAccessToken, global: { fetch: dataFetch } },
  );
  return cached;
}

export function supabaseAuth() {
  if (!IS_LIVE) return null;
  if (authCached) return authCached;
  authCached = createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { storageKey: authStorageKey() } },
  );
  return authCached;
}
