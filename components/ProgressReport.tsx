'use client';

// The progress report, in the Office's Reports subroom: how the Explorers are
// moving along the journey, for a month or a quarter, in the shape an
// Adventist teacher or Bible worker would recognise. lib/progress-report.ts
// says what is counted, from what, and why each reader sees what they see.
//
// ONE SCREEN, TWO HALVES. ProgressReportView draws a report from whatever it
// is given; the sample church's wrapper is below, and a church's own app's is
// components/LiveProgressReport.tsx, which asks the database.
//
// THE NOTES ARE THE READER'S OWN, kept on this device for each period, the way
// a Bible worker's monthly report has a space for "other activities and
// experiences". They go into the Word file and the text, and nowhere else.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { CopyGlyph, DownloadGlyph } from '@/components/Glyph';
import { FIELD, WIDE } from '@/components/SabbathProgram';
import { keep, readKept, manyLines } from '@/lib/sabbath-program';
import { DOCX_MIME } from '@/lib/sabbath-program-docx';
import {
  PERIODS, QUIET_DAYS, STILL_DAYS, buildProgress, dayLabel, progressAsText,
  type PeriodKey, type ProgressInput,
} from '@/lib/progress-report';
import { progressFileName, progressToDocx } from '@/lib/progress-report-docx';
import { downloadBlob } from '@/lib/pdf';
import { copyText } from '@/lib/share';
import { STAGES } from '@/lib/brand';
import { useDemo } from '@/lib/demo/store';

const notesKey = (owner: string, period: string) => `beacon-progress-notes:${owner}:${period}`;

export function ProgressReportView({ input, owner, title, status }: {
  /** null while it is being read. */
  input: ProgressInput | null;
  /** The account reading, for keeping its notes apart from anybody else's on this device. */
  owner: string;
  /** The church's name, at the top of the Word file. */
  title: string;
  /** One line on anything that went wrong reading it. */
  status?: string;
}) {
  const [key, setKey] = useState<PeriodKey>('this-month');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const report = useMemo(() => (input ? buildProgress(input, key) : null), [input, key]);
  const periodId = report ? `${report.period.key}:${report.period.from.toISOString().slice(0, 7)}` : '';

  useEffect(() => {
    if (!periodId) return;
    const kept = readKept(notesKey(owner, periodId));
    setNotes(typeof kept === 'string' ? kept : '');
  }, [owner, periodId]);

  const t = report?.totals;
  const tiles: Array<[string, number | undefined, string?]> = t ? [
    ['Explorers walked with', t.walking],
    ['New this period', t.newExplorers],
    ['Steps forward', t.stepsForward, 'stages reached'],
    ['Decisions', t.decisions, 'reached Call'],
    ['Sent to disciple', t.commissioned, 'reached Commission'],
    ...(report!.detailed ? [
      ['Bible studies held', t.studiesHeld] as [string, number | undefined],
      ['Lessons finished', t.lessonsFinished] as [string, number | undefined],
      ['Follow-ups done', t.followUpsDone] as [string, number | undefined],
    ] : []),
    ['Needing attention', t.needingAttention],
  ] : [];
  const most = report ? Math.max(1, ...report.byStage.map((s) => s.count)) : 1;

  return (
    <Card className="p-5" data-panel="progress-report">
      <h2 className="text-xl font-bold text-navy">🧾 Progress report</h2>
      <p className="mt-1 text-gray-600">
        {report?.scope === 'church'
          ? 'Every Explorer in the church: where each one is on the journey, who moved, and who needs somebody to look.'
          : 'The Explorers you walk with: where each one is on the journey, the Bible studies and lessons, and who needs you this week.'}
      </p>
      {report?.scope === 'church' && (
        <p className="mt-1 text-sm text-gray-600">
          Meetings, lessons and follow-ups stay between each Guide and Explorer, so they are in each
          Guide&rsquo;s own progress report, not here.
        </p>
      )}
      {status && <p role="status" className="mt-2 text-sm font-semibold text-red-700">{status}</p>}

      <label className="mt-4 block max-w-xs">
        <span className="text-sm font-semibold text-navy">Period</span>
        <select
          aria-label="Period"
          value={key}
          onChange={(e) => setKey(e.target.value as PeriodKey)}
          className={`tap-sm ${FIELD}`}
        >
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>

      {!report ? (
        <p className="mt-4 text-sm text-gray-600">Reading the journey…</p>
      ) : (
        <>
          <p className="mt-2 font-semibold text-navy" data-period>{report.period.label}</p>

          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-progress-totals>
            {tiles.map(([label, n, hint]) => (
              <li key={label} className="rounded-xl bg-navy/[0.03] p-3">
                <span className="block text-2xl font-extrabold text-navy tabular-nums">{n ?? 0}</span>
                <span className="block text-sm font-semibold leading-tight text-gray-700">{label}</span>
                {hint && <span className="block text-xs text-gray-500">{hint}</span>}
              </li>
            ))}
          </ul>

          <section className="mt-5 bg-white" data-by-stage>
            <h3 className="font-bold text-navy">Where everybody is</h3>
            <ul className="mt-2 space-y-1">
              {report.byStage.map((s) => (
                <li key={s.stage} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 font-semibold text-gray-700">{s.label}</span>
                  <span className="h-3 min-w-0 flex-1 rounded-full bg-navy/[0.06]">
                    <span
                      className="block h-3 rounded-full"
                      style={{ width: `${(s.count / most) * 100}%`, background: STAGES.find((x) => x.key === s.stage)?.color }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right font-bold text-navy tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {report.byGuide && report.byGuide.length > 0 && (
            <section className="mt-5 bg-white" data-by-guide>
              <h3 className="font-bold text-navy">By Guide</h3>
              <ul className="mt-2 divide-y divide-navy/10">
                {report.byGuide.map((g) => (
                  <li key={g.guide} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                    <span className="font-semibold text-navy">{g.guide}</span>
                    <span className="text-gray-700">{g.explorers} walked with</span>
                    <span className="text-gray-700">{g.stepsForward} steps forward</span>
                    {g.needingAttention > 0 && <span className="font-semibold text-amber-800">{g.needingAttention} needing attention</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5 bg-white" data-explorers>
            <h3 className="font-bold text-navy">Each Explorer</h3>
            <p className="text-sm text-gray-600">
              Needing attention means: paused, at one stage for {STILL_DAYS} days or more
              {report.detailed ? `, no Bible study for over ${QUIET_DAYS} days, or a follow-up overdue` : ''}.
            </p>
            {report.explorers.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">Nobody to report on in this period.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {report.explorers.map((e) => (
                  <li key={e.pairingId} className="rounded-xl bg-white p-3 ring-1 ring-navy/10" data-explorer>
                    <div>
                      <p className="font-bold text-navy">
                        {e.explorer}
                        {e.isNew && <span className="ml-2 rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">New</span>}
                      </p>
                      <p className="text-sm font-semibold text-gray-700">{e.stageLabel} · step {e.step} of 6</p>
                    </div>
                    <p className="text-sm text-gray-600">
                      {report.scope === 'church' ? `With ${e.guide} · ` : ''}since {dayLabel(e.since)}
                    </p>
                    <p className="mt-1 text-sm text-gray-800">
                      {[
                        e.reached.length ? `Reached ${e.reached.join(', ')}` : 'No new stage this period',
                        e.studies && `${e.studies.held} Bible ${e.studies.held === 1 ? 'study' : 'studies'}${e.studies.lastMet ? `, last ${dayLabel(e.studies.lastMet)}` : ''}${e.studies.upcoming ? `, ${e.studies.upcoming} coming` : ''}`,
                        e.lessons && `${e.lessons.finished} lesson${e.lessons.finished === 1 ? '' : 's'} finished, ${e.lessons.open} open`,
                        e.followUps && e.followUps.open > 0 && `${e.followUps.open} follow-up${e.followUps.open === 1 ? '' : 's'} open`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {e.attention.length > 0 && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200" data-attention>
                        Needs attention: {e.attention.join('; ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-navy">Your notes for this report</span>
            <span className="block text-sm text-gray-600">
              What happened, answered prayer, plans for next month. Kept on this device, and put in
              the Word file and the text.
            </span>
            <textarea
              aria-label="Your notes for this report"
              value={notes}
              rows={4}
              maxLength={4000}
              onChange={(e) => {
                const next = manyLines(e.target.value, 4000);
                setNotes(next);
                keep(notesKey(owner, periodId), next);
              }}
              className={`mt-1 block min-h-[7rem] py-2 leading-relaxed ${FIELD}`}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className={WIDE}
              onClick={() => {
                const bytes = progressToDocx(report, title, notes);
                downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: DOCX_MIME }), progressFileName(report));
                setMessage(`Downloaded: ${progressFileName(report)}`);
              }}
            >
              <DownloadGlyph /> Download Word file
            </Button>
            <Button
              variant="ghost"
              className={WIDE}
              onClick={async () => {
                const ok = await copyText(progressAsText(report, title, notes));
                setMessage(ok ? 'Copied. Paste it into a message.' : 'This browser would not copy it. Download the Word file instead.');
              }}
            >
              <CopyGlyph /> Copy as text
            </Button>
          </div>
          {message && <p role="status" className="mt-2 text-sm font-semibold text-navy">{message}</p>}
        </>
      )}
    </Card>
  );
}

/** The sample church's progress report, from its invented people, by the same rules. */
export function DemoProgressReport() {
  const { db, currentUser } = useDemo();
  const input = useMemo<ProgressInput | null>(() => {
    if (!currentUser) return null;
    const guide = currentUser.role === 'dm';
    const names = Object.fromEntries(db.profiles.map((p) => [p.id, p.full_name]));
    const mine = new Set(db.pairings.filter((p) => p.dm_id === currentUser.id).map((p) => p.id));
    return {
      me: currentUser.id,
      scope: guide ? 'mine' : 'church',
      names,
      pairings: db.pairings,
      events: db.journey_events,
      ...(guide ? {
        meetings: db.meetings.filter((m) => mine.has(m.pairing_id))
          .map((m) => ({ pairing_id: m.pairing_id, at: m.when, held: m.status === 'scheduled', cancelled: m.status === 'cancelled' })),
        lessons: db.lesson_assignments.filter((a) => mine.has(a.pairing_id))
          .map((a) => ({ pairing_id: a.pairing_id, created_at: a.created_at, completed_at: a.completed_at ?? null })),
        followUps: db.follow_ups.filter((f) => f.owner_id === currentUser.id),
      } : {}),
    };
  }, [db, currentUser]);
  return <ProgressReportView input={input} owner={`sample:${currentUser?.id ?? 'nobody'}`} title={db.church_name} />;
}
