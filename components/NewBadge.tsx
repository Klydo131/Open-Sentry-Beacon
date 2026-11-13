'use client';

// "New", for seven days.
//
// WHY IT EXPIRES. A badge that never comes off stops being information and
// becomes decoration: after a month every second person is "new" and nobody
// reads it. Seven days is roughly a week of church life, which is the window
// where somebody actually is new to the people around them.
//
// IT IS COMPUTED, NEVER STORED. A stored boolean is correct on the day it is
// written and silently wrong a week later, with nothing to tell anybody it has
// gone stale. This reads the date it already has, every time it draws, so it
// cannot drift.
//
// WHICH DATE. signup_completed_at is when they chose a password and actually
// arrived, which is what "new" means to the people meeting them. created_at is
// when a Director typed their address, which can be weeks earlier and would
// make somebody who joined this morning look like an old hand. It falls back to
// created_at only when the first is missing.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewMember(person: {
  signup_completed_at?: string | null;
  created_at?: string | null;
}): boolean {
  const raw = person.signup_completed_at || person.created_at;
  if (!raw) return false;
  const at = new Date(raw).getTime();
  if (Number.isNaN(at)) return false;
  // A date in the future is a clock problem, not a new member. Treating it as
  // new would pin the badge on somebody permanently.
  if (at > Date.now()) return false;
  return Date.now() - at < SEVEN_DAYS_MS;
}

/** How many whole days are left on the badge, for a tooltip. */
function daysLeft(person: { signup_completed_at?: string | null; created_at?: string | null }): number {
  const raw = person.signup_completed_at || person.created_at;
  const at = raw ? new Date(raw).getTime() : 0;
  return Math.max(1, Math.ceil((SEVEN_DAYS_MS - (Date.now() - at)) / (24 * 60 * 60 * 1000)));
}

export function NewBadge({ person }: {
  person: { signup_completed_at?: string | null; created_at?: string | null };
}) {
  if (!isNewMember(person)) return null;
  const left = daysLeft(person);
  return (
    <span
      title={`Joined this week. This mark disappears in ${left} ${left === 1 ? 'day' : 'days'}.`}
      /* THE RING PULSES TWICE AND STOPS. A badge that pulses forever is a badge
         people stop seeing, and then it is only noise on somebody's name. Twice
         on each render is enough to catch an eye scanning a roster and short
         enough that it is over before it irritates. It does not animate at all
         under prefers-reduced-motion; see app/globals.css.

         EVERY ROLE GETS THE SAME MARK, and that is deliberate rather than
         lazy. A different badge for a new Explorer would announce which
         members are Explorers to everybody who can see the list, which is
         exactly what lib/brand's roleLabel rule exists to prevent. Somebody
         new is somebody new. */
      className="beacon-new shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-800"
    >
      New
    </span>
  );
}
