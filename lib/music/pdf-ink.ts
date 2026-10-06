// A music PDF's ink: every music symbol, every word, every straight line and
// every filled shape, with where it sits on the page. The first half of
// reading a PDF score on the phone; lib/music/pdf-score.ts turns the ink into
// notes.
//
// Chosen by the owner on 6 October 2026, from four ways of turning a PDF into
// notes: "Read music PDFs on phone". The PDFs that notation programs export
// (MuseScore, Dorico, and others that use a SMuFL music font) are not
// pictures: each notehead, clef and rest is a character of the music font, at
// an exact place, and every staff line, stem and beam is drawn as a line or a
// shape. Reading those back is exact, needs no AI and nothing leaves the
// phone. A scan or a photo saved as a PDF has none of this, and is said so.
//
// THE PDF IS UNTRUSTED. It is opened by Mozilla's pdf.js (Apache-2.0), in
// its worker, which runs under the site's own security policy: no code built
// from strings (pdf.js 6 has none left to build; tests/the-music-room.mjs
// reads its files to keep it so) and no WebAssembly (turned off below). Its
// fonts are never installed into the page and nothing is fetched. Pages,
// symbols and lines are capped, so a hostile file can make the room say no,
// never hang it.
//
// pdf.js is handed in rather than imported, so the browser can load it only
// when somebody opens a PDF, and the tests can hand in the Node build.

/** The part of pdf.js used here. */
export interface PdfJs {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
  OPS: Record<string, number>;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
}
interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

/** A music-font character: a notehead, a clef, a rest. y grows downwards. */
export interface Glyph { cp: number; x: number; y: number; size: number }
/** A run of ordinary text: a title, a part's name, a syllable, a tempo word. */
export interface Words { text: string; x: number; y: number; size: number; width: number }
/** A straight stroked line: a staff line, a stem, a barline, a ledger line. */
export interface Stroke { x1: number; y1: number; x2: number; y2: number; width: number }
/** A filled shape, as its bounding box and corners: a beam is one. */
export interface Shape { x0: number; y0: number; x1: number; y1: number; points: [number, number][] }
/** A curve (a tie or a slur): where it starts and ends, and its box. */
export interface Curve { x1: number; y1: number; x2: number; y2: number; top: number; bottom: number }

export interface PageInk {
  width: number;
  height: number;
  glyphs: Glyph[];
  words: Words[];
  strokes: Stroke[];
  shapes: Shape[];
  curves: Curve[];
}

export const PDF_LIMITS = {
  /** As much as the room keeps of any piece (lib/music/pieces.ts). */
  bytes: 12 * 1024 * 1024,
  pages: 60,
  /** Symbols, words or lines on one page. A dense hymn page has about 3,000. */
  perPage: 60_000,
} as const;

export class PdfInkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfInkError';
  }
}

/** SMuFL, the standard music fonts' codes, live in the private-use area. */
export const isMusicCode = (cp: number) => cp >= 0xe000 && cp <= 0xf8ff;

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Read a PDF's ink, page by page. Throws PdfInkError with a sentence a person can act on. */
export async function readPdfInk(pdfjs: PdfJs, data: Uint8Array): Promise<PageInk[]> {
  if (data.byteLength > PDF_LIMITS.bytes) throw new PdfInkError('This PDF is larger than the room can read on a phone.');
  let doc: PdfDocument;
  let task: ReturnType<PdfJs['getDocument']> | null = null;
  try {
    task = pdfjs.getDocument({
      data,
      useWasm: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      // Nothing is ever fetched for a PDF opened here.
      disableAutoFetch: true,
      disableStream: true,
      isOffscreenCanvasSupported: false,
      verbosity: 0,
    });
    doc = await task.promise;
  } catch (e) {
    void task?.destroy().catch(() => {});
    const name = (e as { name?: string })?.name;
    if (name === 'PasswordException') throw new PdfInkError('This PDF is locked with a password, so it cannot be read.');
    throw new PdfInkError('This file could not be opened as a PDF.');
  }
  try {
    if (doc.numPages > PDF_LIMITS.pages) throw new PdfInkError(`This PDF has more than ${PDF_LIMITS.pages} pages, more than the room reads on a phone.`);
    const pages: PageInk[] = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push(await readPage(pdfjs, await doc.getPage(n)));
    return pages;
  } finally {
    void task.destroy().catch(() => {});
  }
}

async function readPage(pdfjs: PdfJs, page: PdfPage): Promise<PageInk> {
  const { width, height } = page.getViewport({ scale: 1 });
  const ink: PageInk = { width, height, glyphs: [], words: [], strokes: [], shapes: [], curves: [] };
  const full = () => ink.glyphs.length + ink.words.length + ink.strokes.length + ink.shapes.length + ink.curves.length > PDF_LIMITS.perPage;

  // Words, from the text layer, which joins letters into runs. Music
  // characters are left to the drawing operations below, which place each
  // one exactly: a run of two noteheads is two notes in two places.
  const text = await page.getTextContent();
  for (const item of text.items) {
    if (!item.str || !item.transform) continue;
    const words = [...item.str].filter((c) => !isMusicCode(c.codePointAt(0)!)).join('');
    if (!words.trim()) continue;
    const [a, b, , , e, f] = item.transform;
    ink.words.push({ text: words.trim(), x: e, y: height - f, size: Math.hypot(a, b), width: item.width ?? 0 });
    if (full()) throw new PdfInkError('A page of this PDF holds more than the room can read on a phone.');
  }

  // Lines and shapes, from the drawing operations.
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  // PDF space has y growing upwards; flip it so y grows down the page.
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let lineWidth = 1;
  const flip = (p: [number, number]): [number, number] => [p[0], height - p[1]];
  // The text state, as PDF defines it, so each music character's place is known.
  const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let fontSize = 0, charSpacing = 0, wordSpacing = 0, hScale = 1, leading = 0, rise = 0;
  const moveText = (tx: number, ty: number) => { tlm = multiply([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  const show = (glyphs: unknown) => {
    if (!Array.isArray(glyphs)) return;
    for (const g of glyphs) {
      if (typeof g === 'number') { tm = multiply([1, 0, 0, 1, (-g / 1000) * fontSize * hScale, 0], tm); continue; }
      const glyph = g as { unicode?: string; width?: number; isSpace?: boolean } | null;
      if (!glyph) continue;
      const cp = glyph.unicode ? glyph.unicode.codePointAt(0) ?? 0 : 0;
      if (cp && isMusicCode(cp)) {
        const m = multiply(tm, ctm);
        const [x, y] = flip(apply(m, 0, rise));
        ink.glyphs.push({ cp, x, y, size: fontSize * Math.hypot(m[0], m[1]) });
      }
      const advance = ((glyph.width ?? 0) / 1000) * fontSize + charSpacing + (glyph.isSpace ? wordSpacing : 0);
      tm = multiply([1, 0, 0, 1, advance * hScale, 0], tm);
    }
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.beginText) { tm = IDENTITY; tlm = IDENTITY; }
    else if (fn === OPS.setFont) fontSize = Number(args[1]) || 0;
    else if (fn === OPS.setTextMatrix) {
      // One argument of six numbers in pdf.js 6; six arguments in older ones.
      const m = (args.length === 1 ? args[0] : args) as ArrayLike<number>;
      tm = Array.from({ length: 6 }, (_, k) => Number(m[k])) as Matrix;
      tlm = tm;
    }
    else if (fn === OPS.moveText) moveText(Number(args[0]), Number(args[1]));
    else if (fn === OPS.setLeadingMoveText) { leading = -Number(args[1]); moveText(Number(args[0]), Number(args[1])); }
    else if (fn === OPS.nextLine) moveText(0, -leading);
    else if (fn === OPS.setCharSpacing) charSpacing = Number(args[0]) || 0;
    else if (fn === OPS.setWordSpacing) wordSpacing = Number(args[0]) || 0;
    else if (fn === OPS.setHScale) hScale = (Number(args[0]) || 100) / 100;
    else if (fn === OPS.setLeading) leading = Number(args[0]) || 0;
    else if (fn === OPS.setTextRise) rise = Number(args[0]) || 0;
    else if (fn === OPS.showText || fn === OPS.showSpacedText) show(args[0]);
    else if (fn === OPS.nextLineShowText) { moveText(0, -leading); show(args[0]); }
    else if (fn === OPS.nextLineSetSpacingShowText) { wordSpacing = Number(args[0]) || 0; charSpacing = Number(args[1]) || 0; moveText(0, -leading); show(args[2]); }
    else if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply((args.length === 1 ? Array.from(args[0] as ArrayLike<number>) : args.map(Number)) as Matrix, ctm);
    else if (fn === OPS.setLineWidth) lineWidth = Number(args[0]) || 0;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args[0] as ArrayLike<number> | null;
      if (m && m.length === 6) ctm = multiply(Array.from(m) as Matrix, ctm);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      const paint = Number(args[0]);
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data) continue;
      // Ties and slurs often come as an even-odd fill with an outline.
      const both = [OPS.fillStroke, OPS.closeFillStroke, OPS.eoFillStroke, OPS.closeEOFillStroke];
      const stroked = paint === OPS.stroke || paint === OPS.closeStroke || both.includes(paint);
      const filled = paint === OPS.fill || paint === OPS.eoFill || both.includes(paint);
      if (!stroked && !filled) continue;
      readPath(data, ctm, flip, stroked, filled, lineWidth, ink);
      if (full()) throw new PdfInkError('A page of this PDF holds more than the room can read on a phone.');
    }
  }
  return ink;
}

/** One drawn path: its straight strokes, its filled outline, or its curve. */
function readPath(
  data: ArrayLike<number>, ctm: Matrix, flip: (p: [number, number]) => [number, number],
  stroked: boolean, filled: boolean, lineWidth: number, ink: PageInk,
): void {
  const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
  const width = lineWidth * scale;
  const points: [number, number][] = [];
  /** The points the path passes through, without the curves' control points. */
  const on: [number, number][] = [];
  let curved = false;
  let start: [number, number] | null = null;
  let at: [number, number] | null = null;
  const segments: [[number, number], [number, number]][] = [];
  for (let k = 0; k < data.length;) {
    const op = data[k++];
    if (op === 0) { // moveTo
      at = flip(apply(ctm, data[k], data[k + 1])); k += 2;
      start = at;
      points.push(at);
      on.push(at);
    } else if (op === 1) { // lineTo
      const to = flip(apply(ctm, data[k], data[k + 1])); k += 2;
      if (at) segments.push([at, to]);
      at = to;
      points.push(at);
      on.push(at);
    } else if (op === 2) { // curveTo: two control points, then the end
      const c1 = flip(apply(ctm, data[k], data[k + 1]));
      const c2 = flip(apply(ctm, data[k + 2], data[k + 3]));
      const to = flip(apply(ctm, data[k + 4], data[k + 5])); k += 6;
      points.push(c1, c2, to);
      on.push(to);
      at = to;
      curved = true;
    } else if (op === 3) { // quadraticCurveTo
      const c = flip(apply(ctm, data[k], data[k + 1]));
      const to = flip(apply(ctm, data[k + 2], data[k + 3])); k += 4;
      points.push(c, to);
      on.push(to);
      at = to;
      curved = true;
    } else if (op === 4) { // closePath
      if (at && start) segments.push([at, start]);
      at = start;
    } else {
      return; // something this reader does not know: the path is left out
    }
  }
  if (!points.length) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  if (curved) {
    // Its two ends: a tie drawn as a filled crescent starts and finishes at
    // the same end, so the ends are its leftmost and rightmost points.
    const left = on.reduce((a, b) => (b[0] < a[0] ? b : a));
    const right = on.reduce((a, b) => (b[0] > a[0] ? b : a));
    ink.curves.push({ x1: left[0], y1: left[1], x2: right[0], y2: right[1], top: box.y0, bottom: box.y1 });
    return;
  }
  if (filled && points.length >= 3) {
    ink.shapes.push({ ...box, points: points.slice(0, 16) });
    return;
  }
  if (stroked) {
    for (const [p, q] of segments) ink.strokes.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], width });
  }
}
