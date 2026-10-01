// Five renderers, one report. See lib/live/report.ts for the description.
//
// NO NEW DEPENDENCIES, DELIBERATELY. This app runs on free tiers and ships to
// phones in a congregation; a spreadsheet library and a PDF library would be
// several hundred kilobytes downloaded by everybody so that a Director can save
// a file twice a year.
//
// WHAT EACH FORMAT ACTUALLY IS, because the file extensions are doing work:
//
//   CSV    plain text. Opens anywhere. No formatting, no second table, which is
//          why the sheet format exists as well.
//   .xls   an HTML table. Excel, Google Sheets, Numbers and LibreOffice have
//          all opened these for twenty years, and it keeps headings, several
//          tables and the notes, which CSV cannot.
//   .doc   an HTML document. Word and Google Docs open it and it stays
//          editable, which is the point: a church cuts it down and forwards it.
//   PDF    written by hand, byte by byte, in lib/pdf.ts. Fixed layout, nothing
//          to install, nobody can accidentally edit the figures.
//   print  the browser's own dialog, which every phone and computer can already
//          save as PDF and which lets somebody pick the paper.
//
// THE BRANDING IS A HEADER AND A FOOTER, not a logo file. An image would have
// to be embedded as base64 in four different ways and would be the thing that
// breaks when the brand changes; the name, the church and the date do the job.

import { Pdf, downloadBlob } from '@/lib/pdf';
import type { Report, ReportTable } from '@/lib/live/report';

const NAVY: [number, number, number] = [30, 42, 74];
const GOLD: [number, number, number] = [232, 184, 75];
const GREY: [number, number, number] = [90, 100, 114];

const slug = (s: string) =>
  s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'church';

const stampName = () => new Date().toISOString().slice(0, 10);

/** A file name somebody can find again in six months. */
function fileName(r: Report, ext: string): string {
  return `${slug(r.church)}-church-report-${stampName()}.${ext}`;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportToCsv(r: Report): string {
  const lines: string[][] = [];
  lines.push([r.app, r.church]);
  lines.push([r.title, r.generated]);
  lines.push([]);
  for (const section of r.sections) {
    lines.push([section.heading.toUpperCase()]);
    for (const p of section.paragraphs ?? []) lines.push([p]);
    for (const t of section.tables ?? []) {
      lines.push([]);
      lines.push([t.title]);
      lines.push([t.blurb]);
      lines.push(t.headers);
      for (const row of t.rows) lines.push(row.map(String));
      // THE NOTES GO IN THE FILE, not only on the screen. A column headed
      // "Active" with no definition beside it is how somebody concludes that
      // eleven of nineteen Guides are not working.
      for (const n of t.notes ?? []) lines.push([`NOTE: ${n}`]);
    }
    lines.push([]);
  }
  for (const f of r.footer) lines.push([f]);
  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// ---------------------------------------------------------------------------
// Shared HTML, used by the spreadsheet and the document
// ---------------------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function tableHtml(t: ReportTable, opts: { plain?: boolean } = {}): string {
  const th = opts.plain
    ? 'border:1px solid #999;padding:6px;font-weight:bold;background:#eee;text-align:left'
    : 'border:1px solid #c9cfda;padding:8px 10px;background:#1E2A4A;color:#fff;text-align:left';
  const td = opts.plain
    ? 'border:1px solid #999;padding:6px'
    : 'border:1px solid #dfe3ea;padding:8px 10px';
  return `
    <h3 style="font-family:Arial,sans-serif;color:#1E2A4A;margin:18px 0 2px">${esc(t.title)}</h3>
    <p style="font-family:Arial,sans-serif;color:#5A6472;margin:0 0 8px;font-size:13px">${esc(t.blurb)}</p>
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <tr>${t.headers.map((h) => `<th style="${th}">${esc(h)}</th>`).join('')}</tr>
      ${t.rows.map((row) => `<tr>${row.map((c) => `<td style="${td}">${esc(c)}</td>`).join('')}</tr>`).join('')}
    </table>
    ${(t.notes ?? []).map((n) => `<p style="font-family:Arial,sans-serif;font-size:12px;color:#5A6472;margin:6px 0 0"><b>Note.</b> ${esc(n)}</p>`).join('')}
  `;
}

function documentHtml(r: Report, opts: { plain?: boolean } = {}): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>${esc(r.church)} ${esc(r.title)}</title></head>
  <body style="margin:24px">
    <div style="border-bottom:3px solid #E8B84B;padding-bottom:10px;margin-bottom:18px">
      <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:1px;color:#5A6472;text-transform:uppercase">${esc(r.app)}</div>
      <div style="font-family:Arial,sans-serif;font-size:26px;font-weight:bold;color:#1E2A4A">${esc(r.church)}</div>
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#5A6472">${esc(r.title)} · ${esc(r.generated)}</div>
    </div>
    ${r.sections.map((s) => `
      <h2 style="font-family:Arial,sans-serif;color:#1E2A4A;margin:22px 0 4px">${esc(s.heading)}</h2>
      ${(s.paragraphs ?? []).map((p) => `<p style="font-family:Arial,sans-serif;font-size:13px;color:#333;margin:0 0 8px;max-width:52em">${esc(p)}</p>`).join('')}
      ${(s.tables ?? []).map((t) => tableHtml(t, opts)).join('')}
    `).join('')}
    <div style="border-top:1px solid #dfe3ea;margin-top:26px;padding-top:10px">
      ${r.footer.map((f) => `<p style="font-family:Arial,sans-serif;font-size:11px;color:#5A6472;margin:0 0 4px">${esc(f)}</p>`).join('')}
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// The five buttons
// ---------------------------------------------------------------------------

export function downloadCsv(r: Report) {
  downloadBlob(
    new Blob(['\uFEFF' + reportToCsv(r)], { type: 'text/csv;charset=utf-8' }),
    fileName(r, 'csv'),
  );
}

/**
 * A spreadsheet.
 *
 * The BOM and the charset matter: without them Excel on Windows opens a file of
 * accented names as mojibake, which is a bug reported as "the export is
 * corrupted" about a file that is fine.
 */
export function downloadSheet(r: Report) {
  downloadBlob(
    new Blob(['\uFEFF' + documentHtml(r, { plain: true })], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    }),
    fileName(r, 'xls'),
  );
}

export function downloadDoc(r: Report) {
  downloadBlob(
    new Blob(['\uFEFF' + documentHtml(r)], {
      type: 'application/msword;charset=utf-8',
    }),
    fileName(r, 'doc'),
  );
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Break a string to a column width, measured in characters at this size. */
function wrap(text: string, chars: number): string[] {
  const words = String(text).split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > chars) { if (line) out.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

export function downloadPdf(r: Report) {
  const pdf = new Pdf();
  const L = 48;
  const RIGHT = pdf.W - 48;
  let y = 0;

  const header = () => {
    pdf.rect(0, 0, pdf.W, 74, NAVY);
    pdf.rect(0, 74, pdf.W, 4, GOLD);
    pdf.text(L, 28, r.app.toUpperCase(), { size: 9, bold: true, color: [255, 255, 255] });
    pdf.text(L, 50, r.church, { size: 18, bold: true, color: [255, 255, 255] });
    pdf.text(L, 66, `${r.title} · ${r.generated}`, { size: 9, color: [200, 208, 222] });
    y = 108;
  };

  // A page break BEFORE the thing that would overflow, not after. Writing past
  // the bottom of an A4 sheet does not error; it just vanishes.
  const room = (need: number) => {
    if (y + need < pdf.H - 64) return;
    pdf.page();
    header();
  };

  header();

  for (const section of r.sections) {
    room(40);
    pdf.text(L, y, section.heading, { size: 14, bold: true, color: NAVY });
    y += 18;

    for (const p of section.paragraphs ?? []) {
      for (const line of wrap(p, 92)) {
        room(14);
        pdf.text(L, y, line, { size: 9.5, color: [40, 46, 58] });
        y += 13;
      }
      y += 5;
    }

    for (const t of section.tables ?? []) {
      room(46);
      pdf.text(L, y, t.title, { size: 11, bold: true, color: NAVY });
      y += 13;
      for (const line of wrap(t.blurb, 100)) {
        room(12);
        pdf.text(L, y, line, { size: 8.5, color: GREY });
        y += 11;
      }
      y += 4;

      const cols = t.headers.length;
      const width = (RIGHT - L) / cols;
      room(20);
      pdf.rect(L, y - 9, RIGHT - L, 16, NAVY);
      t.headers.forEach((h, i) => {
        pdf.text(L + 5 + i * width, y + 2, String(h).slice(0, 22), {
          size: 8.5, bold: true, color: [255, 255, 255],
        });
      });
      y += 18;

      t.rows.forEach((row, n) => {
        room(16);
        if (n % 2 === 1) pdf.rect(L, y - 9, RIGHT - L, 15, [244, 246, 249]);
        row.forEach((c, i) => {
          // Truncated rather than wrapped inside a cell: a table that reflows
          // to three lines per row stops being a table.
          const raw = String(c);
          const fit = Math.max(6, Math.floor(width / 4.6));
          pdf.text(L + 5 + i * width, y + 2, raw.length > fit ? `${raw.slice(0, fit - 1)}…` : raw,
            { size: 8.5, color: [40, 46, 58] });
        });
        y += 15;
      });
      y += 6;

      for (const note of t.notes ?? []) {
        for (const line of wrap(`Note. ${note}`, 108)) {
          room(12);
          pdf.text(L, y, line, { size: 8, color: GREY });
          y += 10;
        }
        y += 3;
      }
      y += 8;
    }
    y += 6;
  }

  room(50);
  y += 8;
  pdf.rect(L, y, RIGHT - L, 1, [223, 227, 234]);
  y += 14;
  for (const f of r.footer) {
    for (const line of wrap(f, 112)) {
      room(12);
      pdf.text(L, y, line, { size: 7.5, color: GREY });
      y += 10;
    }
  }

  downloadBlob(pdf.blob(), fileName(r, 'pdf'));
}
