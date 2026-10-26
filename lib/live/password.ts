'use client';

// Choosing a password, and getting back in without one.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE. Until 26 October 2026 the reset link landed on the invitation
// page (/join?recovery=1), which said "This is the address your invitation was
// sent to" to somebody who had only forgotten a password, and "Forgot your
// password?" sent the e-mail straight from the sign-in page. The owner: "for
// making new password, it should be a separate web page, not in the log in
// page so that users will not be confused why it was used in the log in page."
// So there are now two pages of their own:
//
//   /forgot-password  type your address, get a link (sign-in only links here)
//   /new-password     the link lands here; choose the new password
//
// and /join forwards any reset link it is handed to /new-password, so a reset
// e-mail already in somebody's inbox, or a project whose e-mail template still
// points at /join, keeps working.
//
// ONE SET OF RULES for every screen that sets a password (the invitation, the
// reset link and Settings), checked here before anything is sent, so the
// person hears about a problem while they can still see what they typed. The
// sign-in service checks again and has the last word; humanError()
// (lib/live/errors.ts) puts its refusals into words.
// ---------------------------------------------------------------------------

import type { Session } from '@supabase/supabase-js';
import { saveBrowserSession, supabaseAuth } from '@/lib/supabase/client';
import * as live from '@/lib/live/data';

// The rules themselves are in lib/password-rules.ts, with no browser or
// database behind them, so a test can run them as they ship.
export { PASSWORD_MIN, PASSWORD_MAX_BYTES, passwordProblem } from '@/lib/password-rules';

// ------------------------------------------------------------- the link ----

/** Where a reset link lands. */
export const NEW_PASSWORD_PATH = '/new-password';

/**
 * E-mail a link to choose a new password. Answers the same whether or not the
 * address has an account, so this cannot be used to find out who belongs to a
 * church. Throws the sign-in service's own error, with its `code`, when it
 * refuses (too soon after the last one, an address it cannot use).
 */
export async function sendPasswordLink(email: string): Promise<void> {
  const client = supabaseAuth();
  if (!client) throw new Error('This copy of the app is not connected to a church yet.');
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}${NEW_PASSWORD_PATH}`,
  });
  if (error) throw error;
}

/** True when this address carries a reset link, in any of the shapes one arrives in. */
export function isResetLink(search: URLSearchParams, hash: string): boolean {
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  // A mail client that re-encodes & as &amp; leaves `amp;type`.
  const type = search.get('type') ?? search.get('amp;type') ?? h.get('type');
  return search.get('recovery') === '1' || type === 'recovery';
}

export type Redeemed =
  | { state: 'ready'; email: string }
  | { state: 'someone-else'; email: string }
  | { state: 'signed-in' }
  | { state: 'no-link' }
  | { state: 'dead'; reason: string };

/**
 * Turn the link into a signed-in session, or say why it cannot be.
 *
 * `handover` is true once the person has said that signing out whoever is
 * signed in on this device is what they want.
 */
export async function redeemPasswordLink(
  search: URLSearchParams,
  hash: string,
  handover: boolean,
): Promise<Redeemed> {
  const client = supabaseAuth();
  if (!client) return { state: 'dead', reason: 'This copy of the app is not connected to a church yet.' };

  // Supabase reports a used or expired link in the hash (#error=...&error_code=otp_expired).
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  if (h.get('error') || h.get('error_code') || h.get('error_description')) {
    return { state: 'dead', reason: 'This link has run out or has already been used. Ask for a new one.' };
  }

  const tokenHash = search.get('token_hash');
  const code = search.get('code');
  const codeEmail = search.get('email');
  const accessToken = h.get('access_token');
  const refreshToken = h.get('refresh_token');
  const redeeming = Boolean(tokenHash || code || accessToken);

  if (!redeeming) {
    const { data } = await client.auth.getSession();
    // Already signed in and no link: that is the ordinary change, at /password.
    if (data.session) return { state: 'signed-in' };
    return { state: 'no-link' };
  }

  // Somebody else signed in on this device (a shared tablet, a Director who
  // opened a member's link to "check it"): ask before replacing their session.
  if (!handover) {
    const { data } = await client.auth.getSession();
    const who = data.session?.user?.email ?? '';
    if (who) return { state: 'someone-else', email: who };
  }
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);

  if (tokenHash) {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) throw error;
  } else if (code && codeEmail) {
    // The six-digit fallback, for a mail client that mangled the link.
    const { error } = await client.auth.verifyOtp({ email: codeEmail, token: code, type: 'recovery' });
    if (error) throw error;
  } else if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
  }
  // Nothing of the link stays in the address bar, the history or a screenshot.
  window.history.replaceState(null, '', window.location.pathname);

  const { data } = await client.auth.getSession();
  if (!data.session) {
    return { state: 'dead', reason: 'This link has run out or has already been used. Ask for a new one.' };
  }
  // Written in the exact shape the data client reads (lib/supabase/client.ts).
  saveBrowserSession(data.session as Session);
  // An invitation sent to an account that already existed arrives as a reset
  // link, so claim it now: the same as /join did for these links.
  await live.claimMyPendingInvitation().catch(() => false);
  return { state: 'ready', email: data.session.user.email ?? '' };
}

/**
 * Save the new password on the session the link made. Throws the sign-in
 * service's error with its `code`: `insufficient_aal` means the account has an
 * authenticator app and its code is needed first.
 */
export async function saveNewPassword(chosen: string): Promise<void> {
  const client = supabaseAuth();
  if (!client) throw new Error('This copy of the app is not connected to a church yet.');
  const { error } = await client.auth.updateUser({ password: chosen });
  if (error) throw error;

  // The tokens may have been rotated, so the saved session is replaced.
  const { data } = await client.auth.getSession();
  if (data.session) saveBrowserSession(data.session as Session);

  // Whoever had the old password is signed out everywhere else; the password
  // is now the person's own, so the reminder to change it goes; and an invited
  // account whose link this was is finished signing up. Each is best effort:
  // the password changed whatever happens to them.
  await live.signOutOtherDevices().catch(() => undefined);
  await live.clearTemporaryPasswordReminder().catch(() => undefined);
  await live.finishMySignup().catch(() => undefined);
}
