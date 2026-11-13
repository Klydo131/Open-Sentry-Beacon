// The church activity billboard — "what's happening", composed from real demo
// data rather than a hardcoded list.
//
// The hard rule here is the same one the /church board has always kept: the
// shared feed shows NO individual seeker's private journey. A milestone is
// celebrated in the aggregate — "someone reached the Care stage" — never "John
// reached Care". A seeker glancing at the billboard learns the church is moving,
// not who is where. Anything that needs a name to be useful (a new sign-up to
// vouch for, an approval to grant) is not in the shared feed at all; it lives in
// the privileged strip below, which only Admin and Executive ever see, and only
// because acting on it is their job.

import type { DB, Role, Profile } from './types';

export type FeedTone = 'milestone' | 'welcome' | 'meeting' | 'prayer' | 'announce';

export interface FeedItem {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  when: number; // epoch ms, for sorting
  whenLabel: string;
  tone: FeedTone;
}

// A short, human "when". Exact enough to feel live, vague enough to leak nothing.
export function relTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function futureLabel(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const days = Math.round((t - now) / 86400000);
  const time = new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return `${new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
}

// Manually-posted church announcements (events, notices). Everyone sees these.
export interface Announcement {
  id: string;
  icon: string;
  title: string;
  body: string;
  when: string; // free text like "This Sabbath, 9:00 AM"
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a-sabbath',
    icon: '📖',
    title: 'Sabbath worship',
    body: 'Gather with the church family this Sabbath for worship and study.',
    when: 'This Sabbath, 9:00 AM',
  },
  {
    id: 'a-prayer',
    icon: '🙏',
    title: 'Week of Prayer',
    body: 'Every evening this week, online and in person. All are welcome.',
    when: 'Mon to Fri, 7:00 PM',
  },
  {
    id: 'a-welcome',
    icon: '🎉',
    title: 'Welcome, new friends',
    body: 'We’re grateful for everyone beginning their journey with us.',
    when: 'Ongoing',
  },
];

// The shared, anonymized feed. Identical for every role — nobody's private
// journey appears, so it is safe to show a seeker and a pastor the same board.
export function churchFeed(db: DB, now = Date.now()): FeedItem[] {
  const items: FeedItem[] = [];

  // Milestones: every stage advance, celebrated without a name.
  for (const ev of db.journey_events) {
    items.push({
      id: `mile-${ev.id}`,
      icon: ev.to_stage === 'commission' ? '🕊️' : '🌱',
      // No stage name. The feed is visible to seekers, and naming the stage
      // here told every one of them what the ladder is and roughly where the
      // church places people on it — which is the thing the client asked to
      // hide from them. The celebration survives; the label does not.
      title:
        ev.to_stage === 'commission'
          ? 'A friend was commissioned to disciple others'
          : 'A friend took a step forward',
      detail: 'Praise God for another step on the journey.',
      when: new Date(ev.created_at).getTime(),
      whenLabel: relTime(ev.created_at, now),
      tone: 'milestone',
    });
  }

  // New friends joining — celebrated, but NOT named. In a discipleship app a
  // seeker's identity is sensitive: being publicly listed as a seeker is exactly
  // what someone quietly exploring faith may not want. So the shared board says
  // a friend joined, never who. The name reaches only the privileged strip
  // below, and only the roles whose job is to welcome and approve them.
  for (const p of db.profiles) {
    if (p.role !== 'ds' || !p.is_approved) continue;
    items.push({
      id: `welcome-${p.id}`,
      icon: '👋',
      title: 'A new friend joined the journey',
      detail: 'Welcome them when your paths cross.',
      when: new Date(p.created_at).getTime(),
      whenLabel: relTime(p.created_at, now),
      tone: 'welcome',
    });
  }

  // Answered prayers — the shared prayer wall's happiest moments, anonymous.
  for (const r of db.prayer_requests) {
    if (!r.share_with_board || r.status !== 'answered') continue;
    items.push({
      id: `prayer-${r.id}`,
      icon: '🙌',
      title: 'A prayer was answered',
      detail: `“${r.body}”`,
      when: new Date(r.created_at).getTime(),
      whenLabel: relTime(r.created_at, now),
      tone: 'prayer',
    });
  }

  return items.sort((a, b) => b.when - a.when);
}

// Church-wide events coming up. Aggregated from meetings so no pairing is named:
// "3 conversations planned this week", not who is meeting whom.
export function upcomingCount(db: DB, now = Date.now()): number {
  const weekOut = now + 7 * 86400000;
  return db.meetings.filter((m) => {
    if (m.status !== 'scheduled') return false;
    const t = new Date(m.when).getTime();
    return t >= now && t <= weekOut;
  }).length;
}

// ---- The privileged strip. Admin / Executive only. ----
// These carry names because acting on them is the whole point, and both roles
// already see this information in their own dashboards.

export function isPrivileged(role: Role): boolean {
  return role === 'admin' || role === 'executive';
}

export interface PendingSignup {
  id: string;
  name: string;
  city?: string;
  when: string;
}

export function pendingSignups(db: DB): PendingSignup[] {
  return db.profiles
    .filter((p) => !p.is_approved && p.role !== 'executive')
    .map((p: Profile) => ({
      id: p.id,
      name: p.full_name,
      city: p.city_of_residence,
      when: relTime(p.created_at),
    }));
}

// Where a privileged member goes to act on the whole church, so the billboard's
// advanced strip can deep-link to the right desk.
export function deskFor(role: Role): { href: string; label: string } | null {
  if (role === 'admin' || role === 'executive')
    return { href: '/admin', label: 'Open the admin desk' };
  return null;
}
