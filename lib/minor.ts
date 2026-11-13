// Who is under 18, and who checked the letter.
//
// DERIVED, NEVER STORED. The badge is computed from the birthday every time it
// is drawn. A stored "is a minor" flag is correct on the day somebody sets it
// and silently wrong from the morning of that person's eighteenth birthday, and
// nothing would ever announce that it had gone stale. A safeguarding mark that
// quietly becomes false is worse than none, because people trust it.
//
// The database agrees: public.is_minor(date) is STABLE for the same reason, and
// cannot be a generated column because Postgres only allows IMMUTABLE functions
// there. Both sides compute; neither remembers.

/** True when this birthday is less than 18 years ago. */
export function isMinor(birthday?: string | null, today = new Date()): boolean {
  if (!birthday) return false; // A missing birthday is not a child.

  // Parsed as a local date on purpose. `new Date('2009-08-25')` is UTC midnight,
  // which in Manila is already the 25th but in New York is still the 24th, and
  // an off-by-one on the day somebody turns 18 is exactly the day it matters.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return false;

  // Their eighteenth birthday, and whether it has arrived.
  const eighteenth = new Date(year + 18, month - 1, day);
  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return midnightToday < eighteenth;
}

export interface GuardianConsent {
  guardian_name?: string | null;
  guardian_consent_at?: string | null;
}

/**
 * What a Guide or Director needs to know about this person, in one word.
 *
 * 'none'      not a minor, nothing to show
 * 'ok'        under 18, and a Director has recorded a signed letter
 * 'missing'   under 18 and NO letter recorded — the case that needs acting on
 */
export type MinorState = 'none' | 'ok' | 'missing';

export function minorState(
  person: { birthday?: string | null } & GuardianConsent,
  today = new Date(),
): MinorState {
  if (!isMinor(person.birthday, today)) return 'none';
  return person.guardian_consent_at ? 'ok' : 'missing';
}
