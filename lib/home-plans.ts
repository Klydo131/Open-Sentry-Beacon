// A shared Sabbath program or evangelistic meeting on Home: one announcement
// card each, never a blog post.
//
// Asked for on 13 November 2026.
//
// Sharing a plan posts it on the blog, because the blog is how it reaches each
// Explorer's phone and stays there without a signal (This Sabbath reads it
// from there). Home no longer lists those posts under From the blog. In their
// place, Announcements carries at most two short cards, the coming Sabbath's
// program and the newest meetings, and each opens This Sabbath, where the
// whole order of service is.

import { byComingSabbath, dateLabel, dayKey, isSharedProgram, sharedDate } from '@/lib/sabbath-program';
import { isSharedMeeting, MEETING_PREFIX } from '@/lib/evangelistic-meeting';
import type { BoardItem } from '@/components/HomeBoard';

/** A post that is a shared plan, which Home shows as an announcement instead. */
export function isPlanPost(title: string): boolean {
  return isSharedProgram(title) || isSharedMeeting(title);
}

/** At most two cards: the coming Sabbath's program, then the newest meetings. */
export function planNotices(posts: { id: string; title: string; created_at: string }[], now = new Date()): BoardItem[] {
  const programs = posts.filter((p) => isSharedProgram(p.title))
    .map((p) => ({ id: p.id, title: p.title, body: '', from: '', at: p.created_at }))
    .sort(byComingSabbath(dayKey(now)));
  const meetings = posts.filter((p) => isSharedMeeting(p.title))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const out: BoardItem[] = [];
  const program = programs[0];
  if (program) {
    out.push({
      key: `plan-${program.id}`,
      kind: 'notice',
      icon: '🗓️',
      title: 'Sabbath program',
      byline: dateLabel(sharedDate(program.title)) || 'This Sabbath',
      text: 'The order of service. Open This Sabbath to read it.',
      href: '/sabbath',
    });
  }
  const meeting = meetings[0];
  if (meeting) {
    out.push({
      key: `plan-${meeting.id}`,
      kind: 'notice',
      icon: '📣',
      title: 'Evangelistic meetings',
      byline: meeting.title.slice(MEETING_PREFIX.length) || 'The series',
      text: 'The nights and who leads them. Open This Sabbath to read them.',
      href: '/sabbath',
    });
  }
  return out;
}
