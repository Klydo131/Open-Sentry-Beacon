// From a music PDF's ink (lib/music/pdf-ink.ts) to a Score the room can play
// and explain: staves, clefs, keys, times, notes, rhythms, voices, ties,
// words, loudness and tempo.
//
// Chosen by the owner on 6 October 2026 ("Read music PDFs on phone"), after
// being told plainly that no reader of printed music is perfect, the paid
// ones included. This one reads the PDFs that notation programs export with a
// SMuFL music font (MuseScore, Dorico and others): there, every symbol is a
// known character at an exact place, so the reading is geometry, not
// guesswork. How well it does is measured, not assumed:
// tests/the-music-room.mjs reads PDFs MuseScore made from scores whose notes
// are known, and counts what it gets right.
//
// What it does not read yet, and says so: tuplets, repeats (it plays
// straight through, as the MusicXML reader does), lyrics beyond the first
// verse, cross-staff notes, and the fonts of programs that do not use SMuFL
// (older Sibelius and Finale). Grace notes are left out on purpose: they take
// no time of their own.

import type { Glyph, PageInk, Stroke, Words } from '@/lib/music/pdf-ink';
import type { Score, ScoreLine, ScoreMark, ScoreNote } from '@/lib/music/musicxml';

export class PdfScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfScoreError';
  }
}

// ---- THE SYMBOLS (SMuFL code points) ---------------------------------------

const CLEF: Record<number, { step: number; octave: number }> = {
  0xe050: { step: 4, octave: 4 }, // G clef: its curl sits on G4
  0xe052: { step: 4, octave: 3 }, // G clef, octave below (tenor)
  0xe053: { step: 4, octave: 5 }, // G clef, octave above
  0xe062: { step: 3, octave: 3 }, // F clef: its dots either side of F3
  0xe064: { step: 3, octave: 2 }, // F clef, octave below
  0xe05c: { step: 0, octave: 4 }, // C clef: its middle on C4
};
const HEAD: Record<number, number> = { 0xe0a0: 8, 0xe0a2: 4, 0xe0a3: 2, 0xe0a4: 1 };
const REST: Record<number, number> = { 0xe4e2: 8, 0xe4e3: 4, 0xe4e4: 2, 0xe4e5: 1, 0xe4e6: 0.5, 0xe4e7: 0.25, 0xe4e8: 0.125 };
const FLAG: Record<number, number> = { 0xe240: 1, 0xe241: 1, 0xe242: 2, 0xe243: 2, 0xe244: 3, 0xe245: 3, 0xe246: 4, 0xe247: 4 };
const ACCIDENTAL: Record<number, number> = { 0xe260: -1, 0xe261: 0, 0xe262: 1, 0xe263: 2, 0xe264: -2 };
const DOT = 0xe1e7;
const TIME_DIGIT = (cp: number) => (cp >= 0xe080 && cp <= 0xe089 ? cp - 0xe080 : null);
const COMMON = 0xe08a;
const CUT = 0xe08b;
const DYNAMIC_LETTER: Record<number, string> = { 0xe520: 'p', 0xe521: 'm', 0xe522: 'f', 0xe523: 'r', 0xe524: 's', 0xe525: 'z', 0xe526: 'n' };
const DYNAMIC_WORD: Record<number, string> = {
  0xe527: 'pppppp', 0xe528: 'ppppp', 0xe529: 'pppp', 0xe52a: 'ppp', 0xe52b: 'pp', 0xe52c: 'mp', 0xe52d: 'mf', 0xe52e: 'pf',
  0xe52f: 'ff', 0xe530: 'fff', 0xe531: 'ffff', 0xe532: 'fffff', 0xe533: 'ffffff', 0xe534: 'fp', 0xe535: 'fz', 0xe536: 'sf',
  0xe537: 'sfp', 0xe538: 'sfpp', 0xe539: 'sfz', 0xe53a: 'sfzp', 0xe53b: 'sffz', 0xe53c: 'rf', 0xe53d: 'rfz',
};
/** The metronome's note, in quarter notes: ♩ = 1, half = 2, eighth = ½. */
const METRONOME: Record<number, number> = { 0xeca3: 2, 0xeca5: 1, 0xeca7: 0.5, 0xeca6: 1, 0xeca4: 2, 0xeca8: 0.5, 0xe1d3: 2, 0xe1d5: 1, 0xe1d7: 0.5 };
const DOTTED_METRONOME = 0xecb7;

const STEP_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B, as steps
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

// ---- THE PAGE'S GEOMETRY -----------------------------------------------------

interface Staff {
  page: number;
  /** y of the top and bottom lines; y grows down the page. */
  top: number;
  bottom: number;
  /** The distance between two lines. */
  sp: number;
  x0: number;
  x1: number;
}

/** Staves: five horizontal lines, evenly spaced, side by side. */
export function findStaves(strokes: Stroke[], page = 0): Staff[] {
  const flat = strokes.filter((s) => Math.abs(s.y1 - s.y2) < 0.3 && Math.abs(s.x2 - s.x1) >= 12);
  // Lines at the same height, joined across the bars they were drawn in.
  const rows = new Map<number, { y: number; x0: number; x1: number }[]>();
  for (const s of flat) {
    const y = (s.y1 + s.y2) / 2;
    const key = Math.round(y * 4);
    const list = rows.get(key) ?? [];
    list.push({ y, x0: Math.min(s.x1, s.x2), x1: Math.max(s.x1, s.x2) });
    rows.set(key, list);
  }
  const lines: { y: number; x0: number; x1: number }[] = [];
  for (const list of rows.values()) {
    list.sort((a, b) => a.x0 - b.x0);
    let cur = { ...list[0] };
    for (const seg of list.slice(1)) {
      if (seg.x0 <= cur.x1 + 2) cur.x1 = Math.max(cur.x1, seg.x1);
      else { lines.push(cur); cur = { ...seg }; }
    }
    lines.push(cur);
  }
  lines.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const used = new Set<number>();
  const staves: Staff[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const first = lines[i];
    // The next four lines below, each the same distance on, over the same width.
    const chain = [i];
    let gap = 0;
    for (let j = i + 1; j < lines.length && chain.length < 5; j++) {
      if (used.has(j)) continue;
      const prev = lines[chain[chain.length - 1]];
      const line = lines[j];
      const overlap = Math.min(line.x1, first.x1) - Math.max(line.x0, first.x0);
      if (overlap < 0.8 * (first.x1 - first.x0)) continue;
      const d = line.y - prev.y;
      if (d < 2) continue;
      if (!gap) { if (d > 16) break; gap = d; chain.push(j); continue; }
      if (Math.abs(d - gap) <= 0.08 * gap) chain.push(j);
      else if (d > gap * 1.2) break;
    }
    if (chain.length === 5) {
      chain.forEach((k) => used.add(k));
      const ys = chain.map((k) => lines[k].y);
      staves.push({ page, top: ys[0], bottom: ys[4], sp: (ys[4] - ys[0]) / 4, x0: first.x0, x1: first.x1 });
    }
  }
  return staves.sort((a, b) => a.top - b.top);
}

/** Staves joined into systems by the line that opens them. */
export function systemsOf(staves: Staff[], strokes: Stroke[]): Staff[][] {
  const vertical = strokes.filter((s) => Math.abs(s.x1 - s.x2) < 0.3);
  const systems: Staff[][] = [];
  let current: Staff[] = [];
  for (const staff of staves) {
    const prev = current[current.length - 1];
    const joined = prev && Math.abs(prev.x0 - staff.x0) < 2 && vertical.some((v) => {
      const top = Math.min(v.y1, v.y2);
      const bottom = Math.max(v.y1, v.y2);
      return Math.abs(v.x1 - staff.x0) < 1.5 && top <= prev.top + 0.5 && bottom >= staff.top - 0.5;
    });
    if (prev && !joined) { systems.push(current); current = []; }
    current.push(staff);
  }
  if (current.length) systems.push(current);
  return systems;
}

// ---- READING ONE STAFF -------------------------------------------------------

interface Head {
  x: number;
  y: number;
  /** Staff position: 0 the bottom line, 1 the space above it. */
  pos: number;
  value: number;
  /** 1 a stem going up, -1 down, 0 none (a whole note). */
  dir: 1 | -1 | 0;
  stemX: number | null;
  /** Its stem's far end, where flags and beams are. */
  tip: number | null;
  dots: number;
  alter: number | null;
  midi?: number;
}

interface Event {
  x: number;
  heads: Head[];
  length: number;
  rest: boolean;
  voice: 1 | 2;
  start?: number;
}

const near = (a: number, b: number, d: number) => Math.abs(a - b) <= d;

function headWidth(sp: number) {
  return 1.18 * sp;
}

/** One staff's notes, measured against its own lines. */
export function readStaff(staff: Staff, glyphs: Glyph[], strokes: Stroke[], shapes: PageInk['shapes'], clefIn: Clef | null, keyIn: number) {
  const { sp, bottom } = staff;
  const posOf = (y: number) => Math.round((bottom - y) / (sp / 2));
  const mine = glyphs.filter((g) => g.y >= staff.top - 6 * sp && g.y <= bottom + 6 * sp && g.x >= staff.x0 - 2 && g.x <= staff.x1 + 2);
  const sorted = [...mine].sort((a, b) => a.x - b.x);

  // Clef, key and time, at the start of the staff.
  let clef = clefIn;
  const firstHeadX = sorted.find((g) => HEAD[g.cp] !== undefined || REST[g.cp] !== undefined)?.x ?? staff.x1;
  for (const g of sorted) {
    if (g.x > firstHeadX) break;
    const c = CLEF[g.cp];
    if (c) clef = { ...c, pos: posOf(g.y) };
  }
  const clefX = sorted.find((g) => CLEF[g.cp])?.x ?? staff.x0;
  const timeGlyphs = sorted.filter((g) => g.x < firstHeadX && (TIME_DIGIT(g.cp) !== null || g.cp === COMMON || g.cp === CUT));
  // The key signature: sharps or flats after the clef. The first note's own
  // sharp can sit in the same gap; it is the one with a note at its height
  // just to its right.
  const ownSign = (a: Glyph) => sorted.some((h) => HEAD[h.cp] !== undefined && h.x > a.x && h.x - a.x < 2.6 * sp && near(h.y, a.y, 0.3 * sp));
  const keyGlyphs = sorted.filter((g) => g.x > clefX && g.x < (timeGlyphs[0]?.x ?? firstHeadX) && ACCIDENTAL[g.cp] !== undefined && ACCIDENTAL[g.cp] !== 0 && !ownSign(g));
  let key = keyIn;
  if (keyGlyphs.length) key = keyGlyphs.length * Math.sign(ACCIDENTAL[keyGlyphs[0].cp]);
  const timeOf = (list: Glyph[]): Meter | null => {
    if (list.some((g) => g.cp === COMMON)) return { beats: 4, beatType: 4 };
    if (list.some((g) => g.cp === CUT)) return { beats: 2, beatType: 2 };
    const mid = (staff.top + bottom) / 2;
    const num = (part: Glyph[]) => Number(part.sort((a, b) => a.x - b.x).map((g) => TIME_DIGIT(g.cp)).join(''));
    const beats = num(list.filter((g) => g.y < mid));
    const beatType = num(list.filter((g) => g.y >= mid));
    return beats > 0 && [1, 2, 4, 8, 16, 32].includes(beatType) ? { beats, beatType } : null;
  };
  const time = timeGlyphs.length ? timeOf(timeGlyphs) : null;
  // A change of time later on: its figures, wherever they stand on the staff.
  const changes: { x: number; time: Meter }[] = [];
  const later = sorted.filter((g) => g.x >= firstHeadX && (TIME_DIGIT(g.cp) !== null || g.cp === COMMON || g.cp === CUT));
  for (let i = 0; i < later.length;) {
    let j = i + 1;
    while (j < later.length && later[j].x - later[j - 1].x < 1.5 * sp) j++;
    const t = timeOf(later.slice(i, j));
    if (t) changes.push({ x: later[i].x, time: t });
    i = j;
  }
  if (!clef) return null;

  // Barlines: vertical lines the height of the staff.
  const bars = strokes
    .filter((s) => near(s.x1, s.x2, 0.3) && Math.min(s.y1, s.y2) <= staff.top + 0.5 && Math.max(s.y1, s.y2) >= bottom - 0.5 && s.x1 > staff.x0 + 2 * sp)
    .map((s) => s.x1)
    .sort((a, b) => a - b)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > 1.5 * sp);

  // Stems: vertical lines from a notehead, at least nearly two spaces long (a
  // second voice below the staff can have one that short).
  const stems = strokes.filter((s) => near(s.x1, s.x2, 0.3) && Math.abs(s.y2 - s.y1) >= 1.8 * sp && !(Math.min(s.y1, s.y2) <= staff.top + 0.5 && Math.max(s.y1, s.y2) >= bottom - 0.5 && Math.abs(s.y2 - s.y1) > 3.9 * sp && Math.abs(s.y2 - s.y1) < 4.1 * sp));
  const w = headWidth(sp);
  const heads: Head[] = [];
  for (const g of sorted) {
    const value = HEAD[g.cp];
    if (value === undefined) continue;
    const head: Head = { x: g.x, y: g.y, pos: posOf(g.y), value, dir: 0, stemX: null, tip: null, dots: 0, alter: null };
    if (value <= 2) {
      // A stem up starts at the head's right edge and goes up; down, its left
      // edge and goes down. Where two voices share a staff, a note can reach
      // the other voice's stem too: it takes the one that starts nearest it.
      const fit = (s: Stroke, up: boolean) => Math.abs((up ? Math.max(s.y1, s.y2) : Math.min(s.y1, s.y2)) - g.y);
      const ups = stems.filter((s) => near(s.x1, g.x + w, 0.35 * sp) && fit(s, true) <= 1.2 * sp && Math.min(s.y1, s.y2) < g.y - sp);
      const downs = stems.filter((s) => near(s.x1, g.x, 0.35 * sp) && fit(s, false) <= 1.2 * sp && Math.max(s.y1, s.y2) > g.y + sp);
      const best = (list: Stroke[], up: boolean) => list.reduce<Stroke | undefined>((a, s) => (!a || fit(s, up) < fit(a, up) ? s : a), undefined);
      let up = best(ups, true);
      let down = best(downs, false);
      if (up && down) {
        if (fit(down, false) < fit(up, true)) up = undefined;
        else down = undefined;
      }
      const stem = up ?? down;
      if (stem) {
        head.dir = up ? 1 : -1;
        head.stemX = stem.x1;
        head.tip = up ? Math.min(stem.y1, stem.y2) : Math.max(stem.y1, stem.y2);
      } else {
        // In a chord, only the end note sits at the stem's end; the others
        // sit along it, on either side of it (a second is written beside).
        const along = stems.find((s) => (near(s.x1, g.x + w, 0.35 * sp) || near(s.x1, g.x, 0.35 * sp))
          && g.y >= Math.min(s.y1, s.y2) - 0.6 * sp && g.y <= Math.max(s.y1, s.y2) + 0.6 * sp);
        if (along) {
          const top = Math.min(along.y1, along.y2);
          const bot = Math.max(along.y1, along.y2);
          head.dir = g.y - top > bot - g.y ? 1 : -1;
          head.stemX = along.x1;
          head.tip = head.dir === 1 ? top : bot;
        }
      }
    }
    // Dots: just right of the head, on its line or in the space above.
    const dots = sorted.filter((d) => d.cp === DOT && d.x > g.x + w * 0.9 && d.x < g.x + w + 1.6 * sp && near(d.y, g.y, 0.6 * sp));
    head.dots = Math.min(2, new Set(dots.map((d) => Math.round(d.x))).size);
    // An accidental just left of the head, at its height.
    const acc = sorted.filter((a) => ACCIDENTAL[a.cp] !== undefined && a.x < g.x && a.x > g.x - 2.6 * sp && near(a.y, g.y, 0.3 * sp)).pop();
    if (acc && !keyGlyphs.includes(acc)) head.alter = ACCIDENTAL[acc.cp];
    heads.push(head);
  }

  // How many beams or flags each stem carries: an eighth has one.
  const strokesAtTip = (h: Head) => {
    if (h.stemX === null || h.tip === null || h.value !== 1) return 0;
    const flag = sorted.find((f) => FLAG[f.cp] !== undefined && near(f.x, h.stemX!, 0.5 * sp) && near(f.y, h.tip!, 1.6 * sp));
    if (flag) return FLAG[flag.cp];
    // A beam slopes, so where it crosses this stem is worked out along its
    // slope, not from its box. The stem ends on the outermost beam; a
    // sixteenth's second beam lies just inside it, toward the head.
    const crossings = shapes
      .filter((b) => b.x0 <= h.stemX! + 0.3 && b.x1 >= h.stemX! - 0.3 && b.x1 - b.x0 > 0.8 * sp && b.y1 - b.y0 < 6 * sp)
      .map((b) => beamAt(b.points, h.stemX!))
      .filter((c): c is [number, number] => c !== null && c[1] - c[0] < 1.2 * sp)
      .filter(([top, bot]) => (h.dir === 1
        ? bot >= h.tip! - 0.3 * sp && top <= h.tip! + 2.8 * sp
        : top <= h.tip! + 0.3 * sp && bot >= h.tip! - 2.8 * sp));
    const levels = new Set(crossings.map(([top, bot]) => Math.round(((top + bot) / 2 - h.tip!) / (0.75 * sp))));
    return Math.min(4, levels.size);
  };

  // Rests.
  const rests = sorted.filter((g) => REST[g.cp] !== undefined).map((g) => {
    const dots = sorted.filter((d) => d.cp === DOT && d.x > g.x && d.x < g.x + 2.5 * sp && near(d.y, g.y, 1.5 * sp)).length;
    return { x: g.x, y: g.y, value: REST[g.cp] * (dots ? 1.5 : 1) };
  });

  // A long stem can cross the whole staff; a line a notehead hangs from is a stem, not a barline.
  const barlines = bars.filter((x) => !heads.some((h) => h.stemX !== null && near(h.stemX, x, 0.3)));

  return { clef, key, time, changes, bars: barlines, heads, rests, strokesAtTip };
}

interface Clef { step: number; octave: number; pos: number }
interface Meter { beats: number; beatType: number }

/**
 * Where a beam (a filled four-cornered shape) crosses the line x: its top and
 * bottom there, from its left and right ends. Null if x is outside it.
 */
export function beamAt(points: [number, number][], x: number): [number, number] | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p[0]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  if (x < left - 0.3 || x > right + 0.3 || right - left < 0.5) return null;
  const end = (edge: number) => {
    const ys = points.filter((p) => Math.abs(p[0] - edge) < 0.6).map((p) => p[1]);
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  };
  const l = end(left);
  const r = end(right);
  if (!l || !r) return null;
  const t = (x - left) / (right - left);
  return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t];
}

/** A staff position as a step of the scale, counted from C0: the same line or space gives the same step. */
function stepOf(pos: number, clef: Clef): number {
  return clef.octave * 7 + clef.step + (pos - clef.pos);
}

/** A head's pitch, from its place on the staff, the clef, the key and the bar's accidentals so far. */
function pitchOf(pos: number, clef: Clef, key: number, carried: Map<number, number>, explicit: number | null): number {
  const diatonic = stepOf(pos, clef);
  const octave = Math.floor(diatonic / 7);
  const step = ((diatonic % 7) + 7) % 7;
  let alter = 0;
  if (key > 0 && SHARP_ORDER.slice(0, key).includes(step)) alter = 1;
  if (key < 0 && FLAT_ORDER.slice(0, -key).includes(step)) alter = -1;
  if (carried.has(diatonic)) alter = carried.get(diatonic)!;
  if (explicit !== null) { alter = explicit; carried.set(diatonic, explicit); }
  return 12 * (octave + 1) + STEP_PC[step] + alter;
}

/**
 * Grace notes, and the cue notes some parts carry, are printed small and take
 * no time of their own; they are left out, with their small sharps, dots and
 * flags. Small means under 85% of the page's usual notehead.
 */
function withoutGraceNotes(ink: PageInk): PageInk {
  const sizes = new Map<number, number>();
  for (const g of ink.glyphs) {
    if (HEAD[g.cp] === undefined) continue;
    const k = Math.round(g.size * 10);
    sizes.set(k, (sizes.get(k) ?? 0) + 1);
  }
  if (!sizes.size) return ink;
  const usual = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0] / 10;
  const small = (g: Glyph) => g.size < 0.85 * usual
    && (HEAD[g.cp] !== undefined || ACCIDENTAL[g.cp] !== undefined || FLAG[g.cp] !== undefined || g.cp === DOT);
  return { ...ink, glyphs: ink.glyphs.filter((g) => !small(g)) };
}

// ---- THE WHOLE SCORE ---------------------------------------------------------

export interface PdfReadReport {
  pages: number;
  systems: number;
  staves: number;
  notes: number;
  /** Bars whose notes did not add up to the time signature: a sign something was missed. */
  unevenBars: number;
}

/** Read a score from a PDF's ink. Throws PdfScoreError with a sentence a person can act on. */
export function readPdfScore(input: PageInk[], fallbackTitle = 'Untitled piece'): { score: Score; report: PdfReadReport } {
  const pages = input.map(withoutGraceNotes);
  const allGlyphs = pages.reduce((n, p) => n + p.glyphs.length, 0);
  if (!allGlyphs) {
    throw new PdfScoreError('This PDF has no music characters in it: it is probably a scan or a photo. Pieces reads PDFs that MuseScore, Dorico and similar programs export.');
  }
  const heads = pages.reduce((n, p) => n + p.glyphs.filter((g) => HEAD[g.cp] !== undefined).length, 0);
  if (!heads) {
    throw new PdfScoreError('No notes were found in this PDF. Its music font may be one this reader does not know yet (older Sibelius and Finale use their own).');
  }

  // Systems, in reading order, across the pages.
  const systems: { staves: Staff[]; ink: PageInk }[] = [];
  // Each symbol belongs to the one staff it is nearest: a choir's staves sit
  // close, and a tenor's low note must not be read on the alto's staff too.
  const owner = new Map<Glyph, Staff>();
  pages.forEach((ink, page) => {
    const staves = findStaves(ink.strokes, page);
    const ledgers = ink.strokes.filter((s) => near(s.y1, s.y2, 0.3) && Math.abs(s.x2 - s.x1) < 12);
    const outside = (g: Glyph, st: Staff) => (g.y < st.top ? st.top - g.y : g.y > st.bottom ? g.y - st.bottom : 0);
    // A note a space or more outside its staff hangs from ledger lines that
    // lead back to it; the first one sits a space beyond the staff's edge.
    const ledgerTo = (g: Glyph, st: Staff) => {
      const y = g.y < st.top ? st.top - st.sp : st.bottom + st.sp;
      const w = headWidth(st.sp);
      return ledgers.some((l) => near(l.y1, y, 0.2 * st.sp) && Math.min(l.x1, l.x2) <= g.x + 0.5 * w && Math.max(l.x1, l.x2) >= g.x + 0.5 * w);
    };
    const reach = (g: Glyph) => staves
      .filter((st) => g.x >= st.x0 - 4 * st.sp && g.x <= st.x1 + 2 * st.sp)
      .sort((a, b) => outside(g, a) - outside(g, b));
    // Every note, and those the ledger lines gave to a farther staff than the nearest.
    const heads: Glyph[] = [];
    const moved: Glyph[] = [];
    for (const g of ink.glyphs) {
      if (HEAD[g.cp] === undefined) continue;
      const list = reach(g);
      const best = list.find((st) => outside(g, st) < 0.9 * st.sp || ledgerTo(g, st)) ?? list[0];
      if (!best) continue;
      owner.set(g, best);
      heads.push(g);
      if (best !== list[0]) moved.push(g);
    }
    for (const g of ink.glyphs) {
      if (owner.has(g)) continue;
      const list = reach(g);
      if (!list.length) continue;
      const sp = list[0].sp;
      const w = headWidth(sp);
      // An accidental or a dot goes with the note right beside it, which can
      // be on the farther staff: a dot sits half a space above its note. A
      // flag, further off, follows only a note the ledger lines moved.
      const head = ACCIDENTAL[g.cp] !== undefined
        ? heads.find((h) => near(h.y, g.y, 0.3 * sp) && h.x > g.x && h.x - g.x < 2.6 * sp)
        : g.cp === DOT
          ? heads.find((h) => near(h.y, g.y, 0.6 * sp) && g.x > h.x + 0.9 * w && g.x < h.x + w + 1.6 * sp)
          : FLAG[g.cp] !== undefined
            ? moved.find((h) => g.x >= h.x - 0.5 * sp && g.x <= h.x + w + 0.5 * sp && Math.abs(h.y - g.y) >= 1.5 * sp && Math.abs(h.y - g.y) <= 5 * sp)
            : undefined;
      owner.set(g, head ? owner.get(head)! : list[0]);
    }
    for (const sys of systemsOf(staves, ink.strokes)) systems.push({ staves: sys, ink });
  });
  const glyphsOf = (st: Staff, ink: PageInk) => ink.glyphs.filter((g) => owner.get(g) === st);
  if (!systems.length) throw new PdfScoreError('No staves were found in this PDF.');
  const partCount = Math.max(...systems.map((s) => s.staves.length));

  // Names: the words left of the first system's staves.
  const first = systems[0];
  const names = first.staves.map((st, i) => {
    const w = first.ink.words.filter((t) => t.x + t.width <= st.x0 + 1 && t.y >= st.top - 2 * st.sp && t.y <= st.bottom + 3 * st.sp);
    return w.map((t) => t.text).join(' ').trim() || `Part ${i + 1}`;
  });

  // Title: the largest words near the top of the first page.
  const top = [...pages[0].words].filter((t) => t.y < (first.staves[0]?.top ?? pages[0].height)).sort((a, b) => b.size - a.size);
  const title = top[0]?.text.trim() || fallbackTitle;

  const lines = new Map<string, ScoreLine>();
  const marks: ScoreMark[] = [];
  const bars: number[] = [];
  /** The key printed at the start, which the explanation names. */
  let firstKey: number | null = null;
  let time: Score['time'] | undefined;
  /** The time signature in force now; `time` keeps the first. */
  let meter: Meter | undefined;
  let tempo = 0;
  const clefs: (Clef | null)[] = Array(partCount).fill(null);
  // Each staff keeps its own key signature: old sources sometimes give the
  // parts different ones, and transposing instruments always do.
  const keys: number[] = Array(partCount).fill(0);
  let at = 0; // where the current system starts, in quarters
  let notes = 0;
  let uneven = 0;
  const openTies = new Map<string, ScoreNote>();

  for (const { staves, ink } of systems) {
    if (staves.length !== partCount) {
      throw new PdfScoreError('The staves change from one system to the next (a part is hidden where it rests). This reader needs every part on every system.');
    }
    // Each staff's events, then bars lined up across the system.
    const read = staves.map((st, i) => readStaff(st, glyphsOf(st, ink), ink.strokes, ink.shapes, clefs[i], keys[i]));
    if (read.some((r) => !r)) throw new PdfScoreError('A staff without a clef was found; this reader needs the clef at the start of every staff.');
    const r0 = read[0]!;
    if (firstKey === null) firstKey = r0.key;
    if (r0.time && !time) time = r0.time;
    if (r0.time) meter = r0.time;
    read.forEach((r, i) => { clefs[i] = r!.clef; keys[i] = r!.key; });

    // Bar boundaries for the whole system: the barlines most of its staves
    // agree on, so one stray line on one staff cannot split a bar.
    // The last barline is often at the staff's very end; a sliver after it is not a bar.
    const sp0 = staves[0].sp;
    const agreed = r0.bars.filter((x) => read.filter((r) => r!.bars.some((y) => near(x, y, sp0))).length * 2 > read.length);
    for (const r of read.slice(1)) {
      for (const x of r!.bars) {
        if (agreed.some((y) => near(x, y, sp0))) continue;
        if (read.filter((q) => q!.bars.some((y) => near(x, y, sp0))).length * 2 > read.length) agreed.push(x);
      }
    }
    // A new time signature starts a bar where it stands, even where no
    // barline was printed before it.
    for (const c of r0.changes) agreed.push(c.x - 0.5);
    agreed.sort((a, b) => a - b);
    const edges = [staves[0].x0, ...agreed, staves[0].x1].filter((x, i, all) => i === 0 || x - all[i - 1] > 1.5 * sp0);
    // Each staff's voices, bar by bar.
    const perStaff = read.map((r, si) => {
      const staff = staves[si];
      const evs: Event[] = [];
      const twoVoices = hasTwoVoices(r!.heads, staff.sp);
      // Heads on one stem are one chord.
      const groups = new Map<string, Head[]>();
      for (const h of r!.heads) {
        const id = h.stemX !== null ? `s${Math.round(h.stemX * 2)}:${h.dir}` : `w${Math.round(h.x)}`;
        const list = groups.get(id) ?? [];
        list.push(h);
        groups.set(id, list);
      }
      for (const hs of groups.values()) {
        const h = hs[0];
        const base = h.value === 1 ? 1 / 2 ** r!.strokesAtTip(h) : h.value;
        const length = base * (h.dots === 2 ? 1.75 : h.dots === 1 ? 1.5 : 1);
        evs.push({ x: Math.min(...hs.map((k) => k.x)), heads: hs, length, rest: false, voice: twoVoices && h.dir === -1 ? 2 : 1 });
      }
      const mid = (staff.top + staff.bottom) / 2;
      for (const rest of r!.rests) evs.push({ x: rest.x, heads: [], length: rest.value, rest: true, voice: twoVoices && rest.y > mid ? 2 : 1 });
      return { evs, twoVoices };
    });

    for (let b = 0; b + 1 < edges.length; b++) {
      const from = edges[b];
      const to = edges[b + 1];
      const change = r0.changes.find((c) => c.x >= from - 0.5 && c.x < to - 0.5);
      if (change) meter = change.time;
      const barLen = meter ? (meter.beats * 4) / meter.beatType : 4;
      let longest = 0;
      let any = false;
      const inBar: { si: number; voice: 1 | 2; evs: Event[] }[] = [];
      perStaff.forEach(({ evs, twoVoices }, si) => {
        for (const voice of (twoVoices ? [1, 2] : [1]) as (1 | 2)[]) {
          const list = evs.filter((e) => e.voice === voice && e.x >= from - 0.5 && e.x < to - 0.5).sort((a, c) => a.x - c.x);
          // A whole-bar rest fills the bar, whatever its length, so the
          // bar's length comes from the other parts: a short opening bar
          // with a part resting is still short.
          const wholeRest = list.length === 1 && list[0].rest && list[0].length === 4;
          if (!wholeRest) longest = Math.max(longest, list.reduce((t, e) => t + e.length, 0));
          if (list.length) any = true;
          inBar.push({ si, voice, evs: list });
        }
      });
      // Every part writes something in every bar, if only a rest; a gap
      // with nothing in it (the warning of a new time after a line's last
      // barline) is not a bar.
      if (!any) continue;
      const length = longest || barLen;
      if (meter && Math.abs(length - barLen) > 1e-6 && !(b === 0 && bars.length === 0)) uneven++;
      if (bars.length < 4000) bars.push(at);
      for (const { si, voice, evs } of inBar) {
        const r = read[si]!;
        const carried = new Map<number, number>();
        let t = at;
        const lineId = `P${si + 1}/${voice}`;
        for (const e of evs) {
          const len = e.rest && e.length === 4 && evs.length === 1 ? length : e.length;
          if (!e.rest) {
            if (!lines.has(lineId)) lines.set(lineId, { id: lineId, name: names[si] ?? `Part ${si + 1}`, notes: [] });
            for (const h of e.heads) {
              // A tie joins two notes on the same line or space. The second
              // keeps the first one's pitch: across a barline its sharp or
              // natural is not printed again.
              const step = stepOf(h.pos, r.clef);
              const tieKey = `${lineId}/${step}`;
              const held = openTies.get(tieKey);
              if (held && Math.abs(held.start + held.length - t) < 1e-6) {
                if (h.alter !== null) carried.set(step, h.alter);
                h.midi = held.midi;
                held.length += len;
                openTies.delete(tieKey);
                if (tiedOn(h, ink, staves[si])) openTies.set(tieKey, held);
                continue;
              }
              const midi = pitchOf(h.pos, r.clef, keys[si], carried, h.alter);
              h.midi = midi;
              const note: ScoreNote = { start: t, length: len, midi };
              lines.get(lineId)!.notes.push(note);
              if (++notes > 40_000) throw new PdfScoreError('This PDF has more notes than the room can play on a phone.');
              if (tiedOn(h, ink, staves[si])) openTies.set(tieKey, note);
            }
          }
          e.start = t;
          t += len;
        }
      }
      at += length;
    }

    // Words under each staff, to the note above them; loudness and tempo.
    staves.forEach((st, si) => {
      const events = perStaff[si].evs.filter((e) => !e.rest && e.start !== undefined && e.voice === 1);
      lyricsFor(st, ink.words, ink.strokes, staves[si + 1] ?? null, events, lines.get(`P${si + 1}/1`) ?? null);
      const second = perStaff[si].evs.filter((e) => !e.rest && e.start !== undefined && e.voice === 2);
      if (second.length) lyricsFor(st, ink.words, ink.strokes, staves[si + 1] ?? null, second, lines.get(`P${si + 1}/2`) ?? null, 1.5);
      for (const m of marksFor(st, ink, events, si === 0)) {
        if (!marks.some((k) => Math.abs(k.at - m.at) < 1e-6 && k.text === m.text) && marks.length < 600) marks.push(m);
      }
    });
    // Usually over the top staff; some programs put it over another.
    if (!tempo) tempo = staves.reduce((t, st) => t || tempoOn(st, ink), 0);
  }

  // A line made of two voices on one staff is named for both.
  for (const line of lines.values()) {
    const [part, voice] = line.id.split('/');
    if (lines.has(`${part}/2`)) line.name = `${line.name} · voice ${voice}`;
  }
  const found = [...lines.values()].filter((l) => l.notes.length);
  if (!found.length) throw new PdfScoreError('No notes could be read from this PDF.');
  for (const l of found) l.notes.sort((a, b) => a.start - b.start || b.midi - a.midi);
  marks.sort((a, b) => a.at - b.at);
  const score: Score = {
    title,
    tempo: tempo || 90,
    lines: found,
    length: at,
    key: { fifths: firstKey ?? 0 },
    ...(time ? { time } : {}),
    bars,
    ...(marks.length ? { marks } : {}),
  };
  return { score, report: { pages: pages.length, systems: systems.length, staves: systems.reduce((n, s) => n + s.staves.length, 0), notes, unevenBars: uneven } };
}

/** Two voices share a staff when stems go both ways at the same moment. */
export function hasTwoVoices(heads: Head[], sp: number): boolean {
  const up = heads.filter((h) => h.dir === 1);
  const down = heads.filter((h) => h.dir === -1);
  if (!up.length || !down.length) return false;
  const together = up.filter((u) => down.some((d) => near(d.x, u.x, 1.6 * sp))).length;
  return together >= Math.max(2, 0.3 * Math.min(up.length, down.length));
}

/** A tie leaves this head: a curve starting just right of it, at its height, flat. */
function tiedOn(h: Head, ink: PageInk, staff: Staff): boolean {
  const sp = staff.sp;
  return ink.curves.some((c) => {
    const left = Math.min(c.x1, c.x2);
    const flatEnough = Math.abs(c.y1 - c.y2) < 0.6 * sp && c.bottom - c.top < 2 * sp;
    return flatEnough && left > h.x && left < h.x + headWidth(sp) + 1.2 * sp && near(c.y1, h.y, 1.4 * sp) && Math.abs(c.x2 - c.x1) > sp;
  });
}

/**
 * The first verse: the top row of words under a staff, each to the note above
 * it. Two voices on one staff usually share one row of words; the second
 * voice takes only the syllables printed right under its own notes (reach).
 */
function lyricsFor(staff: Staff, words: Words[], strokes: Stroke[], next: Staff | null, events: Event[], line: ScoreLine | null, reach = 4) {
  if (!line || !events.length) return;
  const sp = staff.sp;
  const below = words.filter((w) => w.y > staff.bottom + 1.5 * sp && w.y < (next ? next.top - 0.5 * sp : staff.bottom + 9 * sp) && w.x >= staff.x0 && w.x <= staff.x1 && !/^[=♩]/.test(w.text));
  if (!below.length) return;
  const row = Math.min(...below.map((w) => w.y));
  const verse = below.filter((w) => near(w.y, row, 0.6 * sp)).sort((a, b) => a.x - b.x);
  // Runs that hold two syllables ("Praise the") are split on spaces, the width shared out.
  const syllables: { text: string; x0: number; x1: number }[] = [];
  for (const w of verse) {
    const parts = w.text.split(/\s+/).filter(Boolean);
    const each = w.width / Math.max(1, w.text.length);
    let x = w.x;
    for (const p of parts) {
      const at = w.text.indexOf(p, Math.round((x - w.x) / Math.max(each, 0.01)));
      const x0 = w.x + Math.max(0, at) * each;
      syllables.push({ text: p, x0, x1: x0 + p.length * each });
      x = x0 + p.length * each;
    }
  }
  const dashes = strokes.filter((s) => near(s.y1, s.y2, 0.3) && Math.abs(s.x2 - s.x1) < 3 * sp && s.y1 > row - sp && s.y1 < row + 0.3 * sp);
  for (let i = 0; i < syllables.length; i++) {
    const s = syllables[i];
    const centre = (s.x0 + s.x1) / 2;
    const e = events.reduce((best, ev) => (Math.abs(ev.x + headWidth(sp) / 2 - centre) < Math.abs(best.x + headWidth(sp) / 2 - centre) ? ev : best));
    if (Math.abs(e.x + headWidth(sp) / 2 - centre) > reach * sp) continue;
    const note = line.notes.find((n) => Math.abs(n.start - (e.start ?? -1)) < 1e-6 && n.midi === Math.max(...e.heads.map((h) => h.midi ?? 0)));
    if (!note || note.lyric) continue;
    const nextSyl = syllables[i + 1];
    const joined = /-$/.test(s.text) || (nextSyl && dashes.some((d) => Math.min(d.x1, d.x2) >= s.x1 - 0.5 && Math.max(d.x1, d.x2) <= nextSyl.x0 + 0.5));
    note.lyric = s.text.replace(/-$/, '').slice(0, 80);
    if (joined) note.joins = true;
  }
}

/** Loud and soft under a staff, and tempo words over the top staff, at the note they stand by. */
function marksFor(staff: Staff, ink: PageInk, events: Event[], topStaff: boolean): ScoreMark[] {
  const sp = staff.sp;
  const out: ScoreMark[] = [];
  const timeAt = (x: number) => {
    if (!events.length) return 0;
    const e = events.reduce((best, ev) => (Math.abs(ev.x - x) < Math.abs(best.x - x) ? ev : best));
    return e.start ?? 0;
  };
  // Dynamics: letters of the dynamics font, in a row, below the staff.
  const letters = ink.glyphs
    .filter((g) => (DYNAMIC_LETTER[g.cp] || DYNAMIC_WORD[g.cp]) && g.y > staff.bottom && g.y < staff.bottom + 7 * sp && g.x >= staff.x0 && g.x <= staff.x1)
    .sort((a, b) => a.x - b.x);
  let word = '';
  let startX = 0;
  let lastX = -Infinity;
  const flush = () => { if (word) out.push({ at: timeAt(startX), kind: 'dynamic', text: word }); word = ''; };
  for (const g of letters) {
    if (DYNAMIC_WORD[g.cp]) { flush(); out.push({ at: timeAt(g.x), kind: 'dynamic', text: DYNAMIC_WORD[g.cp] }); continue; }
    if (g.x - lastX > g.size * 0.9) { flush(); startX = g.x; }
    word += DYNAMIC_LETTER[g.cp];
    lastX = g.x;
  }
  flush();
  if (topStaff) {
    for (const w of ink.words) {
      if (w.y >= staff.top || w.y < staff.top - 8 * sp || w.x < staff.x0 - 2 || w.x > staff.x1) continue;
      const text = w.text.trim();
      if (!text || /^=/.test(text)) continue;
      if (/^(cresc|dim|decresc)/i.test(text)) out.push({ at: timeAt(w.x), kind: 'hairpin', text: /^cresc/i.test(text) ? 'cresc.' : 'dim.' });
      else out.push({ at: timeAt(w.x), kind: 'tempo', text: text.slice(0, 80) });
    }
  }
  // Hairpins: two lines from one point, opening or closing, below the staff.
  const slants = ink.strokes.filter((s) => !near(s.y1, s.y2, 0.05) && !near(s.x1, s.x2, 0.3) && Math.abs(s.x2 - s.x1) > 2 * sp && Math.min(s.y1, s.y2) > staff.bottom + 0.5 * sp && Math.max(s.y1, s.y2) < staff.bottom + 7 * sp && Math.min(s.x1, s.x2) >= staff.x0);
  const seen = new Set<Stroke>();
  for (const a of slants) {
    if (seen.has(a)) continue;
    const pair = slants.find((b) => b !== a && !seen.has(b) && (near(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2), 1) && near(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2), 1)));
    if (!pair) continue;
    seen.add(a); seen.add(pair);
    const left = Math.min(a.x1, a.x2);
    const ya = a.x1 < a.x2 ? a.y1 : a.y2;
    const yb = pair.x1 < pair.x2 ? pair.y1 : pair.y2;
    out.push({ at: timeAt(left), kind: 'hairpin', text: Math.abs(ya - yb) < 0.5 ? 'cresc.' : 'dim.' });
  }
  return out;
}

/** The metronome mark over the first staff: its note, then "= 72". */
function tempoOn(staff: Staff, ink: PageInk): number {
  const sp = staff.sp;
  const note = ink.glyphs.find((g) => (METRONOME[g.cp] !== undefined || g.cp === DOTTED_METRONOME) && g.y < staff.top && g.y > staff.top - 10 * sp);
  if (!note) return 0;
  const after = ink.words
    .filter((w) => near(w.y, note.y, sp) && w.x > note.x && w.x < note.x + 12 * sp)
    .sort((a, b) => a.x - b.x)
    .map((w) => w.text)
    .join(' ');
  const n = Number(after.match(/=\s*(\d{2,3})/)?.[1]);
  if (!(n > 0)) return 0;
  const dotted = ink.glyphs.some((g) => g.cp === 0xecb7 || (g.cp === DOT && near(g.y, note.y, sp) && g.x > note.x && g.x < note.x + 2 * sp));
  const unit = (METRONOME[note.cp] ?? 1) * (dotted ? 1.5 : 1);
  return Math.max(30, Math.min(240, Math.round(n * unit)));
}
