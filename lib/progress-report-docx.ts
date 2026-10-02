// The progress report as a Word document, for a Director's desk, a board
// meeting, or the Guide's own records.
//
// The same hand-written Word file as the Sabbath program's
// (lib/sabbath-program-docx.ts says why it is written by hand and why the
// order of every element matters), with its styles: a title, the summary as a
// two-column table, where everybody is on the journey, each Explorer as a row,
// and the reader's own notes.

import { zipVault } from '@/lib/study/obsidian';
import {
  HEAD, PAGE, TEXT_WIDTH, W, cellOf, para, run, stylesXml, wordPackage,
} from '@/lib/sabbath-program-docx';
import { dayLabel, type ProgressReport } from '@/lib/progress-report';

function table(widths: number[], rows: string[][], header?: string[]): string {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const head = header
    ? `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${header.map((h, i) => '<w:tc><w:tcPr>'
      + `<w:tcW w:w="${widths[i]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>`
      + `</w:tcPr>${para(run(h, '<w:b/>'))}</w:tc>`).join('')}</w:tr>`
    : '';
  const body = rows.map((cells) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
    + cells.map((text, i) => cellOf(widths[i], text.split('\n').map((l, j) => para(l ? run(l, i === 0 && j === 0 ? '<w:b/>' : '') : '')))).join('')
    + '</w:tr>').join('');
  return '<w:tbl><w:tblPr>'
    + `<w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>`
    + '<w:tblBorders>'
    + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
    + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
    + '</w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/>'
    + '<w:tblCellMar>'
    + '<w:top w:w="70" w:type="dxa"/><w:left w:w="60" w:type="dxa"/>'
    + '<w:bottom w:w="70" w:type="dxa"/><w:right w:w="60" w:type="dxa"/>'
    + '</w:tblCellMar>'
    + `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${head}${body}</w:tbl>`
    + para('');
}

/** "Progress-report-2026-10.docx", or "...-2026-Q4.docx" for a quarter. */
export function progressFileName(r: ProgressReport): string {
  const y = r.period.from.getFullYear();
  const m = r.period.from.getMonth();
  const which = r.period.key.endsWith('quarter') ? `Q${Math.floor(m / 3) + 1}` : String(m + 1).padStart(2, '0');
  return `Progress-report-${y}-${which}.docx`;
}

export function progressDocumentXml(r: ProgressReport, title: string, notes = ''): string {
  const t = r.totals;
  const parts: string[] = [];
  parts.push(para(run(title || 'Progress report'), '<w:pStyle w:val="Title"/>'));
  parts.push(para(run(`Progress report · ${r.period.label}`), '<w:pStyle w:val="Subtitle"/>'));
  parts.push(para(run(r.scope === 'church' ? 'Every Explorer in the church' : 'The Explorers I walk with'), '<w:pStyle w:val="Subtitle"/>'));

  parts.push(para(run('Summary'), '<w:pStyle w:val="Heading1"/>'));
  const summary: string[][] = [
    ['Explorers walked with', String(t.walking)],
    ['New this period', String(t.newExplorers)],
    ['Steps forward on the journey', String(t.stepsForward)],
    ['Reached Call (point of decision)', String(t.decisions)],
    ['Reached Commission (sent to disciple)', String(t.commissioned)],
    ...(r.detailed ? [
      ['Bible studies held', String(t.studiesHeld)],
      ['Lessons finished', String(t.lessonsFinished)],
      ['Follow-ups done', String(t.followUpsDone)],
    ] : []),
    ['Needing attention', String(t.needingAttention)],
  ];
  parts.push(table([7000, TEXT_WIDTH - 7000], summary));

  parts.push(para(run('Where everybody is'), '<w:pStyle w:val="Heading1"/>'));
  parts.push(table([7000, TEXT_WIDTH - 7000], r.byStage.map((s, i) => [`${i + 1}. ${s.label}`, String(s.count)])));

  if (r.byGuide?.length) {
    parts.push(para(run('By Guide'), '<w:pStyle w:val="Heading1"/>'));
    parts.push(table([4200, 1800, 1800, TEXT_WIDTH - 7800],
      r.byGuide.map((g) => [g.guide, String(g.explorers), String(g.stepsForward), String(g.needingAttention)]),
      ['Guide', 'Walked with', 'Steps forward', 'Needing attention']));
  }

  parts.push(para(run('Each Explorer'), '<w:pStyle w:val="Heading1"/>'));
  if (!r.explorers.length) parts.push(para(run('Nobody to report on in this period.')));
  else {
    const widths = r.detailed ? [2600, 2400, 2638, 2000] : [2800, 2600, 4238];
    const header = r.detailed ? ['Explorer', 'Stage', 'This period', 'Needs attention'] : ['Explorer', 'Stage', 'This period'];
    parts.push(table(widths, r.explorers.map((e) => {
      const who = `${e.explorer}${e.isNew ? ' (new)' : ''}${r.scope === 'church' ? `\nwith ${e.guide}` : ''}`;
      const stage = `${e.stageLabel}, step ${e.step} of 6\nsince ${dayLabel(e.since)}`;
      const period = [
        e.reached.length ? `Reached ${e.reached.join(', ')}` : 'No step this period',
        e.studies ? `${e.studies.held} Bible ${e.studies.held === 1 ? 'study' : 'studies'}${e.studies.lastMet ? `, last ${dayLabel(e.studies.lastMet)}` : ''}` : '',
        e.lessons ? `${e.lessons.finished} lesson${e.lessons.finished === 1 ? '' : 's'} finished, ${e.lessons.open} open` : '',
        !r.detailed && e.attention.length ? `Needs attention: ${e.attention.join('; ')}` : '',
      ].filter(Boolean).join('\n');
      return r.detailed ? [who, stage, period, e.attention.join('\n') || 'All well'] : [who, stage, period];
    }), header));
  }

  const said = notes.split('\n').map((l) => l.trim()).filter(Boolean);
  if (said.length) {
    parts.push(para(run('Notes'), '<w:pStyle w:val="Heading1"/>'));
    for (const l of said) parts.push(para(run(l)));
  }
  parts.push(para(''));

  return HEAD
    + `<w:document xmlns:w="${W}"><w:body>${parts.join('')}`
    + `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>`
    + `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/>`
    + '</w:sectPr></w:body></w:document>';
}

export function progressToDocx(r: ProgressReport, title: string, notes = '', when: Date = new Date()): Uint8Array {
  const parts = wordPackage(progressDocumentXml(r, title, notes), stylesXml(), `Progress report, ${r.period.label}`, when);
  return zipVault(Object.entries(parts).map(([path, text]) => ({ path, text })), when.getTime());
}
