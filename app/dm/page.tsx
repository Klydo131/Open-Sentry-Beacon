'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { AppShell } from '@/components/AppShell';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui';
import { STAGES, stageInfo, trackColor } from '@/lib/brand';
import { emitQuest } from '@/lib/quest';
import {
  seekerEngagement,
  seekerUrgency,
  activeLabel,
  todayKey,
} from '@/lib/engagement';
import { useIsLive } from '@/lib/tutorial';
import { prayerAuthor } from '@/lib/types';
import { BlogDesk } from '@/components/Blog';
import { LiveGuidePage } from '@/components/LiveCorePages';

// A missionary's dashboard: what needs doing today, how the flock is spread
// across the journey, and then the seekers themselves — ordered by who needs
// attention rather than by whoever happened to be paired first.
//
// RLS guarantees this can never contain another missionary's seeker; the demo
// store mirrors that by filtering on dm_id.
export default function DmSeekers() {
  if (useIsLive()) return <LiveGuidePage />;
  return (
    <AppShell allow={['dm']}>
      <Dashboard />
    </AppShell>
  );
}

type Filter = 'all' | 'overdue' | 'unread' | 'quiet';

function Dashboard() {
  const { db, currentUser, kickMember } = useDemo();
  const me = currentUser!;
  const [filter, setFilter] = useState<Filter>('all');

  const today = todayKey();

  // FOUR FOLDERS, matching the live Guide's home. What needs attention, the
  // roster and the filter are one errand and stay together; the week ahead and
  // the writing desk are two others that were simply further down the page.
  const rooms: Room[] = [
    { id: 'people', label: '🤝 My Explorers' },
    { id: 'week', label: '📅 Next 7 days' },
    { id: 'write', label: '✍️ Write' },
  ];
  const [room, chooseRoom] = useRoom(rooms, 'beacon:demo-guide-room');

  // One pass over the missionary's pairings, decorated with everything the
  // dashboard and the list both need.
  const rows = useMemo(() => {
    return db.pairings
      .filter((p) => p.dm_id === me.id && p.status === 'active')
      .map((p) => {
        const ds = db.profiles.find((x) => x.id === p.ds_id);
        return {
          pairing: p,
          ds,
          urgency: seekerUrgency(db, p, me.id),
          engagement: seekerEngagement(db, p.ds_id, p.id),
          lastMessage: db.messages
            .filter((m) => m.pairing_id === p.id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
        };
      })
      // A kicked seeker leaves the pairing archived, but guard anyway rather
      // than assert — this list used to use a non-null assertion and would
      // have thrown instead of degrading.
      .filter((r) => r.ds !== undefined)
      .sort((a, b) => b.urgency.score - a.urgency.score);
  }, [db, me.id]);

  const totals = useMemo(
    () => ({
      overdue: rows.reduce((n, r) => n + r.urgency.overdue, 0),
      dueToday: rows.reduce((n, r) => n + r.urgency.dueToday, 0),
      unread: rows.filter((r) => r.urgency.unread > 0).length,
      quiet: rows.filter((r) => r.urgency.quiet).length,
    }),
    [rows],
  );

  // Meetings in the next seven days, across every seeker.
  const upcoming = useMemo(() => {
    const ids = new Set(rows.map((r) => r.pairing.id));
    const now = Date.now();
    return db.meetings
      .filter(
        (m) =>
          ids.has(m.pairing_id) &&
          m.status === 'scheduled' &&
          new Date(m.when).getTime() > now - 60 * 60 * 1000 &&
          new Date(m.when).getTime() < now + 7 * 86_400_000,
      )
      .sort((a, b) => a.when.localeCompare(b.when));
  }, [db.meetings, rows]);

  const stageSpread = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        count: rows.filter((r) => r.pairing.journey_stage === s.key).length,
      })),
    [rows],
  );

  const attention = totals.overdue + totals.dueToday + totals.unread + totals.quiet;

  const visible = rows.filter((r) => {
    if (filter === 'overdue') return r.urgency.overdue > 0 || r.urgency.dueToday > 0;
    if (filter === 'unread') return r.urgency.unread > 0;
    if (filter === 'quiet') return r.urgency.quiet;
    return true;
  });

  if (rows.length === 0) {
    return (
      <div>
        <h1 className="mb-1 text-3xl font-extrabold text-navy">My Explorers</h1>
        <p className="mb-5 text-gray-500">
          The people you are walking with.
        </p>
        <EmptyState
          title="No explorers yet"
          hint="A Director will pair an Explorer with you."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-navy">
          {greeting()}, {me.full_name.split(' ')[0]}
        </h1>
        <p className="text-gray-500">
          You are walking with {rows.length}{' '}
          {rows.length === 1 ? 'person' : 'people'}.
        </p>
      </div>

      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {/* Needs attention, the reason to open the app at all. It is in the
          folder that opens, because a Guide who has to pick a folder before
          being told somebody has gone quiet has been told too late. */}
      {room === 'people' && <Card className="p-5">
        <h2 className="mb-3 text-xl font-bold text-navy">
          {attention === 0 ? 'All caught up 🎉' : 'Needs your attention'}
        </h2>
        {attention === 0 ? (
          <p className="text-gray-500">
            Nothing overdue, nothing unread, nobody has gone quiet. Good week.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Chip
              on={filter === 'overdue'}
              onClick={() =>
                setFilter(filter === 'overdue' ? 'all' : 'overdue')
              }
              count={totals.overdue + totals.dueToday}
              label={totals.overdue > 0 ? 'overdue' : 'due today'}
              color="#DC2626"
              hidden={totals.overdue + totals.dueToday === 0}
            />
            <Chip
              on={filter === 'unread'}
              onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
              count={totals.unread}
              label="unread"
              color="#2F80ED"
              hidden={totals.unread === 0}
            />
            <Chip
              on={filter === 'quiet'}
              onClick={() => setFilter(filter === 'quiet' ? 'all' : 'quiet')}
              count={totals.quiet}
              label="gone quiet"
              color="#B45309"
              hidden={totals.quiet === 0}
            />
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-sm font-semibold text-gray-500 underline"
              >
                Show all
              </button>
            )}
          </div>
        )}
      </Card>}

      {/* Where everyone sits on the journey */}
      {room === 'people' && <Card className="p-5">
        {/* "Your flock" was a shepherd's word for the church's people. It reads
            as a group somebody owns, and this list is the opposite of that:
            individuals, one at a time, each on their own journey. */}
        <h2 className="mb-3 text-xl font-bold text-navy">Your Explorers</h2>
        {/* Six across only works when there is room for six labels. On a
            phone the columns ended up sized by their words — uneven boxes and
            "CreateConnectCareCall" run together — so it wraps to two rows of
            three instead and every label stays whole. */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-1">
          {stageSpread.map((s) => (
            <div key={s.key} className="min-w-0 text-center">
              <div
                className="grid h-12 place-items-center rounded-xl text-lg font-extrabold"
                style={{
                  backgroundColor: s.count > 0 ? s.color : '#E5E7EB',
                  color: s.count > 0 ? '#fff' : '#9CA3AF',
                }}
              >
                {s.count}
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-gray-500">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </Card>}

      {/* The week ahead */}
      {room === 'week' && upcoming.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-xl font-bold text-navy">📅 Next 7 days</h2>
          <div className="space-y-2">
            {upcoming.map((m) => {
              const row = rows.find((r) => r.pairing.id === m.pairing_id);
              const d = new Date(m.when);
              return (
                <Link
                  key={m.id}
                  href={`/dm/${m.pairing_id}`}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 hover:bg-gray-100"
                >
                  <span className="text-2xl" aria-hidden>
                    {m.mode === 'in_person' ? '📍' : '📞'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{m.title}</p>
                    {/* Who it is with belongs on its own line: appended to the
                        title it was the first thing the truncation ate, which
                        is the one detail you cannot guess from the rest. */}
                    <p className="truncate text-sm text-gray-500">
                      {row?.ds ? `${row.ds.full_name.split(' ')[0]} · ` : ''}
                      {d.toLocaleString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* The seekers themselves, most urgent first */}
      {room === 'people' && (
      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">
          {filter === 'all'
            ? 'Everyone'
            : `Showing ${visible.length} of ${rows.length}`}
        </h2>
        {visible.length === 0 ? (
          <EmptyState title="Nobody matches that filter" />
        ) : (
          <div className="space-y-3">
            {visible.map(({ pairing: p, ds, urgency, engagement, lastMessage }) => {
              const info = stageInfo(p.journey_stage);
              const openFollowUps = db.follow_ups.filter(
                (f) => f.pairing_id === p.id && f.owner_id === me.id && !f.done_at,
              );
              // A PRAYER REQUEST NOBODY SEES IS THE WORST THING THIS APP CAN DO.
              //
              // Asking for prayer is the most exposed thing an Explorer does
              // here, and it was completely invisible from this screen: the
              // request arrived, sat on the Care tab of that one person's page,
              // and a Guide had to open each Explorer in turn and click through
              // to a third tab to find out anybody had asked. Somebody wrote
              // "please pray for my mother" and, as far as they could tell,
              // nothing happened.
              //
              // `open` is the state nobody has responded to yet — once a Guide
              // presses "I'm praying" it stops nagging, which is what makes the
              // badge worth reading rather than permanent furniture.
              // The Explorer's own requests: what the Guide asked THEM is
              // waiting on the Explorer, not on the Guide.
              const unprayed = db.prayer_requests.filter(
                (r) => r.ds_id === ds!.id && prayerAuthor(r) === ds!.id && r.status === 'open',
              );
              return (
                <Card key={p.id}>
                  <Link
                    href={`/dm/${p.id}`}
                    data-quest="seeker-card"
                    onClick={() => emitQuest('beacon:open-seeker')}
                    className="tap flex items-center gap-4 px-4 py-3"
                  >
                    <Avatar name={ds!.full_name} photo={ds!.photo} avatar={ds!.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-lg font-bold text-navy">
                          {ds!.full_name}
                        </p>
                        {urgency.unread > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                            {urgency.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-gray-500">
                        {lastMessage ? lastMessage.body : 'No messages yet'}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs font-semibold">
                        {urgency.overdue > 0 && (
                          <span style={{ color: '#DC2626' }}>
                            ⚠️ {urgency.overdue} overdue
                          </span>
                        )}
                        {urgency.overdue === 0 && urgency.dueToday > 0 && (
                          <span style={{ color: '#B45309' }}>
                            {urgency.dueToday} due today
                          </span>
                        )}
                        {openFollowUps.length > 0 &&
                          urgency.overdue === 0 &&
                          urgency.dueToday === 0 && (
                            <span className="text-gray-400">
                              {openFollowUps.length} follow-up
                              {openFollowUps.length === 1 ? '' : 's'}
                            </span>
                          )}
                        {/* Ahead of the follow-up counts in visual weight,
                            because it is a person asking for something rather
                            than a task the Guide set themselves. */}
                        {unprayed.length > 0 && (
                          <span className="font-semibold" style={{ color: '#7C3AED' }}>
                            🙏 asked for prayer
                            {unprayed.length > 1 ? ` ×${unprayed.length}` : ''}
                          </span>
                        )}
                        <span
                          style={{ color: engagement.quiet ? '#B8860B' : '#9AA3B2' }}
                        >
                          {engagement.quiet
                            ? '⚠️ Needs check-in'
                            : activeLabel(engagement.daysSince)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge color={info.color}>{info.label}</Badge>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: trackColor(p.track) }}
                      >
                        {p.track === 'digital' ? 'Digital' : 'Traditional'}
                      </span>
                    </div>
                  </Link>
                  <div className="flex justify-end px-4 pb-3">
                    {/* THE SHARED DANGER BUTTON, not a hand-rolled red one.
                        This was a raw <button> with red classes and small
                        padding, and it still rendered at 56px — every button
                        in the app has a 56px floor in globals.css, so padding
                        cannot make one smaller. It was the full height of an
                        ordinary control while looking like it was not. */}
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${ds!.full_name}? Their pairing with you will be archived, and your private notes about them are deleted.`,
                          )
                        )
                          kickMember(ds!.id);
                      }}
                    >
                      Remove Explorer
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>)}

      {/* Its own folder now. Writing is the thing you do once everyone is
          answered, and it was the bottom of a page nobody reached. */}
      {room === 'write' && <BlogDesk userId={me.id} />}
    </div>
  );
}

function Chip({
  on,
  onClick,
  count,
  label,
  color,
  hidden,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  label: string;
  color: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="tap-sm rounded-xl px-3 text-sm font-semibold transition sm:px-4 sm:text-base"
      style={
        on
          ? { backgroundColor: color, color: '#fff' }
          : { backgroundColor: '#F3F4F6', color }
      }
    >
      {count} {label}
    </button>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
