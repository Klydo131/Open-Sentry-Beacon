'use client';

// The church home board, live.
//
// The tutorial has had a masthead, a strip of things for a Director to action,
// a row of notices and a stream of what is happening. Live had a heading and
// two stat cards. This is the same board against the real database.
//
// TWO THINGS ARE DELIBERATELY DIFFERENT FROM THE TUTORIAL.
//
// The notices are real rows a Director writes, not three hard-coded strings.
// A demonstration can pretend; a church needs to change the time of a meeting.
//
// There is no feed of journey milestones. In the tutorial that stream is
// anonymised invented data. Against a real congregation of forty, "a friend
// moved forward this week" is a sentence a handful of people can attach a name
// to, and the people it is about never agreed to be in it. The counts say the
// same thing without pointing at anybody.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_ROSTER, KEEP_UP_CHURCH } from '@/lib/live/keep-up';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { NAVY, GOLD } from '@/lib/brand';
import { humanError } from '@/lib/live/errors';
import { HomeBoard, postedWhen, type BoardItem } from '@/components/HomeBoard';

function message(cause: unknown): string {
  return humanError(cause, 'That did not work.');
}

function Chip({ label }: { label: string }) {
  return (
    <span className="text-sm font-semibold text-white/80 sm:rounded-full sm:bg-white/10 sm:px-3 sm:py-1.5 sm:text-white/90">
      {label}
    </span>
  );
}

export function LiveBillboard({ churchName, between }: {
  churchName?: string | null;
  /**
   * Rendered at the foot of the board, after the billboard's two rows.
   *
   * It once put Community Blogs between the masthead and the notices. The
   * blog is on the billboard itself now (components/HomeBoard.tsx), and
   * nothing passes this today; it is kept as the one place a caller can add
   * to Home without this file knowing about it.
   */
  between?: React.ReactNode;
}) {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';

  const [members, setMembers] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // A member who is not leadership cannot read the roster, and that is
      // correct. The masthead still has to draw for them, so the counts are
      // simply absent rather than the page failing.
      setMembers(await live.listMembers().catch(() => null));
      setError('');
    } catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_ROSTER, load);


  // THE BILLBOARD (7 October 2026): what the church has pinned and what people
  // have written, as pictures, straight under the masthead. Loaded apart from
  // the roster so a member who cannot read the roster still gets the board.
  const mayPost = leads || profile?.role === 'dm';
  const [notices, setNotices] = useState<live.Announcement[] | null>(null);
  const [posts, setPosts] = useState<live.FeedPost[] | null>(null);
  const [boardError, setBoardError] = useState('');
  const loadBoard = useCallback(async () => {
    const failures: unknown[] = [];
    const kept = <T,>(p: Promise<T>) => p.catch((cause) => { failures.push(cause); return null; });
    const [n, p] = await Promise.all([kept(live.listAnnouncements()), kept(live.listBlogFeed(12))]);
    setNotices(n);
    setPosts(p);
    // Said only when neither row could load: one row missing is a quieter
    // board, both missing is a broken one.
    setBoardError(n === null && p === null ? message(failures[0]) : '');
  }, []);
  useEffect(() => { void loadBoard(); }, [loadBoard]);
  useKeepUp(KEEP_UP_CHURCH, loadBoard);

  // What somebody may do to a notice from its open sheet: the same two things,
  // for the same people, as the cards here used to carry.
  const change = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (cause) { throw new Error(message(cause)); }
    await loadBoard();
  };
  const manage = (n: live.Announcement): BoardItem['actions'] =>
    leads || n.author_id === profile?.id
      ? [
          { label: 'Take down', run: () => change(() => live.pinAnnouncement(n.id, false)) },
          { label: 'Delete', danger: true, run: () => change(() => live.deleteAnnouncement(n.id)) },
        ]
      : undefined;

  // Only what is up. A notice that was taken down waits in the Announcements
  // folder, where whoever took it down can put it back.
  const noticeItems: BoardItem[] = (notices ?? []).filter((n) => n.is_pinned).map((n) => ({
    key: n.id,
    kind: 'notice',
    title: n.title,
    byline: n.when_text || postedWhen(n.created_at),
    text: n.body,
    icon: n.icon,
    actions: manage(n),
  }));
  const postItems: BoardItem[] = (posts ?? []).map((p) => ({
    key: p.id,
    kind: 'post',
    title: p.title,
    byline: `${p.author_name || 'Someone'} · ${postedWhen(p.created_at)}`,
    text: p.body,
    pinned: p.pinned,
    onOpen: () => void live.recordBlogView(p.id),
  }));

  const guides = members?.filter((m) => m.role === 'dm' && m.is_approved).length;
  const explorers = members?.filter((m) => m.role === 'ds' && m.is_approved).length;
  const waiting = members?.filter((m) => !m.is_approved) ?? [];

  return (
    <div className="space-y-6">
      {/* Masthead. SMALLER ON A PHONE (7 October 2026), so the billboard under
          it is on the first screen: the church's name and its counts stay,
          the sentence about the board waits for a wider screen. */}
      <div
        className="overflow-hidden rounded-2xl p-5 text-white sm:p-6"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50 sm:text-sm">Church home</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{churchName || 'Our church'}</h1>
        <p className="mt-2 hidden max-w-xl text-white/70 sm:block">
          Everything the whole church shares, in one place. Nobody&rsquo;s private
          journey is ever shown here.
        </p>
        {(guides !== undefined || explorers !== undefined) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 sm:mt-4 sm:gap-2">
            {explorers !== undefined && (
              <Chip label={`${explorers} Explorer${explorers === 1 ? '' : 's'} walking`} />
            )}
            {guides !== undefined && (
              <Chip label={`${guides} Guide${guides === 1 ? '' : 's'}`} />
            )}
          </div>
        )}
      </div>

      {error && <Card className="p-4 text-sm text-red-800">{error}</Card>}
      {boardError && <Card className="p-4 text-sm text-red-800">{boardError}</Card>}

      {notices !== null && (
        <HomeBoard
          name="notices"
          heading="📌 Announcements"
          items={noticeItems}
          more={mayPost && (
            <Link href="/church?room=announcements" className="text-sm font-semibold text-room underline underline-offset-2">
              Write one
            </Link>
          )}
          empty={mayPost && (
            <Card className="p-5 text-sm text-gray-600">
              Nothing pinned yet. What you write in Announcements shows here, for the whole church.
            </Card>
          )}
        />
      )}
      {posts !== null && (
        <HomeBoard
          name="posts"
          heading="✍️ From the blog"
          items={postItems}
          more={postItems.length > 0 && (
            <Link href="/church?room=blogs" className="text-sm font-semibold text-room underline underline-offset-2">
              All posts
            </Link>
          )}
        />
      )}

      {/* For a Director to action. Drawn only when there is something to do:
          a permanent "nothing waiting" panel is furniture. */}
      {leads && waiting.length > 0 && (
        <div className="rounded-2xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: `${GOLD}66` }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-navy">🛠️ For you to action</h2>
            <Link href="/admin" className="text-sm font-semibold text-navy underline">
              Approvals →
            </Link>
          </div>
          <p className="text-sm text-gray-600">
            {waiting.length} {waiting.length === 1 ? 'person needs' : 'people need'} a decision.
          </p>
          <div className="mt-2 space-y-1">
            {waiting.slice(0, 4).map((p) => (
              <p key={p.id} className="truncate text-sm font-semibold text-navy">
                {p.full_name || 'Invited member'}
              </p>
            ))}
          </div>
        </div>
      )}

      {between}

    </div>
  );
}
