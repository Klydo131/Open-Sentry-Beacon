'use client';

// The church's numbers, for a Director or an Executive Director on a Tuesday.
//
// WHO THIS IS FOR. Somebody who uses a spreadsheet occasionally and has never
// opened a BI tool, who has ten minutes before a meeting and needs to be able
// to say what is happening. So: a headline they can read at a glance, two
// charts that answer two specific questions, the averages a spreadsheet would
// give them, and a file they can attach to an email.
//
// THE TWO QUESTIONS, replacing a generic "everything week by week" chart that
// answered neither:
//
//   1. Who is using it — Guides and Explorers, active and inactive, over a day,
//      a week and a month.
//   2. Who is arriving and who is leaving — new members by role at any grain
//      from daily to yearly, and the suspensions, refusals and removals beside
//      them.
//
// ONE AXIS, ALWAYS. No chart here has two y-scales; that is the single most
// common way a chart lies and it is not available.
//
// ARRIVALS ARE SMALL MULTIPLES, NOT FOUR LINES. Four series on one axis needs
// four separable colours, and the validator says blue and purple sit at ΔE 5.7
// under deuteranopia — below the floor at which direct labels can rescue them.
// Four panels each hold one series, which needs one hue and no legend, and it
// also fixes the scale: one Executive Director and thirteen Explorers do not
// share a y-axis usefully.

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as an from '@/lib/live/analytics';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { roleNoun } from '@/lib/brand';
import { buildReport, type Report } from '@/lib/live/report';
import {
  downloadCsv, downloadDoc, downloadPdf, downloadSheet,
} from '@/lib/live/report-formats';
import type { Role } from '@/lib/types';
import { humanError } from '@/lib/live/errors';

/**
 * The five ways out, and what each is actually for.
 *
 * ORDERED BY HOW OFTEN A CHURCH WANTS THEM, not by format family. A pastor
 * reaches for the spreadsheet and the print dialog constantly and for CSV
 * about once, and putting the two file-for-a-machine formats first is how a
 * list of five becomes a thing people scan past.
 */
const EXPORTS: {
  key: string; icon: string; label: string; blurb: string; opens: string;
  run: (r: Report) => void;
}[] = [
  {
    key: 'sheet', icon: '📊', label: 'Sheets',
    blurb: 'Both tables with their headings, ready to sort and chart.',
    opens: 'Excel · Google Sheets · Numbers',
    run: downloadSheet,
  },
  {
    key: 'doc', icon: '📄', label: 'Document',
    blurb: 'The whole report as prose and tables, still editable.',
    opens: 'Word · Google Docs',
    run: downloadDoc,
  },
  {
    key: 'pdf', icon: '📕', label: 'PDF file',
    blurb: 'A fixed report nobody can change by accident. Downloads straight away.',
    opens: 'Any device',
    run: downloadPdf,
  },
  {
    key: 'print', icon: '🖨️', label: 'Print',
    blurb: 'Your own print dialog, where you pick the paper. It can save a PDF too.',
    opens: 'Printer · Save as PDF',
    // Not a download: this hands the page to the browser, which is the only way
    // somebody gets to choose margins and paper size.
    run: () => window.print(),
  },
  {
    key: 'csv', icon: '🔢', label: 'CSV',
    blurb: 'Plain text, for feeding into another program.',
    opens: 'Anything at all',
    run: downloadCsv,
  },
];

const message = (cause: unknown) =>
  humanError(cause, 'Could not load the numbers.');

function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A stat tile. A number somebody reads, not a chart with one bar. */
function Kpi({ n, label, hint, tone = 'plain' }: {
  n: number | string; label: string; hint?: string; tone?: 'plain' | 'good' | 'watch';
}) {
  const bg = tone === 'good' ? 'bg-green-50' : tone === 'watch' ? 'bg-amber-50' : 'bg-gray-50';
  const ink = tone === 'good' ? 'text-green-800' : tone === 'watch' ? 'text-amber-900' : 'text-navy';
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <p className={`text-3xl font-extrabold ${ink}`}>{n}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart 1 — active against inactive
// ---------------------------------------------------------------------------
//
// A part-to-whole: of the Guides on the roll, how many did something. Stacked
// bars rather than two separate bars, because the two numbers add to a total
// that matters, and a 2px gap between the segments so the boundary is a line
// rather than a colour change somebody has to trust.

export function ActiveBars({ slices, role }: { slices: an.ActivitySlice[]; role: Role }) {
  const mine = an.ACTIVITY_WINDOWS.map((w) =>
    slices.find((s) => s.role === role && s.days === w.days)
    ?? { windowLabel: w.label, days: w.days, role, approved: 0, active: 0, inactive: 0, suspended: 0 });

  const W = 320;
  const H = 200;
  // TOP PADDING IS FOR THE NUMBER, not for looks. The tallest bar is the whole
  // roll, so it reaches the ceiling exactly, and the count sits above it: with
  // 12px of headroom the digits were drawn off the top of the canvas and
  // clipped in half. 30 leaves room for an 11px label and its ascenders.
  const PAD = { top: 30, right: 8, bottom: 30, left: 30 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const top = Math.max(1, ...mine.map((m) => m.approved));
  const band = plotW / mine.length;
  const barW = Math.min(56, band * 0.55);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  // The roll is the same in all three windows, so it belongs in the caption
  // rather than being re-derived from three bars of equal height.
  const roll = Math.max(...mine.map((m) => m.approved), 0);

  return (
    <figure className="m-0">
      <figcaption className="text-sm font-bold text-navy">
        {roleNoun(role)}s
        {/* WITHOUT THIS, THE NUMBER ON THE BAR IS AMBIGUOUS: a reader cannot
            tell whether 11 is the blue part or the whole bar. Naming the roll
            once settles it, and the number on each bar is then plainly the
            active one. */}
        <span className="ml-1.5 font-normal text-gray-500">{roll} on the roll</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img"
        aria-label={`${roleNoun(role)}s active and inactive over today, this week and this month`}>
        {/* Recessive grid: three lines, no box. */}
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={y(top * f)} y2={y(top * f)}
            stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={PAD.left - 6} y={y(top * f) + 4} textAnchor="end"
            className="fill-gray-400" style={{ fontSize: 10 }}>
            {Math.round(top * f)}
          </text>
        ))}

        {mine.map((m, i) => {
          const cx = PAD.left + band * i + band / 2;
          const x = cx - barW / 2;
          const activeH = (m.active / top) * plotH;
          const inactiveH = (m.inactive / top) * plotH;
          const base = PAD.top + plotH;
          return (
            <g key={m.days}>
              {/* Inactive sits underneath, active on top of it, with a 2px
                  surface gap between so the join reads as a boundary. */}
              <rect x={x} y={base - inactiveH} width={barW} height={Math.max(0, inactiveH)}
                rx={4} fill={an.INACTIVE_COLOUR} />
              <rect x={x} y={base - inactiveH - activeH - (activeH > 0 && inactiveH > 0 ? 2 : 0)}
                width={barW} height={Math.max(0, activeH)} rx={4} fill={an.ACTIVE_COLOUR} />
              {/* Direct label: the number that answers the question, on the
                  mark, rather than a value on every segment. */}
              <text x={cx} y={base - inactiveH - activeH - 6} textAnchor="middle"
                className="fill-gray-700" style={{ fontSize: 11, fontWeight: 700 }}>
                {m.active}
              </text>
              <title>{`${m.windowLabel}: ${m.active} active, ${m.inactive} with nothing recorded, of ${m.approved} on the roll`}</title>
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-gray-500"
                style={{ fontSize: 11 }}>
                {m.windowLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Chart 2 — arrivals, one small panel per role
// ---------------------------------------------------------------------------

export function ArrivalPanel({ panel, labels, peak }: {
  panel: an.ArrivalPanel; labels: string[]; peak: number;
}) {
  const W = 320;
  const H = 140;
  // Room for the value printed above the tallest bar. Same clipping as the
  // chart above: at the peak the bar reaches the ceiling and the number does
  // not fit in what is left.
  const PAD = { top: 24, right: 8, bottom: 22, left: 26 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, panel.points.length);
  const barW = Math.max(3, Math.min(22, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH;

  return (
    <figure className="m-0 rounded-xl bg-gray-50 p-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-navy">{panel.label}</span>
        <span className="text-xs text-gray-500">{panel.total} in this period</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img"
        aria-label={`${panel.label} joining, ${panel.total} in this period`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
          stroke="#E5E7EB" strokeWidth={1} />
        <text x={PAD.left - 5} y={PAD.top + 8} textAnchor="end" className="fill-gray-400"
          style={{ fontSize: 9 }}>{peak}</text>
        {panel.points.map((v, i) => (
          <g key={i}>
            <rect
              x={PAD.left + band * i + (band - barW) / 2}
              y={y(v)}
              width={barW}
              height={Math.max(0, PAD.top + plotH - y(v))}
              rx={4}
              fill={an.ARRIVAL_COLOUR}
            />
            {v > 0 && (
              <text x={PAD.left + band * i + band / 2} y={y(v) - 3} textAnchor="middle"
                className="fill-gray-600" style={{ fontSize: 9, fontWeight: 700 }}>{v}</text>
            )}
          </g>
        ))}
        {/* First and last label only. A tick under every one of fourteen days
            is unreadable at this width and tells nobody anything. */}
        <text x={PAD.left} y={H - 6} className="fill-gray-400" style={{ fontSize: 9 }}>
          {labels[0]}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-gray-400"
          style={{ fontSize: 9 }}>
          {labels[labels.length - 1]}
        </text>
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------

export function LiveAnalytics({ churchName }: { churchName?: string }) {
  const [slices, setSlices] = useState<an.ActivitySlice[] | null>(null);
  const [head, setHead] = useState<an.Headline | null>(null);
  const [grain, setGrain] = useState<an.Grain>('week');
  const [arr, setArr] = useState<an.Arrivals | null>(null);
  const [gone, setGone] = useState<an.Departures | null>(null);
  const [loadingArrivals, setLoadingArrivals] = useState(false);
  const [error, setError] = useState('');
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([an.activityByWindow(), an.headline()])
      .then(([s, h]) => { if (alive) { setSlices(s); setHead(h); } })
      .catch((cause) => { if (alive) { setSlices([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, []);

  const loadArrivals = useCallback(async (g: an.Grain) => {
    setLoadingArrivals(true);
    try {
      const [a, d] = await Promise.all([an.arrivals(g), an.departures(an.windowStart(g))]);
      setArr(a);
      setGone(d);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoadingArrivals(false);
    }
  }, []);

  useEffect(() => { void loadArrivals(grain); }, [grain, loadArrivals]);

  /**
   * The report every format renders.
   *
   * Built from exactly what the screen is showing, so a file can never
   * disagree with the page somebody was looking at when they pressed the
   * button. Null until the numbers have loaded, which is what disables the
   * buttons rather than producing an empty file.
   */
  const report = useMemo(() => {
    if (!arr || !slices || !head) return null;
    return buildReport({
      church: churchName,
      headline: head,
      activity: slices.map((s) => ({
        role: roleNoun(s.role),
        windowLabel: s.windowLabel,
        approved: s.approved,
        active: s.active,
        inactive: s.inactive,
        suspended: s.suspended,
      })),
      grainLabel: an.GRAINS.find((g) => g.key === arr.grain)?.label ?? 'Weekly',
      arrivalLabels: arr.labels,
      arrivals: arr.panels.map((p) => ({ label: p.label, points: p.points, total: p.total })),
      departures: gone ?? undefined,
    });
  }, [arr, slices, head, gone, churchName]);

  const csv = useMemo(() => {
    if (!arr || !slices) return '';
    const lines: string[][] = [];
    lines.push(['Who is using it']);
    lines.push(['Role', 'Period', 'On the roll', 'Active', 'Inactive', 'Suspended']);
    for (const s of slices) {
      lines.push([roleNoun(s.role), s.windowLabel, String(s.approved), String(s.active),
        String(s.inactive), String(s.suspended)]);
    }
    lines.push([]);
    lines.push([`Who is arriving (${an.GRAINS.find((g) => g.key === arr.grain)?.label})`]);
    lines.push(['Period', ...arr.panels.map((p) => p.label)]);
    arr.labels.forEach((label, i) => {
      lines.push([label, ...arr.panels.map((p) => String(p.points[i] ?? 0))]);
    });
    lines.push(['Total', ...arr.panels.map((p) => String(p.total))]);
    if (gone) {
      lines.push([]);
      lines.push([`Decisions recorded since ${gone.since}`]);
      lines.push(['Approved', String(gone.approved)]);
      lines.push(['Turned down', String(gone.disapproved)]);
      lines.push(['Suspended', String(gone.suspended)]);
      lines.push(['Suspension lifted', String(gone.released)]);
      lines.push(['Removed and deleted', String(gone.removed)]);
    }
    return lines.map((r) => r.map(cell).join(',')).join('\r\n');
  }, [arr, slices, gone]);

  if (error && !slices?.length) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      </Card>
    );
  }

  if (!slices || !head) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
        <BeaconSpinner inline label="Counting" className="mt-4" />
      </Card>
    );
  }

  const grainLabel = an.GRAINS.find((g) => g.key === grain)?.label ?? 'Weekly';

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
        <p className="mt-1 text-sm text-gray-500">
          {churchName ? `${churchName}. ` : ''}
          Nobody&rsquo;s name, message or prayer appears here.
        </p>

        {/* THE HEADLINE. Four numbers, and the one that means somebody is being
            ignored is coloured when it is not zero. */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi n={head.explorers} label="Explorers" hint="Approved and in the church" />
          <Kpi n={head.guides} label="Guides" hint="Carrying at least one person" />
          <Kpi n={head.graduated} label="Graduated" hint="Sent to disciple others" tone="good" />
          <Kpi
            n={head.unpaired}
            label="Waiting for a Guide"
            hint={head.unpaired ? 'Pair these first' : 'Everybody is paired'}
            tone={head.unpaired ? 'watch' : 'good'}
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-navy">Who is using it</h3>
          <button
            type="button"
            onClick={() => setHowTo((v) => !v)}
            className="text-sm font-semibold text-navy underline underline-offset-2"
          >
            {howTo ? 'Hide how to read this' : 'How to read this'}
          </button>
        </div>

        {/* THE DEFINITION IS NOT IN A TOOLTIP. It is the first thing under the
            heading, because a Director who reads "active" as "opened the app"
            will make a decision about a person on a number that does not mean
            that. */}
        <p className="mt-1 text-sm text-gray-500">
          <strong>Active</strong> means Beacon recorded them doing something:
          sending a message, a step on a journey, arranging a meeting, or
          writing a post or a lesson. It is not a count of visits, because
          Beacon does not record when somebody opens the app.
        </p>

        {howTo && (
          <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p><strong>Each bar is everybody on the roll for that role.</strong> The blue part did something in the period, the brown part did not. The number above the bar is the blue one.</p>
            <p><strong>Today will almost always look low</strong>, and that is the day, not the church. Read the week and the month.</p>
            <p><strong>Brown is not a failure.</strong> An Explorer who met their Guide in person and wrote nothing down is brown here. What is worth acting on is a whole month of brown for somebody, and <em>Waiting for a Guide</em> above zero.</p>
          </div>
        )}

        {/* Legend, always. Identity never rests on colour alone. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: an.ACTIVE_COLOUR }} />
            Active
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: an.INACTIVE_COLOUR }} />
            Nothing recorded
          </span>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {an.ACTIVITY_ROLES.map((r) => (
            <ActiveBars key={r} slices={slices} role={r} />
          ))}
        </div>

        {/* THE TABLE IS NOT OPTIONAL. It is what makes the chart readable to a
            screen reader, to somebody who cannot separate the colours, and to
            anybody who just wants the number. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <caption className="sr-only">Active and inactive members by role and period</caption>
            <thead>
              <tr>
                {['Role', 'Period', 'On the roll', 'Active', 'Nothing recorded', 'Suspended'].map((h) => (
                  <th key={h} className="border-b border-gray-200 p-2 text-left font-bold text-navy">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={`${s.role}-${s.days}`}>
                  <td className="border-b border-gray-100 p-2">{roleNoun(s.role)}</td>
                  <td className="border-b border-gray-100 p-2">{s.windowLabel}</td>
                  <td className="border-b border-gray-100 p-2">{s.approved}</td>
                  <td className="border-b border-gray-100 p-2 font-semibold">{s.active}</td>
                  <td className="border-b border-gray-100 p-2">{s.inactive}</td>
                  <td className="border-b border-gray-100 p-2">{s.suspended}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-navy">Who is arriving</h3>
            <p className="mt-1 text-sm text-gray-500">
              Counted on the day somebody finished signing up, not the day their
              invitation was sent.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {an.GRAINS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGrain(g.key)}
                aria-pressed={grain === g.key}
                className={`tap-sm rounded-xl px-3 py-1.5 text-sm font-bold ${
                  grain === g.key ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {loadingArrivals && <BeaconSpinner inline label={`Counting ${grainLabel.toLowerCase()}`} className="mt-4" />}

        {arr && !loadingArrivals && (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {arr.panels.map((p) => (
                <ArrivalPanel key={p.role} panel={p} labels={arr.labels} peak={arr.peak} />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              All four panels share one scale, so a tall bar means the same
              number of people wherever it appears.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-sm">
                <caption className="sr-only">People joining by role, and the average and middle period</caption>
                <thead>
                  <tr>
                    {['Role', 'Total', `Average a ${arr.grain}`, `Middle ${arr.grain}`, 'Last full period'].map((h) => (
                      <th key={h} className="border-b border-gray-200 p-2 text-left font-bold text-navy">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arr.panels.map((p) => {
                    const c = an.stepChange(p.points);
                    return (
                      <tr key={p.role}>
                        <td className="border-b border-gray-100 p-2">{p.label}</td>
                        <td className="border-b border-gray-100 p-2 font-semibold">{p.total}</td>
                        <td className="border-b border-gray-100 p-2">{an.mean(p.points).toFixed(1)}</td>
                        <td className="border-b border-gray-100 p-2">{an.median(p.points)}</td>
                        <td className="border-b border-gray-100 p-2">
                          {c.latest}
                          {c.pct !== null && (
                            <span className={`ml-1 text-xs font-semibold ${c.pct > 0 ? 'text-green-700' : c.pct < 0 ? 'text-amber-800' : 'text-gray-500'}`}>
                              {c.pct > 0 ? '+' : ''}{c.pct}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ---------------- Decisions, in the same window ---------------- */}
        {gone && !loadingArrivals && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <h4 className="text-base font-bold text-navy">Decisions recorded since {gone.since}</h4>
            <p className="mt-1 text-sm text-gray-500">
              From the discipline record, which outlives the people in it. In
              Beacon, removing somebody from the church deletes their account, so
              &ldquo;removed&rdquo; and &ldquo;deleted&rdquo; are one number and
              not two.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi n={gone.approved} label="Let in" tone="good" />
              <Kpi n={gone.disapproved} label="Turned down" tone={gone.disapproved ? 'watch' : 'plain'} />
              <Kpi n={gone.suspended} label="Suspended" tone={gone.suspended ? 'watch' : 'plain'} />
              <Kpi n={gone.released} label="Suspension lifted" />
              <Kpi n={gone.removed} label="Removed and deleted" tone={gone.removed ? 'watch' : 'plain'} />
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* FIVE FORMATS, AND EACH ONE SAYS WHAT IT IS FOR.
          Two buttons labelled CSV and Print made somebody choose between a file
          they cannot read and a dialog. These are the five things a church
          actually does with numbers, and the difference between "print as PDF"
          and "PDF" is real: one gives you the paper dialog, the other hands you
          a file.

          EVERY FORMAT CARRIES THE SAME NOTES, which is the whole reason the
          report is described once in lib/live/report.ts rather than written
          five times. A spreadsheet with a column headed "Active" and no
          definition beside it is how somebody decides that eleven of nineteen
          Guides are not working. */}
      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">Take it with you</h3>
        <p className="mt-1 text-sm text-gray-500">
          The same numbers, with the same explanations, in whichever form you
          need. Every file carries your church&rsquo;s name, the date it was
          made, and what each figure means. Nobody&rsquo;s name is in any of
          them.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((x) => (
            <button
              key={x.key}
              type="button"
              disabled={!report}
              onClick={() => report && x.run(report)}
              className="rounded-xl bg-gray-50 p-4 text-left transition hover:bg-gray-100 disabled:opacity-50"
            >
              <p className="font-bold text-navy">{x.icon} {x.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{x.blurb}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {x.opens}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-bold text-navy">Which one do I want?</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li><strong>Working on the numbers yourself?</strong> Sheets. It keeps both tables and the headings.</li>
            <li><strong>Sending it to somebody who will edit it?</strong> Document.</li>
            <li><strong>Sending it to somebody who should not edit it?</strong> PDF.</li>
            <li><strong>Feeding it into another program?</strong> CSV.</li>
            <li><strong>Handing round paper at a meeting?</strong> Print.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
