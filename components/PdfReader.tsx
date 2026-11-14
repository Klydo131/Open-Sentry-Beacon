'use client';

// Reading a PDF inside the app, full screen.
//
// A PDF kept on the device could only be downloaded, and on an Android phone a
// download is saved to a folder with nothing shown, so it looked as though the
// file would not open. This draws each page with pdf.js (lib/pdfjs.ts, loaded
// only now) as the reader scrolls to it, and lets a page go again once it is
// far away, so a long book does not fill an old phone's memory.
//
// Nothing in the PDF runs: pages are drawn to a canvas, its scripts and forms
// are ignored, and eval is off.

import { useEffect, useRef, useState } from 'react';
import { CloseGlyph, MinusGlyph, PlusGlyph } from '@/components/Glyph';
import { loadPdfJs } from '@/lib/pdfjs';

interface Viewport { width: number; height: number }
interface PdfPage {
  getViewport(o: { scale: number }): Viewport;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }): { promise: Promise<void>; cancel(): void };
  cleanup(): void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
interface PdfJs { getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> } }

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5] as const;

function Page({ doc, n, width, zoom }: { doc: PdfDoc; n: number; width: number; zoom: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.3);
  const [near, setNear] = useState(n <= 2);

  useEffect(() => {
    let live = true;
    void doc.getPage(n).then((page) => {
      const v = page.getViewport({ scale: 1 });
      if (live) setRatio(v.height / v.width);
    });
    return () => { live = false; };
  }, [doc, n]);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const watch = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '900px 0px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const cssWidth = Math.round(width * zoom);
  useEffect(() => {
    if (!near || !cssWidth) return undefined;
    let task: { cancel(): void } | null = null;
    let live = true;
    void doc.getPage(n).then((page) => {
      const c = canvas.current;
      if (!live || !c) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const job = page.render({ canvasContext: ctx, viewport });
      task = job;
      job.promise.then(() => page.cleanup(), () => {});
    });
    return () => {
      live = false;
      task?.cancel();
      // Far away again: give the memory back.
      const c = canvas.current;
      if (c) { c.width = 0; c.height = 0; }
    };
  }, [doc, n, near, cssWidth]);

  return (
    <div
      ref={box}
      className="mx-auto bg-white shadow-md"
      style={{ width: cssWidth, height: Math.round(cssWidth * ratio) }}
      data-pdf-page={n}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${n}`} role="img" />
    </div>
  );
}

export function PdfReader({ blob, title, onClose }: { blob: Blob; title: string; onClose: () => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    // The loading task, not the document, is what releases the worker's copy.
    let task: ReturnType<PdfJs['getDocument']> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs<PdfJs>();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!live) return;
        task = pdfjs.getDocument({
          data,
          isEvalSupported: false,
          enableXfa: false,
          useSystemFonts: true,
          disableAutoFetch: true,
          disableStream: true,
          verbosity: 0,
        });
        const opened = await task.promise;
        if (live) setDoc(opened);
      } catch {
        if (live) setError('This PDF could not be opened here. Try Download, or ask whoever sent it for a fresh copy.');
      }
    })();
    return () => { live = false; void task?.destroy().catch(() => {}); };
  }, [blob]);

  // Fit the page to the screen's width, and again when the phone turns.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const fit = () => setWidth(Math.max(240, Math.min(el.clientWidth - 24, 900)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = before; };
  }, [onClose]);

  // The page counter names the page at the top of the screen.
  const track = () => {
    const el = scroller.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight * 0.25;
    let current = 1;
    for (const p of el.querySelectorAll<HTMLElement>('[data-pdf-page]')) {
      if (p.offsetTop <= line) current = Number(p.dataset.pdfPage);
      else break;
    }
    // At the very end the last page cannot reach the top; it is still the one being read.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) current = doc?.numPages ?? current;
    setPage(current);
  };

  const zi = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Reading ${title}`} className="fixed inset-0 z-[80] flex flex-col bg-slate-800" data-pdf-reader>
      <div className="flex items-center gap-1 bg-navy px-2 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] text-white">
        <p className="min-w-0 flex-1 truncate px-2 text-sm font-semibold">{title}</p>
        {doc && <span className="shrink-0 px-1 text-xs tabular-nums text-white/80" aria-live="polite">{page} of {doc.numPages}</span>}
        <button type="button" className="tap-sm grid w-11 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
          onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label="Smaller">
          <MinusGlyph size={20} />
        </button>
        <button type="button" className="tap-sm grid w-11 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} disabled={zi >= ZOOMS.length - 1} aria-label="Larger">
          <PlusGlyph size={20} />
        </button>
        <button ref={closeRef} type="button" className="tap-sm grid w-11 place-items-center rounded-full hover:bg-white/10"
          onClick={onClose} aria-label="Close the reader">
          <CloseGlyph size={20} />
        </button>
      </div>
      <div ref={scroller} onScroll={track} className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {error ? (
          <p role="alert" className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-4 text-center text-navy">{error}</p>
        ) : !doc ? (
          <p role="status" className="mt-10 text-center text-white/80">Opening…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <Page key={i} doc={doc} n={i + 1} width={width} zoom={zoom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
