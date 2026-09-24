'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { AppShell } from '@/components/AppShell';
import { Chat } from '@/components/Chat';
import { JourneyPath } from '@/components/JourneyPath';
import { SeekerNotes } from '@/components/SeekerNotes';
import { FollowUps } from '@/components/FollowUps';
import { Avatar, Badge, Button, Card, Tabs } from '@/components/ui';
import { nextStage, stageInfo, trackColor } from '@/lib/brand';
import { emitQuest } from '@/lib/quest';
import { lessonsForStage, offerableSeries, seriesProgress } from '@/lib/lessons';
import {
  seekerEngagement,
  seekerUrgency,
  activeLabel,
  activeShort,
} from '@/lib/engagement';
import { Meetings } from '@/components/Meetings';
import { useIsLive } from '@/lib/tutorial';
import { ReportDialog } from '@/components/ReportDialog';
import { prayerAuthor } from '@/lib/types';
import { LiveConversationPage } from '@/components/LiveCorePages';

type TabKey = 'talk' | 'journey' | 'care' | 'resources';

export default function SeekerDetail() {
  if (useIsLive()) return <LiveConversationPage />;
  return (
    <AppShell allow={['dm']}>
      <Detail />
    </AppShell>
  );
}

function Detail() {
  const {
    db,
    currentUser,
    advanceStage,
    shareMaterial,
    setPrayerStatus,
    askForPrayer,
    withdrawPrayerRequest,
    reportPrayerRequest,
    assignLesson,
    startSeries,
  } = useDemo();
  const params = useParams();
  const router = useRouter();
  const me = currentUser!;
  const pairingId = String(params.id);
  const available = offerableSeries(db.lesson_series);
  const [tab, setTab] = useState<TabKey>('talk');
  const [askText, setAskText] = useState('');
  const [reportingPrayer, setReportingPrayer] = useState('');

  const pairing = db.pairings.find((p) => p.id === pairingId);

  // Ownership check — a DM can only open their own pairing.
  if (!pairing || pairing.dm_id !== me.id) {
    return (
      <div>
        <p className="text-lg">This explorer is not on your list.</p>
        <Button className="mt-4" onClick={() => router.replace('/dm')}>
          Back to my Explorers
        </Button>
      </div>
    );
  }

  const ds = db.profiles.find((x) => x.id === pairing.ds_id)!;
  const info = stageInfo(pairing.journey_stage);
  const next = nextStage(pairing.journey_stage);
  const eng = seekerEngagement(db, ds.id, pairingId);
  const urg = seekerUrgency(db, pairing, me.id);
  const first = ds.full_name.split(' ')[0];

  const sharedIds = new Set(
    db.material_shares
      .filter((s) => s.pairing_id === pairingId)
      .map((s) => s.material_id),
  );
  const library = db.materials.filter((m) => m.is_published);
  const history = db.journey_events
    .filter((e) => e.pairing_id === pairingId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Their own requests, and what this Guide has asked them to pray for: both
  // live with this Explorer, and are told apart by who wrote them.
  const prayers = db.prayer_requests
    .filter((r) => r.ds_id === ds.id && prayerAuthor(r) === ds.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const myAsks = db.prayer_requests
    .filter((r) => r.ds_id === ds.id && prayerAuthor(r) === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shelf = db.seeker_media
    .filter((m) => m.ds_id === ds.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const assigns = db.lesson_assignments.filter((a) => a.pairing_id === pairingId);
  const byLesson = new Map(assigns.map((a) => [a.lesson_id, a]));
  const openFollowUps = db.follow_ups.filter(
    (f) => f.pairing_id === pairingId && f.owner_id === me.id && !f.done_at,
  ).length;

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.replace('/dm')}
        className="text-navy underline"
      >
        ← My Explorers
      </button>

      {/* Who they are — stays put while the tabs change beneath it */}
      <Card className="p-5">
        {/* Name, place and stage all fought for the same row on a phone: the
            name broke across two lines and "Cavite · Call center" across
            three. The stage and track now sit under the name, where they wrap
            on their own terms. */}
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar name={ds.full_name} size={56} photo={ds.photo} avatar={ds.avatar} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold text-navy sm:text-2xl">
              {ds.full_name}
            </h1>
            <p className="truncate text-sm text-gray-500 sm:text-base">
              {[ds.city_of_residence, ds.work_industry].filter(Boolean).join(' · ') ||
                'No location or work set'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge color={info.color}>{info.label}</Badge>
              <span
                className="text-sm font-semibold"
                style={{ color: trackColor(pairing.track) }}
              >
                {pairing.track === 'digital' ? 'Digital track' : 'Traditional track'}
              </span>
            </div>
          </div>
        </div>

        {/* Contact and personal details — on the profile all along, but the
            room never showed them, so a missionary had to guess how to reach
            someone or when their birthday was. */}
        {(ds.preferred_contact || ds.birthday || ds.gender || ds.status) && (
          <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-black/5 pt-4 text-sm sm:grid-cols-2">
            {ds.preferred_contact && (
              <Detail_ label="Best way to reach them" value={ds.preferred_contact} />
            )}
            {ds.birthday && (
              <Detail_
                label="Birthday"
                value={new Date(`${ds.birthday}T00:00:00`).toLocaleDateString([], {
                  month: 'long',
                  day: 'numeric',
                })}
              />
            )}
            {ds.status && <Detail_ label="Status" value={ds.status} />}
            {ds.gender && <Detail_ label="Gender" value={ds.gender} />}
          </dl>
        )}

        {ds.topics_of_interest.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ds.topics_of_interest.map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Engagement. These were one wrapping line of "<value> <label>" pairs,
            which on a phone ran together into "Active today last active 2
            messages 1 resources opened". Labelled tiles again. */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-black/5 pt-4 sm:grid-cols-4">
          <Stat label="Last active" value={activeShort(eng.daysSince)} />
          <Stat label="Messages" value={String(eng.messagesSent)} />
          <Stat label="Resources" value={String(eng.materialsOpened)} />
          <Stat label="Lessons" value={String(eng.lessonsDone)} />
        </div>

        {eng.quiet && (
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-800 ring-1 ring-amber-200">
            💛 {first}{' '}
            {eng.daysSince === null
              ? 'hasn’t been active yet'
              : `has been quiet for ${eng.daysSince} days`}{' '}
            A message might help.
          </div>
        )}
      </Card>

      <Tabs<TabKey>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'talk', label: 'Talk', icon: '💬', badge: urg.unread },
          { key: 'journey', label: 'Journey', icon: '🎯' },
          { key: 'care', label: 'Care', icon: '🤲', badge: openFollowUps },
          { key: 'resources', label: 'Resources', icon: '📚' },
        ]}
      />

      {/* ---------------------------------------------------------- Talk ---- */}
      {tab === 'talk' && (
        <div className="space-y-5">
          <Chat pairingId={pairingId} />
          <Meetings pairingId={pairingId} />
        </div>
      )}

      {/* ------------------------------------------------------- Journey ---- */}
      {tab === 'journey' && (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-xl font-bold text-navy">Journey</h2>
            <JourneyPath current={pairing.journey_stage} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {next ? (
                <span data-quest="advance">
                  <Button
                    variant="gold"
                    onClick={() => {
                      advanceStage(pairingId);
                      emitQuest('beacon:advance');
                    }}
                  >
                    Advance to {stageInfo(next).label} →
                  </Button>
                </span>
              ) : (
                <Badge color="#7FB03A">Commissioned 🎉</Badge>
              )}
              <span className="text-sm text-gray-500">
                Advancing logs the change and notifies {first}.
              </span>
            </div>
            {history.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-gray-500">
                {history.map((e) => (
                  <li key={e.id}>
                    {e.from_stage ? `${stageInfo(e.from_stage).label} → ` : ''}
                    <span className="font-semibold text-navy">
                      {stageInfo(e.to_stage).label}
                    </span>{' '}
                    · {new Date(e.created_at).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* A whole course, in one tap.
              Assigning lessons one at a time is still here and still right for
              a one-off. But when somebody says "I want to understand prayer",
              the answer should not be four separate taps a month apart with the
              missionary keeping the running order in their head. The library
              builds the course; this pushes it; the seeker walks it. */}
          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">📚 Lesson series</h2>
            <p className="mb-4 text-sm text-gray-500">
              A course on one area of interest. {first} walks it in order, and
              you both see how far along they are.
            </p>
            {available.length === 0 ? (
              <p className="text-gray-400">
                No series on the shelf yet. An admin builds them under Admin ›
                Materials.
              </p>
            ) : (
              <div className="space-y-2">
                {available.map((sr) => {
                  const prog = seriesProgress(sr, db.lesson_assignments, pairingId);
                  const started = prog.steps.some((st) => st.assignment);
                  return (
                    <div key={sr.id} className="rounded-xl bg-gray-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-navy">{sr.title}</p>
                          <p className="text-sm font-semibold" style={{ color: '#B08419' }}>
                            {sr.topic} · {sr.lesson_ids.length} lessons
                          </p>
                        </div>
                        {started ? (
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                              prog.finished
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {prog.finished ? '✓ Finished' : `${prog.done} of ${prog.total}`}
                          </span>
                        ) : (
                          <Button
                            variant="gold"
                            className="shrink-0 px-4 text-base"
                            onClick={() => startSeries(pairingId, sr.id)}
                          >
                            Start this series
                          </Button>
                        )}
                      </div>
                      {started && !prog.finished && prog.next && (
                        <p className="mt-2 text-sm text-gray-500">
                          Up next: <span className="font-semibold">{prog.next.title}</span>
                        </p>
                      )}
                      {started && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%`,
                              backgroundColor: prog.finished ? '#16A34A' : '#7FB03A',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">
              📖 Single lessons · {stageInfo(pairing.journey_stage).label}
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              Assign short studies for this step. {first} completes them at their
              own pace.
            </p>
            <div className="space-y-2">
              {lessonsForStage(pairing.journey_stage).map((l) => {
                const a = byLesson.get(l.id);
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                  >
                    <span className="text-2xl" aria-hidden>📖</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{l.title}</p>
                      <p className="truncate text-sm text-gray-500">
                        {l.description}
                      </p>
                    </div>
                    {a ? (
                      a.status === 'completed' ? (
                        <span className="text-sm font-semibold text-green-600">
                          ✓ Completed
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-blue-600">
                          Assigned
                        </span>
                      )
                    ) : (
                      <Button
                        variant="ghost"
                        className="px-4 text-base"
                        onClick={() => assignLesson(pairingId, l.id)}
                      >
                        Assign
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------- Care ---- */}
      {tab === 'care' && (
        <div className="space-y-5">
          <FollowUps pairingId={pairingId} />
          <SeekerNotes pairingId={pairingId} seekerName={first} />

          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">
              🙏 {first}’s prayer requests
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              Pray with them, and let them know they’re being held.
            </p>
            {prayers.length === 0 ? (
              <p className="text-gray-400">No requests yet.</p>
            ) : (
              <div className="space-y-2">
                {prayers.map((r) => (
                  <div key={r.id} data-prayer-request={r.id} className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-navy">{r.body}</p>
                    {/* No "Mark answered": whether a prayer was answered is
                        the asker's to say, and the live database refuses it
                        from anybody else. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.status !== 'praying' && r.status !== 'answered' && (
                        <Button
                          variant="ghost"
                          className="px-4 text-base"
                          onClick={() => setPrayerStatus(r.id, 'praying')}
                        >
                          🙏 I’m praying
                        </Button>
                      )}
                      {r.status === 'praying' && (
                        <span className="text-sm font-semibold text-blue-600">
                          Being prayed for
                        </span>
                      )}
                      {r.status === 'answered' && (
                        <span className="text-sm font-semibold text-green-600">
                          Answered 🙌
                        </span>
                      )}
                      {r.share_with_board && (
                        <span className="text-sm text-gray-400">
                          · on the church prayer wall
                        </span>
                      )}
                      {reportingPrayer !== r.id && (
                        <button
                          type="button"
                          onClick={() => setReportingPrayer(r.id)}
                          className="ml-auto px-2 text-sm text-gray-400 underline underline-offset-2 hover:text-red-600"
                        >
                          Report
                        </button>
                      )}
                    </div>
                    {reportingPrayer === r.id && (
                      <div className="mt-3">
                        <ReportDialog
                          subjectName={ds.full_name}
                          onCancel={() => setReportingPrayer('')}
                          onSubmit={(reason, detail) => reportPrayerRequest(r.id, reason, detail)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* PRAYER RUNS BOTH WAYS. The Guide asks too, and only this one
                person sees it; they can say they are praying, and the Guide
                is told. */}
            <div className="mt-5 rounded-xl bg-teal-50/60 p-4 ring-1 ring-teal-700/10" aria-label="Ask them to pray for you">
              <p className="font-bold text-navy">Ask {first} to pray for you</p>
              <p className="text-sm text-gray-600">Only {first} sees it. They can tell you they are praying.</p>
              <textarea
                id={`ask-prayer-${ds.id}`}
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="What would you like prayer for?"
                aria-label={`What would you like ${first} to pray for?`}
                className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
              />
              <Button
                className="mt-2"
                disabled={!askText.trim()}
                onClick={() => { askForPrayer([ds.id], askText); setAskText(''); }}
              >
                Ask {first}
              </Button>
              {myAsks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-bold uppercase tracking-wide text-teal-700">What you have asked</p>
                  {myAsks.map((r) => (
                    <div key={r.id} data-my-ask={r.id} className="rounded-xl bg-white px-4 py-3 ring-1 ring-teal-700/15">
                      <p className="text-navy">{r.body}</p>
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        <span className={r.status === 'praying' ? 'font-semibold text-teal-800' : 'text-gray-500'}>
                          {r.status === 'praying'
                            ? `🙏 ${first} is praying for this`
                            : r.status === 'answered' ? 'Answered' : 'Sent'}
                        </span>
                        <button
                          type="button"
                          onClick={() => withdrawPrayerRequest(r.id)}
                          className="ml-auto text-xs font-semibold text-gray-500 underline"
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------- Resources ---- */}
      {tab === 'resources' && (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">Share a resource</h2>
            <p className="mb-4 text-sm text-gray-500">
              {first} only sees what you share here.
            </p>
            <div className="space-y-2">
              {library.length === 0 ? (
                <p className="text-gray-400">
                  No published resources yet. An admin adds these.
                </p>
              ) : (
                library.map((m) => {
                  const shared = sharedIds.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                    >
                      <span className="text-2xl" aria-hidden>
                        {MATERIAL_ICON[m.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-navy">{m.title}</p>
                        <p className="truncate text-sm text-gray-500">
                          {m.description}
                        </p>
                      </div>
                      {shared ? (
                        <span className="text-sm font-semibold text-green-600">
                          ✓ Shared
                        </span>
                      ) : (
                        <span data-quest="share">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              shareMaterial(pairingId, m.id);
                              emitQuest('beacon:share');
                            }}
                            className="px-4 text-base"
                          >
                            Share
                          </Button>
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-xl font-bold text-navy">
              What {first} is studying
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              Their own notes and media. Study these together.
            </p>
            {shelf.length === 0 ? (
              <p className="text-gray-400">Nothing on their shelf yet.</p>
            ) : (
              <div className="space-y-2">
                {shelf.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                  >
                    <span className="text-2xl" aria-hidden>
                      {MATERIAL_ICON[m.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-navy">{m.title}</p>
                      {m.note && (
                        <p className="truncate text-sm text-gray-500">{m.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 px-3 py-2 text-center">
      <p className="truncate text-sm font-bold text-navy">{value}</p>
      <p className="truncate text-xs text-gray-500">{label}</p>
    </div>
  );
}

// Named with a trailing underscore so it doesn't collide with the page's own
// Detail component above.
function Detail_({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
    </div>
  );
}

const MATERIAL_ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};
