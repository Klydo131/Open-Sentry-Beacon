'use client';

// Two-step sign-in: a password, then a six-digit code from an authenticator app.
//
// ---------------------------------------------------------------------------
// WHY IT EXISTS. A password can be guessed, reused from another site, or read
// over a shoulder. The review for the Data Protection Officer (13 October 2026)
// found that no leader used a second step and that the app had nowhere to set
// one up, and the owner asked for it to be built. Leaders can read a church's
// list of members, which is the information a stolen password would be used
// for.
//
// HOW IT WORKS. The sign-in service does the cryptography; this file only asks
// it. A person adds an authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password, Aegis and the like) by scanning a picture code, and
// confirms it by typing the six digits the app shows. From then on, a password
// alone gives a token marked `aal1`; the code turns it into `aal2`. The
// database refuses `aal1` for such a person before every request
// (supabase/migrations/20261013140000_a_second_step_once_set_up_is_required.sql),
// so this screen is the convenience and the database is the lock.
//
// CALLED DIRECTLY, LIKE THE REFRESH IN lib/supabase/client.ts, and for the same
// reason: the data client is built with its own token supplier, which switches
// the library's sign-in methods off, and a second persisting client would write
// the stored session in its own format.
// ---------------------------------------------------------------------------

import type { Session } from '@supabase/supabase-js';
import { APP_NAME } from '@/lib/brand';
import { liveAccessToken, readBrowserSession, saveBrowserSession } from '@/lib/supabase/client';

/** One second step on the account, as the sign-in service describes it. */
export interface Factor {
  id: string;
  status?: string;
  factor_type?: string;
  created_at?: string;
}

/** A second step being set up: the picture to scan and the key to type instead. */
export interface NewSecondStep {
  factorId: string;
  /** A data: address for an <img>, so nothing is fetched from anywhere. */
  qr: string;
  /** The same key as letters, for a phone that cannot scan its own screen. */
  secret: string;
}

/** The data API refused a password-only sign-in for somebody with a second step. */
export class SecondStepNeeded extends Error {
  constructor() {
    super('Enter the code from your authenticator app to finish signing in.');
    this.name = 'SecondStepNeeded';
  }
}

/** The database's way of saying it (SQLSTATE PT403, which the data API sends as 403). */
export function isSecondStepRefusal(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PT403';
}

/** Six digits, ignoring the spaces some apps show in the middle. */
export function cleanCode(code: string): string | null {
  const digits = code.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** The level a token carries: `aal2` after password and code, `aal1` before. */
export function tokenLevel(accessToken: string | undefined): string {
  try {
    const part = (accessToken ?? '').split('.')[1];
    if (!part) return '';
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: unknown };
    return typeof claims.aal === 'string' ? claims.aal : '';
  } catch {
    return '';
  }
}

function factorsOf(session: Session | null): Factor[] {
  const list = (session?.user as { factors?: unknown } | undefined)?.factors;
  return Array.isArray(list) ? (list as Factor[]) : [];
}

/** The second steps this person has confirmed with a code. */
export function confirmedFactors(session: Session | null): Factor[] {
  return factorsOf(session).filter((f) => f.status === 'verified');
}

/**
 * The newest authenticator app that was set up but never confirmed with a code.
 *
 * WHY THIS IS ASKED FOR. Setting up means leaving this screen for the
 * authenticator app and coming back, and on a phone coming back often reloads
 * the page; so does the app updating itself. The set-up lived only on the
 * screen, so the next "Set it up" deleted the key the person had just added to
 * their app and showed a new one, and every code their app gave from then on
 * was refused (live, 21 October 2026: four set-ups in an hour, eight codes,
 * none accepted). The unfinished set-up is still on the account, so the screen
 * asks for its code instead of starting over.
 */
export function unfinishedFactor(session: Session | null): Factor | null {
  const open = factorsOf(session)
    .filter((f) => f.status !== 'verified' && f.factor_type === 'totp' && FACTOR_ID.test(f.id))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return open[0] ?? null;
}

/** Whether this session still owes the code: a confirmed second step and a password-only token. */
export function needsSecondStep(session: Session | null): boolean {
  return Boolean(session) && confirmedFactors(session).length > 0
    && tokenLevel(session?.access_token) !== 'aal2';
}

// A factor id goes into an address, so it must look like one and nothing else.
const FACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function factorPath(id: string, rest = ''): string {
  if (!FACTOR_ID.test(id)) throw new Error('That second step is not recognised. Start again.');
  return `/factors/${id}${rest}`;
}

/** The sign-in service's refusal, in words a person can act on. */
function refusal(status: number, payload: { error_code?: string; msg?: string; message?: string } | null): string {
  switch (payload?.error_code) {
    case 'mfa_verification_failed':
      return 'That code did not match. Codes change every 30 seconds: type the one showing now.';
    case 'mfa_challenge_expired':
      return 'That took a little too long. Type the code showing now.';
    case 'mfa_factor_not_found':
      return 'That authenticator app is no longer set up on this account. Start again.';
    case 'insufficient_aal':
      return 'Finish signing in with your code first.';
    case 'mfa_verified_factor_exists':
      return 'Two-step sign-in is already on for this account.';
    case 'too_many_enrolled_mfa_factors':
      return 'This account has too many unfinished set-ups. Ask whoever looks after your church\u2019s project to clear them.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'Two-step sign-in is switched off for this church’s project. Ask whoever looks after the project to switch on authenticator apps in Supabase (Authentication, Multi-Factor).';
    default:
      break;
  }
  if (status === 429) return 'Too many tries just now. Wait a minute, then try again.';
  return payload?.msg || payload?.message || 'Something went wrong. Please try again.';
}

/** One call to the sign-in service as the signed-in person. */
async function authCall<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: object): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const token = await liveAccessToken();
  if (!url || !key || !token) throw new Error('You are not signed in.');
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1${path}`, {
      method,
      cache: 'no-store',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach sign-in. Check your connection and try again.');
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(refusal(res.status, payload)) as Error & { errorCode?: string };
    error.errorCode = payload?.error_code;
    throw error;
  }
  return payload as T;
}

/**
 * Ask the sign-in service who this is, and keep the answer with the session,
 * so the app knows which second steps the account has. Needed when one was
 * set up on another device after this one signed in.
 */
export async function refreshMyFactors(): Promise<Session | null> {
  const user = await authCall<{ id?: string } | null>('/user', 'GET');
  const current = readBrowserSession();
  if (!current || !user?.id || user.id !== current.user.id) return current;
  const next = { ...current, user } as Session;
  saveBrowserSession(next);
  return next;
}

/** Prove a code against one second step, and keep the stronger session it returns. */
async function prove(factorId: string, code: string): Promise<void> {
  const digits = cleanCode(code);
  if (!digits) throw new Error('Type the six digits your authenticator app shows.');
  const challenge = await authCall<{ id?: string }>(factorPath(factorId, '/challenge'), 'POST', {});
  if (typeof challenge?.id !== 'string') throw new Error('Something went wrong. Please try again.');
  const next = await authCall<Partial<Session> | null>(factorPath(factorId, '/verify'), 'POST', {
    challenge_id: challenge.id,
    code: digits,
  });
  if (typeof next?.access_token !== 'string' || typeof next?.refresh_token !== 'string') {
    throw new Error('Something went wrong. Please try again.');
  }
  // Kept in the same plain form as every other session this app saves, with
  // the user from the answer so the confirmed factor is known from now on.
  const current = readBrowserSession();
  const expiresIn = typeof next.expires_in === 'number' ? next.expires_in : 3600;
  saveBrowserSession({
    ...(current ?? {}),
    ...next,
    expires_at: Math.round(Date.now() / 1000) + expiresIn,
  } as Session);
}

/** Finish signing in: the code from the authenticator app already set up. */
export async function enterCode(code: string): Promise<void> {
  let factor = confirmedFactors(readBrowserSession()).find((f) => f.factor_type === 'totp');
  if (!factor) factor = confirmedFactors(await refreshMyFactors()).find((f) => f.factor_type === 'totp');
  if (!factor) {
    throw new Error('This account’s second step is not an authenticator app. Ask whoever looks after your church’s project.');
  }
  await prove(factor.id, code);
}

/**
 * Start setting up an authenticator app, with a new key. Anything started
 * earlier and never confirmed is cleared first, which stops its key working:
 * only ever called when the person chooses to start again, never on its own
 * (see unfinishedFactor).
 */
export async function beginSecondStep(): Promise<NewSecondStep> {
  const me = await refreshMyFactors();
  for (const f of factorsOf(me)) {
    if (f.status !== 'verified' && FACTOR_ID.test(f.id)) {
      await authCall(factorPath(f.id), 'DELETE').catch(() => undefined);
    }
  }
  const made = await authCall<{ id?: string; totp?: { qr_code?: string; secret?: string } }>(
    '/factors', 'POST', { factor_type: 'totp', issuer: APP_NAME },
  );
  const svg = made?.totp?.qr_code;
  if (typeof made?.id !== 'string' || typeof svg !== 'string' || typeof made.totp?.secret !== 'string') {
    throw new Error('Something went wrong. Please try again.');
  }
  return {
    factorId: made.id,
    // The service sends the picture as SVG text. As a data: address it is shown
    // by an <img>, which runs no script, and the page's rules already allow it.
    qr: svg.startsWith('data:') ? svg : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    secret: made.totp.secret,
  };
}

/** Confirm the new authenticator app with its first code. */
export async function finishSecondStep(factorId: string, code: string): Promise<void> {
  await prove(factorId, code);
}

/** The sign-in service refused the code itself (as opposed to anything else going wrong). */
export function isWrongCode(error: unknown): boolean {
  return (error as { errorCode?: string } | null)?.errorCode === 'mfa_verification_failed';
}

// ---------------------------------------------------------------------------
// WHY A CODE WAS REFUSED, worked out on this device while setting up.
//
// Asked for on 21 October 2026, after codes from a brand-new key were refused
// on live with nothing to say why ("it generated the code and copy pasted the
// code and code doesn't work"). The sign-in service only ever says "invalid
// code". While setting up, this screen still holds the key, so it can work
// the code out itself, the way the authenticator app does (RFC 6238), and say
// which of the three usual reasons it is: the phone's clock, the key added as
// counter-based, or the code read from an older entry. It runs only AFTER the
// service has refused a code, so a code the service accepts is never second-
// guessed, and nothing about the key leaves the device.
// ---------------------------------------------------------------------------

/** What a refused code turned out to be. */
export type CodeDiagnosis =
  | { kind: 'now' }
  | { kind: 'shifted'; seconds: number }
  | { kind: 'counter' }
  | { kind: 'other' }
  | { kind: 'unknown' };

function keyBytes(secret: string): Uint8Array<ArrayBuffer> | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (!clean) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = alphabet.indexOf(ch);
    if (i < 0) return null;
    value = ((value << 5) | i) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** The six-digit code for each counter (RFC 4226), for a key as the app shows it. */
export async function codesForKey(secret: string, counters: number[]): Promise<Map<number, string>> {
  const bytes = keyBytes(secret);
  const subtle = globalThis.crypto?.subtle;
  const codes = new Map<number, string>();
  if (!bytes || !subtle) return codes;
  const key = await subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  for (const counter of counters) {
    const message = new DataView(new ArrayBuffer(8));
    message.setUint32(0, Math.floor(counter / 2 ** 32));
    message.setUint32(4, counter >>> 0);
    const mac = new Uint8Array(await subtle.sign('HMAC', key, message.buffer));
    const at = mac[mac.length - 1] & 0x0f;
    const number = ((mac[at] & 0x7f) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];
    codes.set(counter, String(number % 1_000_000).padStart(6, '0'));
  }
  return codes;
}

/** Which of the usual reasons a refused code was refused for. */
export async function diagnoseCode(secret: string, code: string, nowMs = Date.now()): Promise<CodeDiagnosis> {
  const digits = cleanCode(code);
  if (!digits) return { kind: 'unknown' };
  try {
    const step = Math.floor(nowMs / 30_000);
    // Twenty minutes either side: a clock further out than that is not a
    // clock somebody has set by hand.
    const around = Array.from({ length: 81 }, (_, i) => step - 40 + i);
    const timed = await codesForKey(secret, around);
    if (!timed.size) return { kind: 'unknown' };
    let nearest: number | null = null;
    for (const [counter, value] of timed) {
      const k = counter - step;
      if (value === digits && (nearest === null || Math.abs(k) < Math.abs(nearest))) nearest = k;
    }
    if (nearest !== null) return Math.abs(nearest) <= 1 ? { kind: 'now' } : { kind: 'shifted', seconds: nearest * 30 };
    const counted = await codesForKey(secret, Array.from({ length: 21 }, (_, i) => i));
    if ([...counted.values()].includes(digits)) return { kind: 'counter' };
    return { kind: 'other' };
  } catch {
    return { kind: 'unknown' };
  }
}

/** A refused code's reason, in words a person can act on. */
export function explainRefusedCode(why: CodeDiagnosis, appName: string): string | null {
  const minutes = (seconds: number) => {
    const m = Math.max(1, Math.round(Math.abs(seconds) / 60));
    return `${m} minute${m === 1 ? '' : 's'}`;
  };
  switch (why.kind) {
    case 'now':
      // Right by this device's clock, refused by the service's: the clocks
      // disagree. (Nothing here can read the service's clock to show by how much.)
      return 'Your code is right for this key by this device’s clock, but the sign-in service’s clock disagrees. Turn on automatic date and time in your phone’s Settings (and on the device with your authenticator app, if that is another one), then type the code showing now.';
    case 'shifted':
      return why.seconds < 0
        ? `That code is from about ${minutes(why.seconds)} ago: it was typed late, or the clock on the device with your authenticator app is behind. Make sure that device sets its date and time automatically, then type the code showing now.`
        : `That code is about ${minutes(why.seconds)} ahead: the clock on the device with your authenticator app is ahead. Turn on automatic date and time there, then type the code showing now.`;
    case 'counter':
      return 'Your authenticator app added this key as counter-based. Delete that entry and add the key again, choosing Time-based.';
    case 'other':
      return `That code does not come from this key. Your authenticator app is probably showing an older ${appName} entry: delete every ${appName} entry in it, add this key again (scan the picture, or paste the key), and type the code from the new entry.`;
    default:
      return null;
  }
}

/** Take the authenticator app off this account. Needs the code-confirmed session. */
export async function turnOffSecondStep(factorId: string): Promise<void> {
  await authCall(factorPath(factorId), 'DELETE');
  await refreshMyFactors().catch(() => null);
}

/** The key in groups of four, which is how people copy it without losing their place. */
export function groupedSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}
