'use client';

import Link from 'next/link';
import { useDemo } from '@/lib/demo/store';
import { Card } from '@/components/ui';
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
  const { db, currentUser } = useDemo();
  const me = currentUser!;
  const feed = churchFeed(db).slice(0, 12);
  const coming = upcomingCount(db);
  const privileged = isPrivileged(me.role);
  const pending = privileged ? pendingSignups(db) : [];
  const desk = deskFor(me.role);

  return (
    <div className="space-y-6">
      {/* Masthead */}
      <div
        data-church-masthead
        className="overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
      >
        <p className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Church home
        </p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
          {db.church_name}
        </h1>
        <p className="mt-2 max-w-xl text-white/70">
          Everything happening across the church, in one place. Everyone sees this
          board. No one’s private journey is ever shown here.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
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

      {/* Announcements — church-wide notices, pinned above the live stream. */}
      <div>
        <h2 className="mb-3 text-xl font-bold text-room">📌 Announcements</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ANNOUNCEMENTS.map((a) => (
            <Card key={a.id} className="p-4">
              <span className="text-2xl" aria-hidden>
                {a.icon}
              </span>
              <p className="mt-1 font-bold text-navy">{a.title}</p>
              <p className="text-sm text-gray-600">{a.body}</p>
              <p className="mt-2 text-xs font-semibold text-gray-400">{a.when}</p>
            </Card>
          ))}
        </div>
      </div>

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
    <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
      {label}
    </span>
  );
}
