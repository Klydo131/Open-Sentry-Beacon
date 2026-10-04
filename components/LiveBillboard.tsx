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
import { useKeepUp, KEEP_UP_ROSTER } from '@/lib/live/keep-up';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { NAVY, GOLD } from '@/lib/brand';
import { humanError } from '@/lib/live/errors';
import { LiveAnnouncements } from '@/components/LiveAnnouncements';

function message(cause: unknown): string {
  return humanError(cause, 'That did not work.');
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
      {label}
    </span>
  );
}

export function LiveBillboard({ churchName, between }: {
  churchName?: string | null;
  /**
   * Rendered between the masthead and the notices.
   *
   * The church home reads masthead, then Community Blogs, then Announcements,
   * and the blogs are not this component's business. Passing them in beats
   * either importing them here or splitting the billboard into two exports
   * that a caller has to remember to use in the right order.
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


  const guides = members?.filter((m) => m.role === 'dm' && m.is_approved).length;
  const explorers = members?.filter((m) => m.role === 'ds' && m.is_approved).length;
  const waiting = members?.filter((m) => !m.is_approved) ?? [];

  return (
    <div className="space-y-6">
      {/* Masthead */}
      <div
        className="overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        data-church-masthead
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
      >
        <p className="text-sm font-semibold uppercase tracking-wider text-white/50">Church home</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{churchName || 'Our church'}</h1>
        <p className="mt-2 max-w-xl text-white/70">
          Everything the whole church shares, in one place. Nobody&rsquo;s private
          journey is ever shown here.
        </p>
        {(guides !== undefined || explorers !== undefined) && (
          <div className="mt-5 flex flex-wrap gap-2">
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

      {/* THE NOTICES MOVED TO components/LiveAnnouncements.tsx, so the same
          list can sit on a home screen without dragging this masthead along
          with it. Second time this file has given a piece away; see
          LiveWriteNotice for the first. */}
      <LiveAnnouncements />

    </div>
  );
}
