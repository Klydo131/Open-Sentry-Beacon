// A Sabbath program as a picture: for a group chat, a phone's gallery, or
// Canva.
//
// WHY A PICTURE AS WELL AS THE WORD FILE. Most people a program is for will see
// it on a phone, in Messenger or Viber, and a Word file is the wrong thing to
// make somebody open there to find out when Sabbath School starts. A picture
// opens where it lands. It is also the most ordinary thing Canva's free plan
// takes as an upload, so a church that wants to design its bulletin can start
// from it (docs/SABBATH-PROGRAM-RESEARCH.md says why nothing here talks to
// Canva itself).
//
// DRAWN ON THE DEVICE, so it works with no signal and in any language the
// phone has fonts for: the text is laid out on a canvas, not sent anywhere to
// be rendered. It is the congregation's copy: no private notes, ever.
//
// Two passes over the same layout code, one to measure and one to draw, so the
// picture is exactly as tall as the program and nothing is cut off.

import { dateLabel, filledExtras, filledLines, printable, type SabbathProgram } from '@/lib/sabbath-program';

export const PICTURE_WIDTH = 1080;
const MARGIN = 80;
const INNER = PICTURE_WIDTH - 2 * MARGIN;
const PART_COLUMN = 360;
const GAP = 32;
const TEXT_COLUMN = INNER - PART_COLUMN - GAP;
// Taller than a phone will scroll comfortably, and well inside every browser's
// canvas limits (iOS Safari refuses a canvas over about 16.7 million pixels).
const MAX_HEIGHT = 14000;

const INK = '#1f2937';
const NAVY = '#0b1f3a';
const SOFT = '#4b5563';
const GOLD = '#c9a227';
const RULE = '#e5e7eb';

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** "Sabbath-program-2026-10-03.png". */
export function pictureFileName(p: SabbathProgram): string {
  return `Sabbath-program-${/^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : 'undated'}.png`;
}

/** Break text into lines no wider than `width`, splitting a word only when it alone is too wide. */
export function wrap(measure: (s: string) => number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (measure(tryLine) <= width) { line = tryLine; continue; }
      if (line) out.push(line);
      // A single word wider than the column: cut it, rather than let it run off.
      let rest = word;
      while (measure(rest) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut -= 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Lay the program out, drawing it only when `draw` is set. Returns the height it needs. */
function layout(ctx: CanvasRenderingContext2D, p: SabbathProgram, draw: boolean): number {
  let y = MARGIN;
  const text = (s: string, x: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const lines = (s: string, font: string, width: number) => {
    ctx.font = font;
    return wrap((t) => ctx.measureText(t).width, s, width);
  };

  // The top: the church, the day, the theme.
  if (draw) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(MARGIN, y - 40, INNER, 6);
  }
  y += 40;
  const titleFont = `bold 64px ${SERIF}`;
  for (const l of lines(p.church || 'Sabbath program', titleFont, INNER)) {
    y += 64;
    text(l, PICTURE_WIDTH / 2, titleFont, NAVY, 'center');
    y += 12;
  }
  const when = dateLabel(p.date);
  if (when) {
    y += 44;
    text(when, PICTURE_WIDTH / 2, `36px ${SANS}`, SOFT, 'center');
  }
  if (p.theme) {
    const themeFont = `italic 36px ${SERIF}`;
    for (const l of lines(p.theme, themeFont, INNER)) {
      y += 48;
      text(l, PICTURE_WIDTH / 2, themeFont, INK, 'center');
    }
  }
  const extraFont = `32px ${SANS}`;
  for (const x of filledExtras(p)) {
    for (const l of lines(`${x.label}: ${x.value}`, extraFont, INNER)) {
      y += 44;
      text(l, PICTURE_WIDTH / 2, extraFont, SOFT, 'center');
    }
  }
  y += 36;

  // Each part of the day: a heading with its time, then its lines.
  for (const s of p.sections) {
    if (!printable(s)) continue;
    y += 64;
    const head = `bold 44px ${SERIF}`;
    text(s.title || 'Untitled part', MARGIN, head, NAVY);
    if (s.time) text(s.time, PICTURE_WIDTH - MARGIN, `36px ${SANS}`, SOFT, 'right');
    y += 18;
    if (draw) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(MARGIN, y, INNER, 3);
    }
    y += 6;
    for (const l of filledLines(s)) {
      const partFont = `bold 32px ${SANS}`;
      const detailFont = `32px ${SANS}`;
      const whoFont = `italic 30px ${SANS}`;
      const left = lines(l.part, partFont, PART_COLUMN);
      const right = [
        ...(l.detail ? lines(l.detail, detailFont, TEXT_COLUMN).map((t) => ({ t, font: detailFont, color: INK })) : []),
        ...(l.who ? lines(l.who, whoFont, TEXT_COLUMN).map((t) => ({ t, font: whoFont, color: SOFT })) : []),
      ];
      const rows = Math.max(left.length, right.length, 1);
      const top = y;
      for (let i = 0; i < rows; i++) {
        y += 42;
        if (left[i]) text(left[i], MARGIN, partFont, NAVY);
        if (right[i]) text(right[i].t, MARGIN + PART_COLUMN + GAP, right[i].font, right[i].color);
      }
      y = Math.max(y, top + 42) + 18;
      if (draw) {
        ctx.fillStyle = RULE;
        ctx.fillRect(MARGIN, y, INNER, 2);
      }
    }
  }

  const notes = p.notes.split('\n').map((n) => n.trim()).filter(Boolean);
  if (notes.length) {
    y += 64;
    text('Announcements', MARGIN, `bold 44px ${SERIF}`, NAVY);
    y += 18;
    if (draw) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(MARGIN, y, INNER, 3);
    }
    y += 6;
    const noteFont = `32px ${SANS}`;
    for (const n of notes) {
      for (const l of lines(n, noteFont, INNER)) {
        y += 44;
        text(l, MARGIN, noteFont, INK);
      }
      y += 10;
    }
  }
  return y + MARGIN;
}

/** The program drawn onto a canvas, as tall as it needs to be. */
export function drawProgram(p: SabbathProgram, doc: Document = document): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (!measure) throw new Error('This browser cannot draw pictures.');
  const height = layout(measure, p, false);
  // A very long program is drawn smaller rather than cut off.
  const scale = height > MAX_HEIGHT ? MAX_HEIGHT / height : 1;
  canvas.width = Math.round(PICTURE_WIDTH * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw pictures.');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PICTURE_WIDTH, height);
  ctx.textBaseline = 'alphabetic';
  layout(ctx, p, true);
  return canvas;
}

/** The picture as a PNG file's bytes. */
export function programPicture(p: SabbathProgram): Promise<Blob> {
  const canvas = drawProgram(p);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))), 'image/png');
  });
}
