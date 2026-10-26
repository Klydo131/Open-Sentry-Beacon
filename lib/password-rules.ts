// The rules a new password is held to, the same on every screen that sets one:
// the invitation (/join), the reset link (/new-password) and Settings
// (/password). Pure: no browser and no database, so tests/a-new-password-has-
// its-own-page.mjs runs it as it ships. The sign-in service checks again and
// has the last word (lib/live/errors.ts says its refusals in words).

import { APP_NAME } from './brand';

/** The shortest password the app accepts. The sign-in service may ask for more. */
export const PASSWORD_MIN = 10;

/**
 * The longest, in bytes. The sign-in service stores passwords with bcrypt,
 * which reads 72 bytes and ignores the rest, so it refuses anything longer.
 * An accented letter or an emoji is more than one byte.
 */
export const PASSWORD_MAX_BYTES = 72;

const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * What is wrong with this choice, in words, or '' when nothing is.
 *
 * Deliberately short. Length matters most, and a list of composition rules
 * mostly produces "Password1!" (NIST SP 800-63B, 5.1.1.2). What is refused
 * besides length is what an attacker tries first: the person's own e-mail
 * address, the app's name, one key held down, or a row of the keyboard.
 */
export function passwordProblem(chosen: string, again: string, email = ''): string {
  if (!chosen) return 'Type a new password.';
  if (chosen.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters. That is ${chosen.length}.`;
  }
  if (bytes(chosen) > PASSWORD_MAX_BYTES) {
    return 'That password is too long. Keep it under 72 characters.';
  }
  const plain = chosen.toLowerCase().replace(/\s+/g, '');
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  if ((email && plain === email.trim().toLowerCase()) || (local.length >= 4 && plain.includes(local))) {
    return 'Do not use your e-mail address in your password. It is the first thing somebody would try.';
  }
  if (plain.includes(APP_NAME.toLowerCase().replace(/\s+/g, ''))) {
    return `Do not use the app’s name in your password. It is the first thing somebody would try.`;
  }
  if (/^(.)\1+$/.test(plain) || isARun(plain)) {
    return 'That is too easy to guess. Use words or a phrase only you would think of.';
  }
  if (chosen !== again) return 'The two passwords do not match.';
  return '';
}

const RUNS = ['0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', 'password'];
function isARun(plain: string): boolean {
  return RUNS.some((run) => {
    const back = run.split('').reverse().join('');
    return (run + run).includes(plain) || (back + back).includes(plain);
  })
    || /^(password|passw0rd|letmein|iloveyou|welcome)\d*$/.test(plain);
}
