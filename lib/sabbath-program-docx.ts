// A Sabbath program as a Word document (.docx), written in the browser.
//
// ONE FILE FOR WORD AND FOR GOOGLE DOCS. The owner asked for "words or docs".
// Google Docs opens a .docx as it is (upload it to Drive, or open it from the
// Google Docs app on a phone), and so do Pages and LibreOffice. A second format
// would be a second thing to keep right for nothing a person could tell apart.
//
// WHAT IS IN IT, AND WHY IT IS THIS SMALL. A .docx is a zip of seven short XML
// parts, and the app already writes zips by hand for the study room's Obsidian
// export (zipVault in lib/study/obsidian.ts, checked against a real `unzip`),
// so that writer is used rather than a second one. Only what a program needs is written: a title, the
// date, the theme, one heading and one table per part of the day, and the
// announcements. Fonts are Georgia and Arial because Word, Google Docs, Pages
// and LibreOffice all have them or a metric twin; anything fancier is
// substituted by whichever program opens it, and then the layout moves.
//
// THE ORDER OF ELEMENTS IS NOT STYLE. Word validates each part against its
// schema, and an element in the wrong place (a <w:jc> before a <w:spacing>)
// makes it refuse the whole file as "unreadable content". Every property list
// below is written in the order the schema gives.
//
// Nothing here reaches a server. The file is made on the device and handed to
// the person who asked for it.

import { APP_NAME } from '@/lib/brand';
import { zipVault } from '@/lib/study/obsidian';
import {
  dateLabel, filledExtras, filledLines, formatClock, printable, schedule, type ProgramCopy, type SabbathProgram,
} from '@/lib/sabbath-program';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** "Sabbath-program-2026-10-03.docx", or "...-platform.docx" for the platform copy. */
export function programFileName(p: SabbathProgram, copy: ProgramCopy = 'congregation'): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : 'undated';
  return `Sabbath-program-${day}${copy === 'platform' ? '-platform' : ''}.docx`;
}

/** Text made safe to sit inside XML, as content or as an attribute. */
export function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// A4 with 2 cm margins, in twentieths of a point.
const PAGE = { w: 11906, h: 16838, margin: 1134 };
const TEXT_WIDTH = PAGE.w - 2 * PAGE.margin; // 9638
// Part, details, who: the part is short, the details carry hymn titles.
const COLUMNS = [3080, 3958, 2600];
// The platform copy puts each line's start time first.
const PLATFORM_COLUMNS = [1250, 2600, 3488, 2300];

/** A run of text. Spaces are kept, because a hymn number padded by hand is still meant. */
function run(text: string, props = ''): string {
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function para(content: string, props = ''): string {
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`;
}

/** A table cell holding paragraphs already built; it must hold at least one. */
function cellOf(width: number, paragraphs: string[]): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraphs.join('') || para('')}</w:tc>`;
}

function cell(width: number, content: string): string {
  return cellOf(width, [para(content)]);
}

interface Row { at: string; part: string; detail: string; who: string; note: string }

function section(title: string, time: string, rows: Row[], platform: boolean): string {
  const heading = para(
    run(title || 'Untitled part') + (time ? run(`   ${time}`, '<w:b w:val="0"/><w:color w:val="4B5563"/>') : ''),
    '<w:pStyle w:val="Heading1"/>',
  );
  if (!rows.length) return heading;
  const columns = platform ? PLATFORM_COLUMNS : COLUMNS;
  const grid = columns.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const [first, ...others] = platform ? columns.slice(1) : columns;
  const body = rows.map((r) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
    + (platform ? cell(columns[0], r.at ? run(r.at, '<w:color w:val="4B5563"/>') : '') : '')
    + cell(first, r.part ? run(r.part, '<w:b/>') : '')
    + cellOf(others[0], [
      para(r.detail ? run(r.detail) : ''),
      // A note is for the people leading, so it is only ever on their copy.
      ...(platform && r.note
        ? [para(run(`Note: ${r.note}`, '<w:i/><w:color w:val="6B7280"/><w:sz w:val="18"/><w:szCs w:val="18"/>'))]
        : []),
    ])
    + cell(others[1], r.who ? run(r.who, '<w:i/>') : '')
    + '</w:tr>').join('');
  return heading
    + '<w:tbl><w:tblPr>'
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
    + `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

/** word/document.xml: the program itself, as the congregation's copy or the platform's. */
export function documentXml(p: SabbathProgram, copy: ProgramCopy = 'congregation'): string {
  const platform = copy === 'platform';
  const parts: string[] = [];
  parts.push(para(run(p.church || 'Sabbath program'), '<w:pStyle w:val="Title"/>'));
  const when = dateLabel(p.date);
  if (when) parts.push(para(run(when), '<w:pStyle w:val="Subtitle"/>'));
  if (p.theme) parts.push(para(run(p.theme, '<w:i/>'), '<w:pStyle w:val="Subtitle"/>'));
  for (const x of filledExtras(p)) {
    parts.push(para(run(`${x.label}: `, '<w:b/>') + run(x.value), '<w:pStyle w:val="Subtitle"/>'));
  }
  if (platform) parts.push(para(run('Platform copy, with times and notes'), '<w:pStyle w:val="Subtitle"/>'));

  for (const s of p.sections) {
    if (!printable(s)) continue;
    const plan = schedule(s);
    const span = platform && plan.start !== null && plan.end !== null
      ? `${formatClock(plan.start, plan.twelve)} to ${formatClock(plan.end, plan.twelve)}`
      : s.time;
    parts.push(section(s.title, span, filledLines(s).map((l) => ({
      at: plan.startsById[l.id] ?? '', part: l.part, detail: l.detail, who: l.who, note: l.note,
    })), platform));
  }

  const notes = p.notes.split('\n').map((n) => n.trim()).filter(Boolean);
  if (notes.length) {
    parts.push(para(run('Announcements'), '<w:pStyle w:val="Heading1"/>'));
    for (const n of notes) parts.push(para(run(n)));
  }
  // A body that ends in a table is one Word repairs on opening, by adding the
  // paragraph it insists on. Ending with one keeps it from asking.
  parts.push(para(''));

  return HEAD
    + `<w:document xmlns:w="${W}"><w:body>${parts.join('')}`
    + `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>`
    + `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/>`
    + '</w:sectPr></w:body></w:document>';
}

/** word/styles.xml: the four styles the document uses, so Word lists them by name. */
export function stylesXml(): string {
  const serif = '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>';
  return HEAD + `<w:styles xmlns:w="${W}">`
    + '<w:docDefaults>'
    + '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
    + '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    + '</w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:spacing w:after="40"/><w:jc w:val="center"/></w:pPr>'
    + `<w:rPr>${serif}<w:b/><w:color w:val="0B1F3A"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>`
    + '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:spacing w:after="40"/><w:jc w:val="center"/></w:pPr>'
    + '<w:rPr><w:color w:val="374151"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
    + '<w:next w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:keepNext/>'
    + '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="C9A227"/></w:pBdr>'
    + '<w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr>'
    + `<w:rPr>${serif}<w:b/><w:color w:val="0B1F3A"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>`
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>'
    + '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>'
    + '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
    + '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>'
    + '</w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
}

/** W3C date-time without milliseconds, which is the form docProps accepts. */
const stamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Every part of the file, by its path inside the zip. */
export function docxParts(
  p: SabbathProgram,
  when: Date = new Date(),
  copy: ProgramCopy = 'congregation',
): Record<string, string> {
  const title = ['Sabbath program', copy === 'platform' && 'platform copy', dateLabel(p.date)]
    .filter(Boolean).join(', ');
  return {
    '[Content_Types].xml': HEAD
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>',
    '_rels/.rels': HEAD
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>',
    'word/_rels/document.xml.rels': HEAD
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>',
    'word/document.xml': documentXml(p, copy),
    'word/styles.xml': stylesXml(),
    // The file's own properties name the program, never the person who made it:
    // a file that gets forwarded should not carry its author's name inside it.
    'docProps/core.xml': HEAD
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
      + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
      + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xml(title)}</dc:title>`
      + `<dc:creator>${xml(APP_NAME)}</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp(when)}</dcterms:created>`
      + `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp(when)}</dcterms:modified>`
      + '</cp:coreProperties>',
    'docProps/app.xml': HEAD
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
      + `<Application>${xml(APP_NAME)}</Application>`
      + '</Properties>',
  };
}

/** The finished .docx, as bytes. */
export function programToDocx(
  p: SabbathProgram,
  when: Date = new Date(),
  copy: ProgramCopy = 'congregation',
): Uint8Array {
  return zipVault(
    Object.entries(docxParts(p, when, copy)).map(([path, text]) => ({ path, text })),
    when.getTime(),
  );
}
