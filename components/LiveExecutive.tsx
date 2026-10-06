'use client';

// What a Director and an Executive Director see beyond the member list.
//
// The live executive page had invitations, approvals and pairing and nothing
// else, which is a workspace for administering people rather than a view of a
// ministry. This adds the three things the sample-data version has and the live
// one did not: the numbers, the board report, and the library.
//
// EVERY NUMBER HERE IS A COUNT, NEVER A CONTENT. A leader is shown how many
// conversations are happening and never a conversation, how many prayer
// requests exist and never who wrote one. That is the same line the rest of the
// product draws, and it is drawn in the DATABASE — prayer_wall() and
// church_meeting_summary() return aggregates, and messages are unreadable to a
// leader by policy. Nothing here is a screen politely declining to render
// something it could have.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_NUMBERS } from '@/lib/live/keep-up';
import { copyText } from '@/lib/share';
import * as live from '@/lib/live/data';
import { STAGES as BRAND_STAGES, APP_SHORT_NAME } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { Pdf, downloadBlob } from '@/lib/pdf';
import { humanError } from '@/lib/live/errors';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

interface Numbers {
  guides: number;
  explorers: number;
  awaiting: number;
  pairings: number;
  prayers: number;
  library: number;
  meetings: number;
  stages: Record<string, number>;
}

// ONE SOURCE FOR THE ORDER AND THE WORDS. This file carried its own copy of
// both, and the copies drifted the instant "Create" became "Beginner": brand.ts
// was renamed and this was not, so the board report and the overview would have
// disagreed about what the first stage is called.
const STAGES = BRAND_STAGES.map((s) => s.key);
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  BRAND_STAGES.map((s) => [s.key, s.label]),
);

/**
 * GRADUATED means reached Commission: walked the whole way, and now sent to
 * walk with somebody else. It is the number the whole design exists to produce,
 * and until now no screen showed it.
 */
const GRADUATED = 'commission';

function Stat({ n, label, tone = 'navy' }: { n: number; label: string; tone?: 'navy' | 'gold' | 'grey' }) {
  const bg = tone === 'gold' ? 'bg-gold/15' : tone === 'grey' ? 'bg-gray-100' : 'bg-navy/5';
  return (
    <div className={`rounded-xl ${bg} p-4 text-center`}>
      <p className="text-3xl font-extrabold text-navy">{n}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

export function LiveChurchOverview() {
  const [n, setN] = useState<Numbers | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // Read everything this caller is entitled to and count it. The database
      // has already decided what that is; nothing is filtered here.
      const [members, pairings, wall, meetings, materials] = await Promise.all([
        live.listMembers(),
        live.listPairings(),
        live.listPrayerWall(),
        live.listChurchMeetings(),
        live.listMaterials(),
      ]);
      const stages: Record<string, number> = {};
      for (const s of STAGES) stages[s] = 0;
      for (const p of pairings) {
        if (p.status === 'active') stages[p.journey_stage] = (stages[p.journey_stage] ?? 0) + 1;
      }
      setN({
        guides: members.filter((m) => m.role === 'dm' && m.is_approved).length,
        explorers: members.filter((m) => m.role === 'ds' && m.is_approved).length,
        awaiting: members.filter((m) => !m.is_approved).length,
        pairings: pairings.filter((p) => p.status === 'active').length,
        prayers: wall.length,
        library: materials.length,
        meetings: meetings.length,
        stages,
      });
      setError('');
    } catch (cause) {
      setError(message(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_NUMBERS, load);

  if (error) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📊 Your church at a glance</h2>
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      </Card>
    );
  }
  if (!n) return <Card className="p-5 text-gray-500">Loading the numbers…</Card>;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📊 Your church at a glance</h2>
      <p className="mt-1 text-sm text-gray-500">
        Counts only. You are never shown a conversation, and never who wrote a prayer request.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={n.guides} label="Guides" />
        <Stat n={n.explorers} label="Explorers" />
        <Stat n={n.pairings} label="Walking together" tone="gold" />
        <Stat n={n.awaiting} label="Awaiting approval" tone={n.awaiting ? 'gold' : 'grey'} />
      </div>

      {/* THE TWO NUMBERS A DIRECTOR IS ACTUALLY ASKED FOR, above the breakdown.
          "How many have we seen all the way through, and how many are still
          walking?" was answerable only by adding five figures in your head. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat n={n.stages[GRADUATED] ?? 0} label="Graduated" tone="gold" />
        <Stat
          n={STAGES.filter((s) => s !== GRADUATED)
            .reduce((total, s) => total + (n.stages[s] ?? 0), 0)}
          label="Still walking"
        />
      </div>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-gray-500">Where people are on the journey</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((s) => (
          <Stat key={s} n={n.stages[s] ?? 0} label={STAGE_LABEL[s]} tone={s === GRADUATED ? 'gold' : 'grey'} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat n={n.prayers} label="On the prayer wall" tone="grey" />
        <Stat n={n.library} label="In the library" tone="grey" />
        <Stat n={n.meetings} label="Meetings" tone="grey" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The board report: the same numbers, in a form you can read out or print.
// ---------------------------------------------------------------------------
export function LiveBoardReport({ churchName }: { churchName?: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  // '' not tried, 'yes' copied, 'failed' the clipboard refused. Safari rejects
  // when the document is not focused; saying nothing reads as a dead button.
  const [copied, setCopied] = useState<'' | 'yes' | 'failed'>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [members, pairings, wall, meetings] = await Promise.all([
          live.listMembers(), live.listPairings(), live.listPrayerWall(), live.listChurchMeetings(),
        ]);
        if (!alive) return;
        const active = pairings.filter((p) => p.status === 'active');
        const byStage = STAGES
          .map((s) => `${STAGE_LABEL[s]}: ${active.filter((p) => p.journey_stage === s).length}`)
          .join(' · ');
        setLines([
          `${churchName ?? 'This church'} · ${APP_SHORT_NAME} report`,
          `Prepared ${new Date().toLocaleDateString()}`,
          '',
          `Guides serving: ${members.filter((m) => m.role === 'dm' && m.is_approved).length}`,
          `People being walked with: ${members.filter((m) => m.role === 'ds' && m.is_approved).length}`,
          `Active relationships: ${active.length}`,
          `Awaiting approval: ${members.filter((m) => !m.is_approved).length}`,
          '',
          // THE TWO A BOARD ACTUALLY ASKS FOR, before the breakdown. "How many
          // have we seen all the way through" was answerable only by finding
          // Commission inside a run-on line and reading the number after it.
          `Graduated (sent to disciple others): ${active.filter((p) => p.journey_stage === GRADUATED).length}`,
          `Still walking: ${active.filter((p) => p.journey_stage !== GRADUATED).length}`,
          '',
          `Journey: ${byStage}`,
          '',
          `Prayer requests shared with the church: ${wall.length}`,
          `Meetings arranged: ${meetings.length}`,
          '',
          'No conversation, name or prayer author appears in this report, by design.',
        ]);
        setError('');
      } catch (cause) { if (alive) setError(message(cause)); }
    })();
    return () => { alive = false; };
  }, [churchName]);

  if (error || !lines) return null;

  const text = lines.join('\n');
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">🧾 Report for the board</h2>
          <p className="text-sm text-gray-500">Numbers a board can be told, with nothing private in them.</p>
        </div>
        {/* COPY WAS THE ONLY WAY OUT OF THIS CARD, and a board does not want a
            paste. They want a file to attach to the minutes. Three formats
            because they are asked for by three different people: PDF for the
            meeting pack, CSV for anyone who wants to put it in a spreadsheet,
            and Copy for a quick message.

            No library for any of it. lib/pdf.ts writes the PDF by hand — PDF is
            a text format — because adding a rendering dependency to a project
            that runs on free tiers, to lay out fifteen lines, is a bad trade. */}
        {/* See LiveChurchPages: shrink-0 and flex-wrap cancel each other out. */}
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Button
            variant="ghost"
            onClick={async () => setCopied(await copyText(text) ? 'yes' : 'failed')}
          >
            {copied === 'yes' ? '✓ Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
          </Button>
          <Button variant="ghost" onClick={() => downloadPdf(lines, churchName)}>PDF</Button>
          <Button variant="ghost" onClick={() => downloadCsv(lines, churchName)}>CSV</Button>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
{text}
      </pre>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Taking the report away with you
// ---------------------------------------------------------------------------

/** A filename a person can find again, from the church's own name. */
function reportSlug(churchName?: string | null) {
  const base = (churchName || 'church').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'church'}-board-report-${new Date().toISOString().slice(0, 10)}`;
}

function downloadPdf(lines: string[], churchName?: string | null) {
  const pdf = new Pdf();
  // A navy band at the top, so the page is recognisably from this app when it
  // is printed and passed round a table.
  pdf.rect(0, 0, pdf.W, 64, [30, 42, 74]);
  pdf.text(40, 34, APP_SHORT_NAME, { size: 20, bold: true, color: [255, 255, 255] });
  pdf.text(40, 52, 'Report for the board', { size: 10, color: [220, 225, 235] });

  let y = 104;
  for (const line of lines) {
    if (!line) { y += 9; continue; }
    // The first two lines are the title block; a blank line separates sections,
    // and a line ending in a colon-free label reads as a heading.
    const heading = line.endsWith('report') || line.startsWith('Prepared');
    pdf.text(40, y, line, { size: heading ? 12 : 11, bold: heading });
    y += heading ? 18 : 16;
    if (y > pdf.H - 60) break;  // one page, by design; the report is short
  }

  pdf.text(40, pdf.H - 40, 'No conversation, name or prayer author appears in this report.', {
    size: 8, color: [120, 130, 145],
  });
  downloadBlob(pdf.blob(), `${reportSlug(churchName)}.pdf`);
}

function downloadCsv(lines: string[], churchName?: string | null) {
  // The report is "Label: value" lines plus headings and blanks. Splitting on
  // the FIRST colon only matters — "Journey: Create: 0 · Connect: 0" has
  // several, and everything after the first belongs to the value.
  const rows: string[][] = [['Measure', 'Value']];
  for (const line of lines) {
    if (!line) continue;
    const at = line.indexOf(': ');
    if (at === -1) rows.push([line, '']);
    else rows.push([line.slice(0, at), line.slice(at + 2)]);
  }
  // Quote every field and double any quote inside it. A church name with a
  // comma in it is not exotic, and an unquoted one silently shifts a column.
  const csv = rows
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // The BOM is what makes Excel read this as UTF-8 rather than mangling any
  // accented character in the church's name.
  downloadBlob(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
    `${reportSlug(churchName)}.csv`,
  );
}
