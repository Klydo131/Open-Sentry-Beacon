// Evangelistic meetings as a picture: one night's program, or the whole series
// at a glance, for a group chat, a phone's gallery, or Canva's free Upload.
//
// Drawn on the device, like the Sabbath program's picture
// (lib/sabbath-program-picture.ts), in the meeting's own colour and heading
// face. It is always what is shared: a team-only block is never drawn.
//
// A LIST'S COLUMNS ON A PICTURE. A list can have up to six columns, and six
// columns of text do not fit 1080 pixels at a size anybody can read on a
// phone. So a line is drawn as its first column, in bold on the left, and the
// rest of it on the right, joined by a dot: "7:00 PM | Song service · David
// Cruz". The Word file keeps the real columns.

import { dateLabel } from '@/lib/sabbath-program';
import { PICTURE_WIDTH, wrap } from '@/lib/sabbath-program-picture';
import {
  HEADING_FACES, blocksFor, filledRows, hasContent, nightHours, nightLabel, seriesDates, wordColour,
  type EvangelisticMeeting, type MeetingBlock,
} from '@/lib/evangelistic-meeting';

const MARGIN = 80;
const INNER = PICTURE_WIDTH - 2 * MARGIN;
const LEFT_COLUMN = 300;
const GAP = 32;
const RIGHT_COLUMN = INNER - LEFT_COLUMN - GAP;
const MAX_HEIGHT = 14000;

const INK = '#1f2937';
const SOFT = '#4b5563';
const RULE = '#e5e7eb';
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function layout(ctx: CanvasRenderingContext2D, m: EvangelisticMeeting, nightId: string | null, draw: boolean): number {
  const night = nightId ? m.nights.find((n) => n.id === nightId) : undefined;
  const face = HEADING_FACES[m.look.headings].css;
  const words = wordColour(m.look);
  const centred = m.look.align !== 'left';
  const x0 = centred ? PICTURE_WIDTH / 2 : MARGIN;
  const align: CanvasTextAlign = centred ? 'center' : 'left';
  let y = MARGIN;

  const text = (s: string, x: number, font: string, color: string, a: CanvasTextAlign = 'left') => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = a;
    ctx.fillText(s, x, y);
  };
  const lines = (s: string, font: string, width: number) => {
    ctx.font = font;
    return wrap((t) => ctx.measureText(t).width, s, width);
  };
  const bar = (height: number, color: string) => {
    if (!draw) return;
    ctx.fillStyle = color;
    ctx.fillRect(MARGIN, y, INNER, height);
  };

  // The top: a band of the meeting's colour, its name, where, when.
  bar(8, m.look.colour);
  y += 40;
  const titleFont = `bold 66px ${face}`;
  for (const l of lines(m.name || 'Evangelistic meetings', titleFont, INNER)) {
    y += 70;
    text(l, x0, titleFont, words, align);
  }
  const subFont = `34px ${SANS}`;
  for (const s of [[m.church, m.place].filter(Boolean).join(' · '), night ? nightLabel(m, night.id) : seriesDates(m)]) {
    if (!s) continue;
    for (const l of lines(s, subFont, INNER)) {
      y += 48;
      text(l, x0, subFont, SOFT, align);
    }
  }
  if (night?.topic) {
    const topicFont = `bold 44px ${face}`;
    y += 14;
    for (const l of lines(night.topic, topicFont, INNER)) {
      y += 56;
      text(l, x0, topicFont, INK, align);
    }
  }
  if (m.tagline) {
    const tagFont = `italic 34px ${SANS}`;
    for (const l of lines(m.tagline, tagFont, INNER)) {
      y += 48;
      text(l, x0, tagFont, INK, align);
    }
  }
  y += 30;

  const heading = (title: string) => {
    y += 66;
    text(title, MARGIN, `bold 44px ${face}`, words);
    y += 18;
    bar(3, m.look.colour);
    y += 6;
  };
  // A line of two columns: bold on the left, the rest on the right.
  const pair = (left: string, right: string) => {
    const leftFont = `bold 32px ${SANS}`;
    const rightFont = `32px ${SANS}`;
    const l = left ? lines(left, leftFont, right ? LEFT_COLUMN : INNER) : [];
    const r = right ? lines(right, rightFont, left ? RIGHT_COLUMN : INNER) : [];
    const rows = Math.max(l.length, r.length, 1);
    for (let i = 0; i < rows; i++) {
      y += 42;
      if (l[i]) text(l[i], MARGIN, leftFont, INK);
      if (r[i]) text(r[i], left ? MARGIN + LEFT_COLUMN + GAP : MARGIN, rightFont, INK);
    }
    y += 16;
    bar(2, RULE);
  };

  const block = (b: MeetingBlock) => {
    if (!hasContent(b)) return;
    heading(b.title || 'Untitled');
    if (b.kind === 'text') {
      const font = `32px ${SANS}`;
      for (const para of b.body.split('\n').map((p) => p.trim()).filter(Boolean)) {
        for (const l of lines(para, font, INNER)) {
          y += 44;
          text(l, MARGIN, font, INK);
        }
        y += 10;
      }
    } else if (b.kind === 'checklist') {
      for (const i of b.items.filter((x) => x.text.trim())) pair('', `\u2022  ${i.text.trim()}${i.done ? ' (done)' : ''}`);
    } else {
      for (const [first, ...rest] of filledRows(b)) {
        const right = rest.filter(Boolean).join(' · ');
        // A list of one column is drawn across the whole width.
        if (b.columns.length === 1 || !right) pair('', first);
        else pair(first, right);
      }
    }
  };

  if (night) {
    for (const b of blocksFor(night.blocks, 'shared')) block(b);
  } else {
    for (const b of blocksFor(m.blocks, 'shared')) block(b);
    if (m.nights.length) {
      heading('The nights');
      m.nights.forEach((n, i) => {
        const when = [dateLabel(n.date), nightHours(n)].filter(Boolean).join(', ');
        pair(`Night ${i + 1}`, [when, n.topic].filter(Boolean).join(' · ') || ' ');
      });
    }
  }
  return y + MARGIN;
}

/** The meetings drawn onto a canvas, as tall as they need to be. */
export function drawMeeting(m: EvangelisticMeeting, nightId: string | null, doc: Document = document): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (!measure) throw new Error('This browser cannot draw pictures.');
  const height = layout(measure, m, nightId, false);
  const scale = height > MAX_HEIGHT ? MAX_HEIGHT / height : 1;
  canvas.width = Math.round(PICTURE_WIDTH * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw pictures.');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PICTURE_WIDTH, height);
  ctx.textBaseline = 'alphabetic';
  layout(ctx, m, nightId, true);
  return canvas;
}

/** The picture as a PNG file's bytes. */
export function meetingPicture(m: EvangelisticMeeting, nightId: string | null): Promise<Blob> {
  const canvas = drawMeeting(m, nightId);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))), 'image/png');
  });
}
