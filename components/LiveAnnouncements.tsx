'use client';

// What the church has pinned, on its own.
//
// SPLIT OUT OF LiveBillboard, which is the second time that file has given a
// piece away and for the same reason both times (see LiveWriteNotice). The
// billboard is the church screen: a masthead with the church's name and its
// counts, and the notices underneath. A Guide opening their own dashboard does
// not want the masthead — they want the notices, and until now the only way to
// have them was to bring the whole church screen along.
//
// WHERE IT IS NOW, which was the ask:
//   Explorer  after the Guide's name and before the conversation. Their screen
//             is a relationship first; a notice from the church sits under the
//             person and above the talking.
//   Guide     the first thing on the dashboard.
//   Director  the first thing under the room tabs. The tabs stay put: see the
//   and ED    note in AdminPage on why nothing is ever allowed above them.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_NOTICES } from '@/lib/live/keep-up';

export function LiveAnnouncements({
  /**
   * Draw nothing at all when there is nothing pinned.
   *
   * TRUE ON A HOME SCREEN, false on the church screen. "Nothing pinned at the
   * moment" is a useful answer on the page somebody opened to read notices, and
   * it is furniture on a dashboard somebody opened to do something else. The
   * prayer panel learned the same lesson and carries the same switch.
   */
  hideWhenEmpty = false,
}: { hideWhenEmpty?: boolean }) {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  const mayPost = leads || profile?.role === 'dm';

  const [notices, setNotices] = useState<live.Announcement[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setNotices(await live.listAnnouncements()); setError(''); }
    catch (cause) { setNotices([]); setError(humanError(cause, 'That did not work.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_NOTICES, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(humanError(cause, 'That did not work.')); }
    finally { setBusy(false); }
  };

  // A taken-down notice stays visible to whoever can put it back up, which is
  // leadership and its own author.
  const shown = (notices ?? []).filter(
    (n) => n.is_pinned || leads || n.author_id === profile?.id,
  );

  // Still loading, or nothing to say on a screen that should not talk about it.
  if (hideWhenEmpty && (notices === null || shown.length === 0) && !error) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-room">📌 Announcements</h2>
        {/* WRITING IS IN HOME'S ANNOUNCEMENTS FOLDER. This is what the church
            has said; a composer on top of it makes a reader's page into a
            writer's page for the three roles who can write. */}
        {mayPost && (
          <Link href="/church?room=announcements" className="text-sm font-semibold text-room underline underline-offset-2">
            Write one →
          </Link>
        )}
      </div>

      {error && (
        <Card className="p-4 text-sm text-red-800">{error}</Card>
      )}

      {!error && shown.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          {mayPost
            ? 'No notices yet. Write the first one in Announcements, above.'
            : 'Nothing pinned at the moment.'}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {shown.map((n) => (
            <Card key={n.id} className={`p-4 ${n.is_pinned ? '' : 'opacity-60'}`}>
              <span className="text-2xl" aria-hidden>{n.icon}</span>
              <p className="mt-1 font-bold text-navy">{n.title}</p>
              {n.body && <p className="text-sm text-gray-600">{n.body}</p>}
              {n.when_text && (
                <p className="mt-2 text-xs font-semibold text-gray-500">{n.when_text}</p>
              )}
              {(leads || n.author_id === profile?.id) && (
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(() => live.pinAnnouncement(n.id, !n.is_pinned))}
                    className="text-xs font-semibold text-navy underline"
                  >
                    {n.is_pinned ? 'Take down' : 'Put back up'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(() => live.deleteAnnouncement(n.id))}
                    className="text-xs font-semibold text-red-700 underline"
                  >
                    Delete
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
