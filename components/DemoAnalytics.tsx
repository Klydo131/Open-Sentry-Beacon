'use client';

// The tutorial's analytics, and the two views under it.
//
// WHY THIS FILE EXISTS. All of this lived inside app/admin/page.tsx, which was
// fine while the Admin tab was the only place that showed it. The Office room
// shows the same screen, and a page file in the App Router may not export
// anything but the page, so the choice was to duplicate it or to move it. A
// second copy of an analytics screen is two screens that disagree the first
// time one of them is changed.
//
// Nothing here is altered from what the Admin tab already rendered. It is the
// same code in a file both callers can import.

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { useLocale } from '@/lib/i18n';
import { Card } from '@/components/ui';
import { momentum, quietCount, trend } from '@/lib/analytics-trend';
import { MomentumLine, TrendChart } from '@/components/TrendChart';
import { STAGES } from '@/lib/brand';
import type { AnalyticsEvent, Stage } from '@/lib/types';

const EVENT_LABEL: Record<AnalyticsEvent['type'], string> = {
  report_raised: 'Raised a safeguarding report',
  report_resolved: 'Closed a safeguarding report',
  signin: 'Signed in',
  message: 'Sent a message',
  material_share: 'Shared a resource',
  material_open: 'Opened a resource',
  stage_advance: 'Advanced a journey',
  approve: 'Approved a member',
  tutorial_done: 'Finished the tutorial',
  media_upload: 'Added a study note',
  profile_update: 'Updated their profile',
  recommend: 'Recommended a sign-up',
  prayer_request: 'Shared a prayer request',
  lesson_assigned: 'Assigned a lesson',
  lesson_completed: 'Completed a lesson',
  meeting_scheduled: 'Scheduled a meeting',
  invite_sent: 'Invited an Explorer',
  invite_accepted: 'Accepted an invitation',
  member_kicked: 'Removed a member',
  member_disapproved: 'Disapproved a sign-up',
  // The counts are visible to an admin; the note and reminder text never is.
  note_added: 'Wrote a private note',
  blog_written: 'Wrote a blog post',
  followup_added: 'Set a follow-up',
  followup_done: 'Completed a follow-up',
};

export function Analytics() {
  const { db } = useDemo();
  const { t } = useLocale();
  const [scope, setScope] = useState<'local' | 'global'>('local');

  const events = [...db.analytics].sort((a, b) => b.at.localeCompare(a.at));
  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="space-y-5">
      {/* Smaller on a phone: at full size "Local (this device)" broke a word
          a line beside its twin. A computer's is as it was. */}
      <div className="flex gap-2">
        <button
          onClick={() => setScope('local')}
          className="tap flex-1 rounded-xl px-3 text-sm font-semibold leading-tight sm:px-4 sm:text-base"
          style={
            scope === 'local'
              ? { backgroundColor: '#1E2A4A', color: '#fff' }
              : { backgroundColor: '#fff', color: '#1E2A4A' }
          }
        >
          🔒 {t('localScope')}
        </button>
        <button
          onClick={() => setScope('global')}
          className="tap flex-1 rounded-xl px-3 text-sm font-semibold leading-tight sm:px-4 sm:text-base"
          style={
            scope === 'global'
              ? { backgroundColor: '#1E2A4A', color: '#fff' }
              : { backgroundColor: '#fff', color: '#1E2A4A' }
          }
        >
          🌐 {t('globalScope')}
        </button>
      </div>

      {scope === 'local' ? (
        <LocalAnalytics events={events} nameOf={nameOf} />
      ) : (
        <GlobalAnalytics events={events} />
      )}
    </div>
  );
}

function LocalAnalytics({
  events,
  nameOf,
}: {
  events: AnalyticsEvent[];
  nameOf: (id: string) => string;
}) {
  const { db } = useDemo();
  const { t } = useLocale();
  // Per-person activity counts (detailed — names shown, stays on device).
  const byUser = new Map<string, number>();
  for (const e of events) byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + 1);
  const ranked = [...byUser.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
        🔒 <strong>Local data.</strong> Detailed, names shown. This stays on this
        device and is the church’s own to analyze.
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('mostActive')}</h3>
        <div className="space-y-2">
          {ranked.slice(0, 6).map(([id, n]) => (
            <div key={id} className="flex items-center gap-3">
              <span className="w-40 truncate font-semibold text-navy">
                {nameOf(id)}
              </span>
              <div className="h-6 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-6 rounded-full"
                  style={{
                    width: `${(n / (ranked[0]?.[1] || 1)) * 100}%`,
                    backgroundColor: '#2F80ED',
                  }}
                />
              </div>
              <span className="w-6 text-right font-bold text-navy">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('recentActivity')}</h3>
        <ul className="space-y-2">
          {events.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate font-semibold text-navy">
                {nameOf(e.user_id)}
              </span>
              <span className="flex-1 text-gray-600">{EVENT_LABEL[e.type]}</span>
              <span className="text-gray-500">
                {new Date(e.at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-lg font-bold text-navy">Explorer study uploads</h3>
        <p className="mb-3 text-sm text-gray-500">
          What Explorers are adding to their own shelves.
        </p>
        {db.seeker_media.length === 0 ? (
          <p className="text-gray-500">No explorer uploads yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...db.seeker_media]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 10)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate font-semibold text-navy">
                    {nameOf(m.ds_id)}
                  </span>
                  <span className="flex-1 truncate text-gray-600">{m.title}</span>
                  <span className="text-gray-500">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function GlobalAnalytics({ events }: { events: AnalyticsEvent[] }) {
  const { db } = useDemo();
  const { t } = useLocale();

  // Anonymous rollups only — counts and trends, never a name.
  const byType = new Map<AnalyticsEvent['type'], number>();
  for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(1, ...typeRows.map((r) => r[1]));

  const activeUsers = new Set(events.map((e) => e.user_id)).size;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7 = events.filter((e) => new Date(e.at).getTime() >= weekAgo).length;

  // Over time, which is what this screen claimed to show and did not.
  //
  // Every figure above is a total since the beginning, and a total that can only
  // go up cannot answer the question a church council actually asks. Nobody has
  // ever wanted to know how many messages have ever been sent; they want to know
  // whether there is more happening than there was.
  const weekly = trend(events, { grain: 'week', count: 8 });
  const pace = momentum(weekly);
  // Stage advances are the one number that is about people rather than usage:
  // somebody moved forward in their journey this week.
  const advances = trend(events, { grain: 'week', count: 8, types: ['stage_advance'] });
  const advancePace = momentum(advances);
  const quiet = quietCount(weekly);


  const active = db.pairings.filter((p) => p.status === 'active');
  const stageCounts = STAGES.map((s) => ({
    ...s,
    n: active.filter((p) => p.journey_stage === s.key).length,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-200">
        🌐 <strong>Global data.</strong> Anonymous totals and trends. No names,
        no profiles. Safe to sync to a shared backend for wider analysis.
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total events" value={events.length} />
        <Stat label="Active people" value={activeUsers} />
        <Stat label="Last 7 days" value={last7} />
      </div>

      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">Activity over time</h3>
        <p className="mb-3 text-sm text-gray-500">
          Eight weeks. The last bar is this week, still going.
        </p>
        <TrendChart points={weekly} color="#2F80ED" unit="Actions" />
        <div className="mt-3 space-y-1">
          <MomentumLine {...pace} noun="actions" />
          {quiet > 0 && (
            <p className="text-sm text-gray-500">
              {quiet === 1 ? 'One week' : `${quiet} weeks`} in this stretch had no
              activity at all.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">People moving forward</h3>
        <p className="mb-3 text-sm text-gray-500">
          How often somebody was moved on a stage in their journey. The one number
          here that is about people rather than usage.
        </p>
        <TrendChart points={advances} color="#7FB03A" unit="Steps forward" />
        <div className="mt-3">
          <MomentumLine {...advancePace} noun="people moved forward" />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('actionsByType')}</h3>
        <div className="space-y-2">
          {typeRows.map(([type, n]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="w-40 text-sm font-semibold text-navy">
                {EVENT_LABEL[type]}
              </span>
              <div className="h-6 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-6 rounded-full"
                  style={{ width: `${(n / maxType) * 100}%`, backgroundColor: '#7FB03A' }}
                />
              </div>
              <span className="w-6 text-right font-bold text-navy">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('seekersByStage')}</h3>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {stageCounts.map((s) => (
            <div key={s.key} className="flex flex-1 flex-col items-center justify-end">
              <span className="text-sm font-bold text-navy">{s.n}</span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(s.n / Math.max(1, ...stageCounts.map((x) => x.n))) * 90}px`,
                  backgroundColor: s.color,
                  minHeight: 4,
                }}
              />
              <span className="mt-1 text-center text-xs text-gray-500">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <BoardView
        guides={db.profiles.filter((p) => p.role === 'dm' && p.is_approved).length}
        walkedWith={active.length}
        actionsThisWeek={pace.latest}
        movedForwardThisWeek={advancePace.latest}
      />
    </div>
  );
}

function BoardView({
  guides,
  walkedWith,
  actionsThisWeek,
  movedForwardThisWeek,
}: {
  guides: number;
  walkedWith: number;
  actionsThisWeek: number;
  movedForwardThisWeek: number;
}) {
  return (
    <Card className="p-5" data-panel="board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-navy">For the church board</h3>
          <p className="text-sm text-gray-500">
            The four numbers to read out. Nothing here names anybody.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print tap-sm shrink-0 rounded-xl bg-gray-100 px-4 text-sm font-bold text-navy transition hover:bg-gray-200"
        >
          🖨️ Print
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        {[
          ['Guides', guides],
          ['People being walked with', walkedWith],
          ['Actions this week', actionsThisWeek],
          ['Moved forward this week', movedForwardThisWeek],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-gray-50 p-3">
            <dd className="text-2xl font-extrabold text-navy">{value}</dd>
            <dt className="mt-0.5 text-xs text-gray-500">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2 text-sm text-gray-600">
        <p>
          <strong className="text-navy">What the board is not shown.</strong> No
          names against these numbers, no messages, no prayer requests. If you
          want to know how one particular person is doing, ask the Guide
          walking with them. The app will not show you.
        </p>
        <p>
          <strong className="text-navy">Where the board&rsquo;s approval
          happens.</strong> In the board meeting, as it does today. The board has
          no account here and does not need one. Once the board decides, an admin
          records it by approving that person on the Approvals tab, and the app
          remembers who did it and when.
        </p>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-3xl font-extrabold text-navy">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </Card>
  );
}
