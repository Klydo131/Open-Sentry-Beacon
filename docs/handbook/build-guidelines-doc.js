#!/usr/bin/env node
// The guidelines handbook, as a Word document.
//
// SAME SOURCE AS THE PDF, ON PURPOSE. docs/HANDBOOK.md is the one place the
// app's guidelines are written. build-pdf.js renders it for printing; this
// renders it for somebody who needs to edit it, cut it down, add their own
// church's names to it and send it on. A second hand-written copy would be a
// third thing to keep in step, and the copy that fell behind would be the one
// a church actually read.
//
//   node docs/handbook/build-guidelines-doc.js
//
// Lands in docs/handbook/pdf/ beside the PDF. Needs `npm install docx` in this
// directory; docx is not a dependency of the app and should not become one.

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, PageBreak, ImageRun,
} = require('docx');

const SRC = path.join(__dirname, '..', 'HANDBOOK.md');
const OUT = path.join(__dirname, 'pdf');
const NAVY = '1B2A4A';
const GOLD = 'C9A227';
const GREY = '5A6472';
const TOTAL = 9360;

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------
// Bold, italic and code, and nothing else. HANDBOOK.md uses exactly those, and
// a general Markdown parser here would be several hundred lines maintained for
// constructs the source never contains.
function runs(text, base = {}) {
  const out = [];
  // The order matters: ** before *, or bold is read as two italics.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), size: 21, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), bold: true, size: 21, ...base }));
    } else if (tok.startsWith('`')) {
      out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: 19, color: '20262F', ...base }));
    } else {
      out.push(new TextRun({ text: tok.slice(1, -1), italics: true, size: 21, ...base }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), size: 21, ...base }));
  return out.length ? out : [new TextRun({ text: '', size: 21, ...base })];
}

const para = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 130 }, children: runs(text), ...opts });

const bullet = (text) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: runs(text) });

const numbered = (text) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: runs(text) });

/** A callout. The source writes these as blockquotes beginning with a label. */
function callout(label, lines) {
  const alarming = /CAUTION|IMPORTANT|WARNING/i.test(label);
  return lines.map((line, i) => new Paragraph({
    spacing: { before: i === 0 ? 130 : 0, after: i === lines.length - 1 ? 190 : 60 },
    shading: { type: ShadingType.CLEAR, fill: alarming ? 'FDECEC' : 'FFF8E1' },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: alarming ? '9B2C2C' : GOLD, space: 10 } },
    children: i === 0
      ? [new TextRun({ text: `${label}  `, bold: true, size: 21, color: alarming ? '8A1F1F' : '7A5C00' }),
         ...runs(line, { color: alarming ? '5C1414' : '4A3B00' })]
      : runs(line, { color: alarming ? '5C1414' : '4A3B00' }),
  }));
}

/**
 * A screenshot, with its caption under it.
 *
 * The handbook got pictures on 2 October 2026, and without this every one of
 * them would have come out of the Word copy as a line of Markdown. A phone
 * screen is placed at about the width of a phone (62 mm, as in the PDF); a
 * wider screen gets most of the page. A picture that is not there is skipped
 * with a warning, the way the PDF builder does it.
 */
function figure(alt, src) {
  const file = path.join(path.dirname(SRC), src);
  if (!/\.png$/i.test(file) || !fs.existsSync(file)) {
    console.error(`  ! skipped picture ${src}`);
    return [];
  }
  const data = fs.readFileSync(file);
  const w = data.readUInt32BE(16);
  const h = data.readUInt32BE(20);
  const width = h > w * 1.4 ? 234 : 600;  // pixels at 96 to the inch
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      keepNext: true,
      children: [new ImageRun({
        type: 'png',
        data,
        transformation: { width, height: Math.round((width * h) / w) },
        altText: { name: path.basename(src), title: alt, description: alt },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: alt, italics: true, size: 17, color: GREY })],
    }),
  ];
}

const splitRow = (line) =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function table(rows) {
  const [header, ...body] = rows;
  const width = Math.floor(TOTAL / header.length);
  const cell = (text, { bold = false, fill = null }) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [new Paragraph({
      children: runs(text, bold ? { bold: true, color: 'FFFFFF' } : {}),
      spacing: { after: 0 },
    })],
  });
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    rows: [
      new TableRow({ children: header.map((h) => cell(h, { bold: true, fill: NAVY })) }),
      ...body.map((r, i) => new TableRow({
        children: r.map((c) => cell(c, { fill: i % 2 ? 'F7F8FA' : null })),
      })),
    ],
  });
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

function convert(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // A picture on a line of its own.
    const picture = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (picture) { out.push(...figure(picture[1], picture[2])); i += 1; continue; }

    // A table: a header row, a separator, then rows.
    if (line.trim().startsWith('|') && (lines[i + 1] || '').includes('---')) {
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(table(rows));
      out.push(new Paragraph({ spacing: { after: 180 }, children: [] }));
      continue;
    }

    // A callout: one or more blockquote lines, the first carrying the label.
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        const text = lines[i].replace(/^>\s?/, '').trim();
        if (text) body.push(text);
        i += 1;
      }
      // "**NOTE** . Two things about backups" -> label, then the rest.
      const first = body.shift() || '';
      const m = first.match(/^\*\*([A-Z ]+)\*\*\s*[^A-Za-z0-9]*\s*(.*)$/);
      const label = m ? m[1].trim() : 'NOTE';
      const rest = m ? m[2] : first;
      out.push(...callout(label, [rest, ...body].filter(Boolean)));
      continue;
    }

    // A fenced code block.
    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1;
      out.push(new Paragraph({
        spacing: { before: 90, after: 170 },
        shading: { type: ShadingType.CLEAR, fill: 'F2F4F7' },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
        children: code.flatMap((l, n) => [
          ...(n ? [new TextRun({ break: 1 })] : []),
          new TextRun({ text: l, font: 'Consolas', size: 18, color: '20262F' }),
        ]),
      }));
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const depth = h[1].length;
      // A new part starts on its own page, the way a printed handbook reads.
      if (depth === 2) out.push(new Paragraph({ children: [new PageBreak()] }));
      out.push(new Paragraph({
        heading: depth === 1 ? HeadingLevel.TITLE
          : depth === 2 ? HeadingLevel.HEADING_1
          : depth === 3 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: depth <= 2 ? 240 : 200, after: 120 },
        children: [new TextRun({
          text: h[2].replace(/[*`]/g, ''),
          bold: true,
          color: depth <= 2 ? NAVY : '2C3A57',
          size: depth === 1 ? 44 : depth === 2 ? 32 : depth === 3 ? 26 : 23,
        })],
      }));
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) { out.push(bullet(line.replace(/^[-*]\s+/, ''))); i += 1; continue; }
    if (/^\d+\.\s+/.test(line)) { out.push(numbered(line.replace(/^\d+\.\s+/, ''))); i += 1; continue; }
    if (/^---+$/.test(line.trim())) { i += 1; continue; }

    out.push(para(line.trim()));
    i += 1;
  }
  return out;
}

const md = fs.readFileSync(SRC, 'utf8');
const doc = new Document({
  creator: 'Open Sentry Beacon',
  title: 'Hope Beacon: The Complete Handbook',
  description: 'Guidelines and instructions for running Hope Beacon.',
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children: [
      ...convert(md),
      new Paragraph({
        spacing: { before: 400 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: 'Open Sentry Beacon is free software under the AGPL-3.0-only. '
              + 'This handbook contains no keys, no passwords and no member details.',
          size: 18, color: GREY, italics: true,
        })],
      }),
    ],
  }],
});

fs.mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, 'Sentry-Beacon-Handbook.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(dest, buf);
  console.log(`${path.relative(process.cwd(), dest)}  (${Math.round(buf.length / 1024)} KB)`);
});
