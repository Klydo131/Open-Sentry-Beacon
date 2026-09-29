// The sample app's drawings, kept in this tab and nowhere else.
//
// WHY NOT IN THE SAMPLE DATABASE. That database is one JSON value written to
// localStorage on every single change anybody makes, so a picture stored in a
// row would be re-written with every tap, and a few drawings would fill the
// five megabytes the whole sample church has to live in.
// tests/realtime-and-media.mjs forbids file bytes in lib/demo/store.tsx for
// exactly that reason, and caught this on 28 September 2026.
//
// WHY NOT IN INDEXEDDB, where the sample app keeps its photos. WebKit refuses
// to store a picture there under the conditions CI runs it in (see
// tests/e2e/webkit-idb-probe.js), and the drawing walk runs on WebKit.
//
// So a drawing lives in this tab's sessionStorage, written once, under an id
// the series row points at. It lasts until the tab is closed, which is what the
// builder says, and it is honest for a sample: nothing in the sample app is
// meant to be kept. The live app keeps a drawing as a file on the study.

import { uuid } from '@/lib/uuid';

const PREFIX = 'beacon.sample-drawing.';
// Held here too, so a browser that refuses storage still shows the drawing for
// as long as the page is open.
const memory = new Map<string, string>();

/** Only a PNG, because what is kept here is drawn as an <img>. */
export function isPngDataUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('data:image/png;base64,');
}

/** Keep a drawing for this tab. Returns its id, or '' for anything not a PNG. */
export function keepDrawing(url: string): string {
  if (!isPngDataUrl(url)) return '';
  const id = uuid();
  memory.set(id, url);
  try { sessionStorage.setItem(PREFIX + id, url); } catch { /* kept in memory */ }
  return id;
}

/** The drawing with this id, or '' once the tab that made it has closed. */
export function drawingById(id: string | undefined): string {
  if (!id) return '';
  const held = memory.get(id);
  if (held) return held;
  try {
    const saved = sessionStorage.getItem(PREFIX + id);
    if (isPngDataUrl(saved)) { memory.set(id, saved); return saved; }
  } catch { /* storage blocked */ }
  return '';
}

/** Let a drawing go when its series no longer points at it. */
export function forgetDrawing(id: string | undefined): void {
  if (!id) return;
  memory.delete(id);
  try { sessionStorage.removeItem(PREFIX + id); } catch { /* nothing to remove */ }
}
