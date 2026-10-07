'use client';

import Link from 'next/link';
import { useDemo } from '@/lib/demo/store';
import { Card } from '@/components/ui';
import { HomeBoard, postedWhen, type BoardItem } from '@/components/HomeBoard';
import { postsVisibleTo } from '@/components/Blog';
import { NAVY, GOLD } from '@/lib/brand';
import {
  churchFeed,
  upcomingCount,
  ANNOUNCEMENTS,
  isPrivileged,
  pendingSignups,
  deskFor,
} from '@/lib/activity';

// The church home billboard — the first thing every account sees.
//
// Shape borrowed from a team workspace: a wide masthead, then a stream of what
// is happening across the church, with the same shared board for everyone. The
// privileged strip (Admin / Executive) sits above the stream because for those
// two roles the church is a thing to run, not only to watch — but the
// stream below it is byte-for-byte the same board a seeker sees, and it names no
// one's private journey.

const TONE_RING: Record<string, string> = {
  milestone: '#7FB03A',
  welcome: '#2F80ED',
  meeting: '#E8B84B',
  prayer: '#9B6DD6',
  announce: '#5B6675',
};

export function ChurchBillboard() {
  const { db, currentUser, recordBlogView } = useDemo();
  const me = currentUser!;
  // THE BILLBOARD (7 October 2026): the church's notices and what people have
  // written, as pictures, before anything else. See components/HomeBoard.tsx.
  const nameOf = (id: string) => db.profiles.find((p) => p.id === id)?.full_name ?? 'Someone';
  const notices: BoardItem[] = ANNOUNCEMENTS.map((a) => ({
    key: a.id, kind: 'notice', title: a.title, byline: a.when, text: a.body, icon: a.icon,
  }));
  const posts: BoardItem[] = postsVisibleTo(db, me.id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)
    .map((p) => ({
      key: p.id,
      kind: 'post',
      title: p.title,
      byline: `${nameOf(p.author_id)} · ${postedWhen(p.created_at)}`,
      text: p.body,
      media: p.media,
      onOpen: () => recordBlogView(p.id),
    }));
  const feed = churchFeed(db).slice(0, 12);
  const coming = upcomingCount(db);
  const privileged = isPrivileged(me.role);
  const pending = privileged ? pendingSignups(db) : [];
  const desk = deskFor(me.role);

  return (
    <div className="space-y-6">
      {/* Masthead. SMALLER ON A PHONE (7 October 2026), so the billboard under
          it is on the first screen: the church's name and its counts stay,
          the sentence about the board waits for a wider screen. */}
      <div
        className="overflow-hidden rounded-2xl p-5 text-white sm:p-6"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50 sm:text-sm">
          Church home
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          {db.church_name}
        </h1>
        <p className="mt-2 hidden max-w-xl text-white/70 sm:block">
          Everything happening across the church, in one place. Everyone sees this
          board. No one’s private journey is ever shown here.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 sm:mt-4 sm:gap-2">
          <Chip label={`${coming} conversation${coming === 1 ? '' : 's'} this week`} />
          <Chip
            label={`${
              db.profiles.filter((p) => p.role === 'ds' && p.is_approved).length
            } Explorers walking`}
          />
          <Chip
            label={`${
              db.profiles.filter((p) => p.role === 'dm' && p.is_approved).length
            } Guides`}
          />
        </div>
      </div>

      <HomeBoard name="notices" heading="📌 Announcements" items={notices} />
      <HomeBoard
        name="posts"
        heading="✍️ From the blog"
        items={posts}
        more={<Link href="/church?room=blogs" className="text-sm font-semibold text-room underline underline-offset-2">All posts</Link>}
      />

      {/* Privileged strip — Admin / Executive. */}
      {privileged && (
        <div
          className="rounded-2xl border-2 bg-white p-5 shadow-sm"
          style={{ borderColor: `${GOLD}66` }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-navy">
              🛠️ For you to action
            </h2>
            {desk && (
              <Link
                href={desk.href}
                className="text-sm font-semibold text-navy underline"
              >
                {desk.label} →
              </Link>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="text-gray-500">
              Nothing waiting. The church is all caught up. 🎉
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                {pending.length} new sign-up{pending.length === 1 ? '' : 's'} need
                {pending.length === 1 ? 's' : ''} a decision.
              </p>
              {pending.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    {s.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{s.name}</p>
                    <p className="truncate text-sm text-gray-500">
                      {s.city ? `${s.city} · ` : ''}
                      {s.when}
                    </p>
                  </div>
                  {/* One gate, one word. The Church Board used to endorse
                      before an admin approved; the board is not an account any
                      more and approves missionaries off the app, so what is left
                      is a single admin decision. */}
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                  >
                    Approve
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The live stream. */}
      <div>
        <h2 className="mb-3 text-xl font-bold text-room">🔔 Latest across the church</h2>
        {feed.length === 0 ? (
          <Card className="p-6 text-center text-gray-400">
            Nothing yet. As the church moves, it shows up here.
          </Card>
        ) : (
          <div className="space-y-2">
            {feed.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-2xl border-l-4 bg-white p-4 shadow-sm"
                style={{ borderLeftColor: TONE_RING[item.tone] ?? '#5B6675' }}
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{item.title}</p>
                  {item.detail && (
                    <p className="text-sm text-gray-500">{item.detail}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {item.whenLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="text-sm font-semibold text-white/80 sm:rounded-full sm:bg-white/10 sm:px-3 sm:py-1.5 sm:text-white/90">
      {label}
    </span>
  );
}
