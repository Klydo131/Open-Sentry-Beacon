// A drawing made in a study, as a file: a picture anybody can open, that the
// person who drew it can open again and keep drawing.
//
// WHAT THE FILE IS. An ordinary PNG, so an Explorer taps it and sees a picture
// on any phone, with nothing to install. Inside it, in one text chunk, is the
// drawing itself -- the shapes, the arrows, the words -- the way Excalidraw
// writes it with "embed scene". That is what lets "Change drawing" reopen it as
// shapes rather than as a flat image to scribble over.
//
// HOW IT IS KNOWN. By its name ending `.excalidraw.png`, which is Excalidraw's
// own convention for exactly this kind of file, and by that chunk being in it.
//
// WHY THIS FILE STRIPS IT BEFORE IT IS SENT. Every picture that leaves somebody's
// device goes through lib/live/shrink-image.ts, which re-draws it so any hidden
// location goes with the old copy. A re-drawn drawing loses its shapes too, so
// a drawing is let through -- but only as the picture and the drawing. A PNG can
// carry other chunks (a camera's EXIF, a colour profile naming a device, free
// text), so everything else is cut out here. A photo renamed to look like a
// drawing therefore still arrives with nothing in it but its pixels.

/** Excalidraw's name for the chunk that holds the drawing. */
export const SCENE_KEYWORD = 'application/vnd.excalidraw+json';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * What a drawing may keep. The picture itself (IHDR, PLTE, tRNS, IDAT, IEND),
 * three fixed-size colour notes that cannot hold words, and the drawing's own
 * text chunk -- checked by keyword below. Nothing else.
 */
const KEPT = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM']);

/** Named like a drawing. The bytes are checked separately. */
export function isDrawingName(name: string | undefined | null): boolean {
  return /\.excalidraw\.png$/i.test(name ?? '');
}

/** "Drawing 2.excalidraw.png" reads as "Drawing 2". */
export function drawingTitle(name: string): string {
  return name.replace(/\.excalidraw\.png$/i, '') || 'Drawing';
}

/**
 * The name for the next drawing, numbered after the ones already there so two
 * drawings on one study are not both called "Drawing".
 */
export function nextDrawingName(existing: Array<string | undefined | null>): string {
  const taken = new Set(existing.filter(isDrawingName).map((n) => drawingTitle(n as string).toLowerCase()));
  let n = 1;
  while (taken.has(`drawing ${n}`)) n += 1;
  return `Drawing ${n}.excalidraw.png`;
}

type Chunk = { type: string; start: number; end: number };

/** The chunks of a PNG, in order, or null if it is not a whole one. */
function chunksOf(bytes: Uint8Array): Chunk[] | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Chunk[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    out.push({ type, start: at, end });
    at = end;
    if (type === 'IEND') break;
  }
  return out.length && out[out.length - 1].type === 'IEND' ? out : null;
}

/** The keyword of a tEXt chunk: its bytes up to the first zero. */
function keywordOf(bytes: Uint8Array, chunk: Chunk): string {
  const data = bytes.subarray(chunk.start + 8, chunk.end - 4);
  const zero = data.indexOf(0);
  return zero < 0 ? '' : String.fromCharCode(...data.subarray(0, Math.min(zero, 79)));
}

/** Whether these bytes are a PNG holding a drawing. */
export function carriesDrawing(bytes: Uint8Array): boolean {
  const chunks = chunksOf(bytes);
  return !!chunks?.some((c) => c.type === 'tEXt' && keywordOf(bytes, c) === SCENE_KEYWORD);
}

/**
 * The same PNG with nothing in it but the picture and the drawing, or null when
 * these bytes are not a whole PNG. Chunks are copied whole, checksums and all,
 * so nothing that is kept is changed.
 */
export function onlyTheDrawing(bytes: Uint8Array): Uint8Array | null {
  const chunks = chunksOf(bytes);
  if (!chunks) return null;
  const keep = chunks.filter((c) => KEPT.has(c.type)
    || (c.type === 'tEXt' && keywordOf(bytes, c) === SCENE_KEYWORD));
  const size = 8 + keep.reduce((n, c) => n + (c.end - c.start), 0);
  const out = new Uint8Array(size);
  out.set(bytes.subarray(0, 8), 0);
  let at = 8;
  for (const c of keep) {
    out.set(bytes.subarray(c.start, c.end), at);
    at += c.end - c.start;
  }
  return out;
}

/**
 * A picture as a data: URL, for the sample app, which keeps everything in the
 * browser's own storage rather than in files.
 */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The picture could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * And back again, without fetch(): the Content-Security-Policy's connect-src
 * does not name data:, so fetching one is refused.
 */
export function dataUrlToFile(url: string, name: string): File | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m) return null;
  const raw = atob(m[2]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], name, { type: m[1] });
}
