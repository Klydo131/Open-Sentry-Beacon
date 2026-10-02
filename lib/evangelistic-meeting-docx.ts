// Evangelistic meetings as a Word document (.docx), written in the browser.
//
// The same small, hand-written Word file as the Sabbath program's
// (lib/sabbath-program-docx.ts says why it is written by hand, and why the
// order of every element matters), with what a series needs on top:
//
//   * A LIST HAS ITS OWN COLUMNS, one to six, so its table is as wide as the
//     page with the columns sharing it, and its header row repeats when a long
//     list runs onto the next page.
//   * THE MEETING'S OWN LOOK: its colour on the title, the headings and their
//     rules, and its heading face. A colour too pale to read as words draws the
//     rules only, and the words are written in ink (lib/evangelistic-meeting.ts,
//     wordColour). The faces are Georgia, Arial and Verdana, which Word, Google
//     Docs, Pages and LibreOffice all have: nothing is embedded or fetched.
//   * TWO COPIES. What is shared leaves out every team-only block; the team's
//     copy has them all, marked.

import { zipVault } from '@/lib/study/obsidian';
import { dateLabel } from '@/lib/sabbath-program';
import {
  HEAD, PAGE, TEXT_WIDTH, W, cellOf, para, run, wordPackage,
} from '@/lib/sabbath-program-docx';
import {
  HEADING_FACES, blocksFor, filledRows, hasContent, nightHours, nightLabel, seriesDates, wordColour,
  type EvangelisticMeeting, type MeetingBlock, type MeetingCopy,
} from '@/lib/evangelistic-meeting';

/** "Hope-for-Today-night-2.docx": the name, made safe for a file, and what is in it. */
export function meetingFileName(
  m: EvangelisticMeeting,
  nightId: string | null,
  copy: MeetingCopy = 'shared',
  extension = 'docx',
): string {
  const base = (m.name || 'Evangelistic-meetings')
    .normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60)
    || 'Evangelistic-meetings';
  const at = nightId ? m.nights.findIndex((n) => n.id === nightId) : -1;
  return `${base}${at >= 0 ? `-night-${at + 1}` : ''}${copy === 'team' ? '-team' : ''}.${extension}`;
}

const hex = (colour: string) => colour.replace('#', '').toUpperCase();

/** Widths for `n` columns sharing the page, the last taking what rounding leaves. */
function widths(n: number): number[] {
  const each = Math.floor(TEXT_WIDTH / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? TEXT_WIDTH - each * (n - 1) : each));
}

function table(b: Extract<MeetingBlock, { kind: 'list' }>): string {
  const cols = widths(b.columns.length);
  const grid = cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const named = b.columns.some((c) => c.name.trim());
  // tcPr children in schema order: tcW, then shd.
  const headCell = (w: number, name: string) => '<w:tc><w:tcPr>'
    + `<w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>`
    + `</w:tcPr>${para(name ? run(name, '<w:b/>') : '')}</w:tc>`;
  const header = named
    ? `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${b.columns.map((c, i) => headCell(cols[i], c.name)).join('')}</w:tr>`
    : '';
  const body = filledRows(b).map((cells) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
    + cells.map((text, i) => cellOf(cols[i], [para(text ? run(text, i === 0 ? '<w:b/>' : '') : '')])).join('')
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
    + `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${body}</w:tbl>`;
}

/** One block: its heading in the given style, then what it holds. '' when it holds nothing. */
function block(b: MeetingBlock, copy: MeetingCopy, style: 'Heading1' | 'Heading2'): string {
  if (!hasContent(b)) return '';
  const heading = para(
    run(b.title || 'Untitled')
      + (copy === 'team' && b.teamOnly ? run('   team only', '<w:b w:val="0"/><w:i/><w:color w:val="6B7280"/>') : ''),
    `<w:pStyle w:val="${style}"/>`,
  );
  if (b.kind === 'text') {
    return heading + b.body.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => para(run(l))).join('');
  }
  if (b.kind === 'checklist') {
    return heading + b.items.filter((i) => i.text.trim())
      .map((i) => para(run(`${i.done ? '\u2611' : '\u2610'}  ${i.text.trim()}`))).join('');
  }
  // A body that ends in a table is one Word repairs on opening, so a table is
  // always followed by a paragraph: here, a little space before what comes next.
  return heading + table(b) + para('');
}

/** word/document.xml for the whole series, or for one night. */
export function meetingDocumentXml(m: EvangelisticMeeting, nightId: string | null, copy: MeetingCopy = 'shared'): string {
  const night = nightId ? m.nights.find((n) => n.id === nightId) : undefined;
  const parts: string[] = [];
  parts.push(para(run(m.name || 'Evangelistic meetings'), '<w:pStyle w:val="Title"/>'));
  const where = [m.church, m.place].filter(Boolean).join(' · ');
  if (where) parts.push(para(run(where), '<w:pStyle w:val="Subtitle"/>'));
  const when = night ? nightLabel(m, night.id) : seriesDates(m);
  if (when) parts.push(para(run(when), '<w:pStyle w:val="Subtitle"/>'));
  if (night?.topic) parts.push(para(run(night.topic, '<w:b/>'), '<w:pStyle w:val="Subtitle"/>'));
  if (m.tagline) parts.push(para(run(m.tagline, '<w:i/>'), '<w:pStyle w:val="Subtitle"/>'));
  if (copy === 'team') parts.push(para(run('Team copy, with every block'), '<w:pStyle w:val="Subtitle"/>'));

  if (night) {
    for (const b of blocksFor(night.blocks, copy)) parts.push(block(b, copy, 'Heading1'));
  } else {
    for (const b of blocksFor(m.blocks, copy)) parts.push(block(b, copy, 'Heading1'));
    m.nights.forEach((n, i) => {
      const label = [`Night ${i + 1}`, dateLabel(n.date), nightHours(n)].filter(Boolean).join(' · ');
      parts.push(para(run(label), '<w:pStyle w:val="Heading1"/>'));
      if (n.topic) parts.push(para(run(n.topic, '<w:b/>')));
      for (const b of blocksFor(n.blocks, copy)) parts.push(block(b, copy, 'Heading2'));
    });
  }
  parts.push(para(''));

  return HEAD
    + `<w:document xmlns:w="${W}"><w:body>${parts.join('')}`
    + `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>`
    + `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/>`
    + '</w:sectPr></w:body></w:document>';
}

/** word/styles.xml, in the meeting's own colour and heading face. */
export function meetingStylesXml(m: EvangelisticMeeting): string {
  const face = HEADING_FACES[m.look.headings].word;
  const heads = `<w:rFonts w:ascii="${face}" w:hAnsi="${face}" w:cs="${face}"/>`;
  const words = hex(wordColour(m.look));
  const line = hex(m.look.colour);
  const align = m.look.align === 'left' ? 'left' : 'center';
  // pPr children in schema order: keepNext, pBdr, spacing, jc, outlineLvl.
  // rPr children in schema order: rFonts, b, color, sz, szCs.
  const heading = (styleId: string, name: string, size: number, rule: number, before: number, level: number) =>
    `<w:style w:type="paragraph" w:styleId="${styleId}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>`
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:keepNext/>'
    + (rule ? `<w:pBdr><w:bottom w:val="single" w:sz="${rule}" w:space="2" w:color="${line}"/></w:pBdr>` : '')
    + `<w:spacing w:before="${before}" w:after="80"/><w:outlineLvl w:val="${level}"/></w:pPr>`
    + `<w:rPr>${heads}<w:b/><w:color w:val="${words}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return HEAD + `<w:styles xmlns:w="${W}">`
    + '<w:docDefaults>'
    + '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
    + '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    + '</w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + `<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${line}"/></w:pBdr>`
    + `<w:spacing w:after="80"/><w:jc w:val="${align}"/></w:pPr>`
    + `<w:rPr>${heads}<w:b/><w:color w:val="${words}"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>`
    + '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + `<w:pPr><w:spacing w:after="40"/><w:jc w:val="${align}"/></w:pPr>`
    + '<w:rPr><w:color w:val="374151"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>'
    + heading('Heading1', 'heading 1', 28, 8, 320, 0)
    + heading('Heading2', 'heading 2', 24, 0, 200, 1)
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>'
    + '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>'
    + '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
    + '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>'
    + '</w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
}

export function meetingDocxParts(
  m: EvangelisticMeeting,
  nightId: string | null,
  copy: MeetingCopy = 'shared',
  when: Date = new Date(),
): Record<string, string> {
  const at = nightId ? m.nights.findIndex((n) => n.id === nightId) : -1;
  const title = [m.name || 'Evangelistic meetings', at >= 0 && `night ${at + 1}`, copy === 'team' && 'team copy']
    .filter(Boolean).join(', ');
  return wordPackage(meetingDocumentXml(m, nightId, copy), meetingStylesXml(m), title, when);
}

/** The finished .docx, as bytes. */
export function meetingToDocx(
  m: EvangelisticMeeting,
  nightId: string | null,
  copy: MeetingCopy = 'shared',
  when: Date = new Date(),
): Uint8Array {
  return zipVault(
    Object.entries(meetingDocxParts(m, nightId, copy, when)).map(([path, text]) => ({ path, text })),
    when.getTime(),
  );
}
