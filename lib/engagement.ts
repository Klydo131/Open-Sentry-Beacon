import { prayerAuthor, type DB, type Pairing, type Meeting, type MaterialShare, type Message } from './types';

// Turn the activity we already log (messages + behaviour events) into a simple
// engagement read for a missionary: when the seeker was last active, a few
// counts, and whether they've gone quiet and may need a check-in. No new data
// is collected — this is a view over existing events.
export interface Engagement {
  lastActive: string | null;
  daysSince: number | null;
  messagesSent: number;
  materialsOpened: number;
  lessonsDone: number;
  quiet: boolean;
}

const QUIET_DAYS = 7;

export function seekerEngagement(
  db: DB,
  dsId: string,
  pairingId: string,
): Engagement {
  // Messages are scoped to THIS conversation — "how much have they said to me"
  // — while lastActive deliberately spans everything they do in the app, so a
  // seeker reading resources without writing still counts as active.
  const msgs = db.messages.filter(
    (m) => m.sender_id === dsId && m.pairing_id === pairingId,
  );
  const acts = db.analytics.filter((a) => a.user_id === dsId);
  const times = [
    ...db.messages.filter((m) => m.sender_id === dsId).map((m) => m.created_at),
    ...acts.map((a) => a.at),
  ];
  const lastActive = times.length
    ? times.reduce((a, b) => (a > b ? a : b))
    : null;
  const daysSince = lastActive
    ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000)
    : null;
  return {
    lastActive,
    daysSince,
    messagesSent: msgs.length,
    materialsOpened: acts.filter((a) => a.type === 'material_open').length,
    lessonsDone: db.lesson_assignments.filter(
      (a) => a.pairing_id === pairingId && a.status === 'completed',
    ).length,
    quiet: daysSince === null || daysSince >= QUIET_DAYS,
  };
}

// Today as YYYY-MM-DD in the viewer's own timezone. Follow-up dates are plain
// dates with no time, so comparing them as strings against a UTC-derived
// "today" would tip a whole day early or late either side of the date line.
export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// What a missionary needs to act on for one seeker, and how loudly. Feeds both
// the triage chips and the ordering of the seeker list.
export interface Urgency {
  overdue: number; // follow-ups past their due date
  dueToday: number;
  unread: number; // messages from the seeker not yet opened
  quiet: boolean; // no activity for QUIET_DAYS
  score: number; // higher sorts first
}

export function seekerUrgency(
  db: DB,
  pairing: Pairing,
  meId: string,
): Urgency {
  const today = todayKey();
  const open = db.follow_ups.filter(
    (f) => f.pairing_id === pairing.id && f.owner_id === meId && !f.done_at,
  );
  const overdue = open.filter((f) => f.due_on && f.due_on < today).length;
  const dueToday = open.filter((f) => f.due_on === today).length;
  const unread = db.messages.filter(
    (m) =>
      m.pairing_id === pairing.id && m.sender_id === pairing.ds_id && !m.read_at,
  ).length;
  const { quiet } = seekerEngagement(db, pairing.ds_id, pairing.id);

  // Weights are ordered, not additive-by-accident: one overdue reminder
  // outranks any number of unread messages, which outrank going quiet.
  const score =
    overdue * 1000 + dueToday * 500 + (unread > 0 ? 100 + unread : 0) + (quiet ? 10 : 0);

  return { overdue, dueToday, unread, quiet, score };
}

// A compact form for tiles and cards, where "Active 12 days ago" does not fit
// and truncates to "Active 12 d…". Same information, four characters.
export function activeShort(daysSince: number | null): string {
  if (daysSince === null) return 'Never';
  if (daysSince <= 0) return 'Today';
  if (daysSince === 1) return 'Yesterday';
  if (daysSince < 7) return `${daysSince}d ago`;
  if (daysSince < 30) return `${Math.floor(daysSince / 7)}w ago`;
  return `${Math.floor(daysSince / 30)}mo ago`;
}

export function activeLabel(daysSince: number | null): string {
  if (daysSince === null) return 'No activity yet';
  if (daysSince <= 0) return 'Active today';
  if (daysSince === 1) return 'Active yesterday';
  return `Active ${daysSince} days ago`;
}

// ---- The seeker's own side ----
//
// Everything above answers "what does the missionary need to do about this
// seeker". This answers the other direction: what is waiting for the SEEKER.
// It is the same idea and the same data, read from the other end, which is why
// it lives here rather than in a second module that would drift from this one.
//
// Deliberately absent: the journey stage. A seeker never sees which step the
// church has them on, and a "priority" strip is exactly where that would creep
// back in as "you are ready for the next stage".
export interface SeekerPriorities {
  // Unread is nearly useless on the seeker's own page, and it took a failing
  // test to notice why: the conversation is ON that page, and Chat marks
  // everything read the moment it mounts. By the seeker's second visit there is
  // never anything unread to report. awaitingReply survives, because it asks a
  // question the page cannot answer for you — the last thing said was said by
  // your missionary, so it is your turn.
  awaitingReply: Message | null;
  unreadFromDm: number;
  nextMeeting: Meeting | null;
  lessonsOpen: number;
  latestShare: MaterialShare | null;
  unansweredPrayer: number;
}

export function seekerPriorities(
  db: DB,
  dsId: string,
  pairing: Pairing | undefined,
): SeekerPriorities {
  const now = Date.now();
  if (!pairing) {
    return {
      awaitingReply: null,
      unreadFromDm: 0,
      nextMeeting: null,
      lessonsOpen: 0,
      latestShare: null,
      unansweredPrayer: db.prayer_requests.filter(
        (r) => r.ds_id === dsId && prayerAuthor(r) === dsId && r.status === 'open',
      ).length,
    };
  }

  const nextMeeting =
    db.meetings
      .filter(
        (m) =>
          m.pairing_id === pairing.id &&
          m.status === 'scheduled' &&
          new Date(m.when).getTime() >= now,
      )
      .sort((a, b) => a.when.localeCompare(b.when))[0] ?? null;

  const latestShare =
    db.material_shares
      .filter((s) => s.pairing_id === pairing.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const thread = db.messages
    .filter((m) => m.pairing_id === pairing.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = thread[thread.length - 1];

  return {
    awaitingReply: last && last.sender_id === pairing.dm_id ? last : null,
    // Messages the missionary sent that this seeker has not opened. The mirror
    // of the unread count in seekerUrgency, which counts the other direction.
    unreadFromDm: db.messages.filter(
      (m) =>
        m.pairing_id === pairing.id &&
        m.sender_id === pairing.dm_id &&
        !m.read_at,
    ).length,
    nextMeeting,
    lessonsOpen: db.lesson_assignments.filter(
      (a) => a.pairing_id === pairing.id && a.status !== 'completed',
    ).length,
    latestShare,
    unansweredPrayer: db.prayer_requests.filter(
      (r) => r.ds_id === dsId && prayerAuthor(r) === dsId && r.status === 'open',
    ).length,
  };
}

// "Tomorrow, 7:00 PM" — short enough for a tile.
export function meetingWhen(iso: string): string {
  const t = new Date(iso);
  const days = Math.round((t.getTime() - Date.now()) / 86_400_000);
  const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7)
    return `${t.toLocaleDateString([], { weekday: 'long' })}, ${time}`;
  return `${t.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
