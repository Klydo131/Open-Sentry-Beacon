'use client';

// Opening the court room's door: proving, again, who is holding the phone.
//
// ---------------------------------------------------------------------------
// WHY AGAIN. Signing in happened hours or days ago; a phone left on a table is
// still signed in. The court room holds the most sensitive things a church
// writes down, so it asks for fresh proof at the door, the way a bank asks
// again before a payment. The database decides whether the proof is fresh
// enough (private.court_pass_until), from the time the sign-in service wrote
// into the token; this file only gets that proof made.
//
// TWO WAYS, ONE RULE.
//   * A code from an authenticator app, for anybody who has set one up. It is
//     proved against the session the person already has, and the sign-in
//     service answers with a token whose code time is now.
//   * The password, for somebody called to a case who has no authenticator
//     app. A password proves nothing to an existing session, so it makes a
//     new one; the old one is ended at once, so the phone holds one session,
//     not two.
// Leadership has only the first way. The database refuses the second for a
// Director or an Executive Director however it is asked.
// ---------------------------------------------------------------------------

import type { Session } from '@supabase/supabase-js';
import { enterCode } from '@/lib/live/two-step';
import { readBrowserSession, saveBrowserSession } from '@/lib/supabase/client';

/** Open the door with the six digits from the authenticator app. */
export async function openWithCode(code: string): Promise<void> {
  await enterCode(code);
}

/** Open the door with the account's password. Not for leadership. */
export async function openWithPassword(password: string): Promise<void> {
  const before = readBrowserSession();
  const email = before?.user?.email;
  if (!before || !email) throw new Error('You are not signed in.');
  if (!password) throw new Error('Type your password.');

  let response: Response;
  try {
    response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('Could not reach sign-in. Check your connection and try again.');
  }
  const payload = await response.json().catch(() => null) as
    { session?: Session; second_step?: boolean; error?: string } | null;

  if (!response.ok || typeof payload?.session?.access_token !== 'string') {
    throw new Error(response.status === 401
      ? 'That password did not match.'
      : payload?.error || 'Could not reach sign-in. Please try again.');
  }
  // A session this did not keep is ended with its own token, at once. Best
  // effort: if it fails, it still ends when its refresh lapses.
  const end = (token: string) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key || !token) return;
    fetch(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  };

  // An account with an authenticator app gets a half-finished session from a
  // password. It is not kept: the session this phone already has is stronger.
  if (payload.second_step || payload.session.user?.id !== before.user.id) {
    end(payload.session.access_token);
    throw new Error(payload.second_step
      ? 'This account has an authenticator app. Type the code from it instead.'
      : 'That is a different account. Sign out first.');
  }

  saveBrowserSession(payload.session);
  if (before.access_token !== payload.session.access_token) end(before.access_token);
}

/** Minutes left on the pass, for the line under the room's name. */
export function minutesLeft(until: string | null | undefined, now = Date.now()): number {
  if (!until) return 0;
  const left = (new Date(until).getTime() - now) / 60000;
  return left > 0 ? Math.ceil(left) : 0;
}
