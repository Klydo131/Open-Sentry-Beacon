// How a conversation is laid out in time: days, runs, and the clock.
//
// Pure functions, shared by both halves of the app through
// components/talk/ChatView.tsx. Moved here from components/live/shared.tsx on
// 1 October 2026, when the sample app's chat started drawing the same thread.

/** Was this sent today? */
export function sameDay(at: string): boolean {
  const then = new Date(at);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear()
    && then.getMonth() === now.getMonth()
    && then.getDate() === now.getDate()
  );
}

/** The calendar day something happened on, for comparing two entries. */
export function dayKey(at: string): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * What to call a day in a divider: Today, Yesterday, or the date itself.
 *
 * WHY A THREAD NEEDS THESE AT ALL. Every run of messages carries its own time,
 * and inside one day that is enough. Over weeks it is not: a stamp reading
 * "Sep 2" and one reading "Sep 9" four bubbles later never draw the LINE
 * between them, so a reply that came a week later reads as the next thing said.
 * Where a week passed between two messages is often the most important thing
 * on the screen -- especially for a Guide looking back at whether somebody
 * went quiet.
 */
export function dayLabel(at: string): string {
  const then = new Date(at);
  if (sameDay(at)) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday.toISOString())) return 'Yesterday';

  // Inside the last week the weekday is what people actually remember -- "we
  // talked about it on Tuesday" -- and a bare date makes them count back.
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days < 7) return then.toLocaleDateString([], { weekday: 'long' });

  // The year only once it is not this one.
  const thisYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

// One formatter, made once. Building it is the costly part, and a thread asks
// for a time on every run of messages as it opens (4 October 2026). The text is
// the same as toLocaleTimeString with these options.
const CLOCK = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });

/** The clock time, as the phone shows it: 10:41 or 10:41 AM. */
export function clockTime(at: string): string {
  return CLOCK.format(new Date(at));
}

/**
 * Messages this close together, from one person, on one day, are one run.
 *
 * ONE RUN OF TALKING, NOT FIVE SEPARATE CARDS. Somebody sending four short
 * lines in a row used to produce four names and four times around a dozen
 * words. In a run, the bubbles sit close, their inner corners tighten so they
 * read as one shape, and the time is said once, where the run ends.
 *
 * THE TIME GAP MATTERS AS WELL AS THE SPEAKER. Two messages from one person
 * three hours apart are not one breath, and grouping them would hide that the
 * second was an afterthought hours later. A new day always starts a new run,
 * however close the clock times are: 23:59 and 00:02 are not one breath.
 */
export const SAME_BREATH_MS = 5 * 60 * 1000;

export interface Timed {
  who: string;
  at: string;
}

/** Does `b` carry on the run `a` was in? */
export function runsOn(a: Timed | undefined, b: Timed): boolean {
  return !!a && a.who === b.who
    && dayKey(a.at) === dayKey(b.at)
    && Math.abs(new Date(b.at).getTime() - new Date(a.at).getTime()) < SAME_BREATH_MS;
}

/** A file size a person can read: 840 KB, 2.4 MB. */
export function readableSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 0:07, 1:42: how long a voice message runs. */
export function clockDuration(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The longest a file's title may be. The database holds the same limit. */
export const TITLE_MAX = 200;

/**
 * A file's name as it is shown and stored: without the invisible characters
 * that reverse the text after them, and no longer than TITLE_MAX.
 *
 * Those characters (U+202A to U+202E, U+2066 to U+2069) are how
 * `photo<U+202E>gnp.js` shows as "photosj.png" -- a program dressed as a
 * picture, the trick used against Telegram in 2018. The database refuses them
 * in new titles (migration 20261001120000); this also cleans any older title
 * before it is drawn. Found by the security review of 1 October 2026.
 */
export function plainTitle(title: string): string {
  return [...title.replace(/[\u202A-\u202E\u2066-\u2069]/g, '').trim()].slice(0, TITLE_MAX).join('');
}
