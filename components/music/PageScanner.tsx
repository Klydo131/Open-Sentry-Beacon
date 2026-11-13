'use client';

// Photo to clean page: choose a photo of a page of music, put a dot on each
// corner of the paper, and get the page back flat, cropped and black on white.
// The arithmetic is lib/music/page-scan.ts; this is the screen around it.
//
// THE PHOTO NEVER LEAVES THE PHONE AND IS NOT KEPT. It is read into memory,
// shrunk, and dropped once the clean page is made. Only the clean page is
// saved, and it is drawn fresh from pixels, so nothing the camera wrote into
// the photo (where it was taken, which phone) comes with it.
//
// THE PHOTO PICKER, NOT THE CAMERA. A plain image input lets somebody take a
// picture or pick one they already have, and the browser asks nothing. Using
// the camera directly would need a camera permission this app does not ask
// for anywhere (next.config.mjs: camera=()).

import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { PAGE_WIDTH, clean, isPageShape, startingCorners, warp, type Point } from '@/lib/music/page-scan';
import { PieceError, savePiece, type Piece } from '@/lib/music/pieces';

/** Photos are shrunk to this on their longest side first: plenty for a page, and quick. */
const PHOTO_MAX = 2000;
/** Larger than any phone photo; a file this big is not a photo of a page. */
const PHOTO_MAX_BYTES = 40 * 1024 * 1024;
/**
 * A 200-megapixel phone photo is 200 million pixels. A small file can claim
 * far more (a picture that is mostly one colour compresses to almost
 * nothing), and drawing it would take all of the phone's memory.
 */
const PHOTO_MAX_PIXELS = 220_000_000;

type Corners = [Point, Point, Point, Point];
const CORNER_NAMES = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];

async function readPhoto(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/')) throw new PieceError('Choose a photo of the page.');
  if (file.size > PHOTO_MAX_BYTES) throw new PieceError('This file is larger than any photo of a page. Choose another.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > PHOTO_MAX_PIXELS) throw new PieceError('This picture is far larger than a photo of a page. Choose another.');
    const scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no canvas');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (e) {
    if (e instanceof PieceError) throw e;
    throw new PieceError('This photo could not be opened. Try another, or take it again.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new PieceError('This phone could not save the page.'))),
    'image/png',
  ));
}

export function PageScanner({ onSaved, onCancel }: { onSaved: (piece: Piece) => void; onCancel: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [page, setPage] = useState<{ blob: Blob; url: string } | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // The photo, drawn once into the visible canvas.
  useEffect(() => {
    const c = shown.current;
    if (!c || !photo) return;
    c.width = photo.width;
    c.height = photo.height;
    c.getContext('2d')?.drawImage(photo, 0, 0);
  }, [photo]);

  // The preview's address is let go when it changes or the scanner closes.
  useEffect(() => () => { if (page) URL.revokeObjectURL(page.url); }, [page]);

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError('');
    if (!file) return;
    setBusy('Opening the photo…');
    try {
      const canvas = await readPhoto(file);
      setPhoto(canvas);
      setCorners(startingCorners(canvas.width, canvas.height));
      setPage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This photo could not be opened.');
    } finally {
      setBusy('');
      // Cleared after reading (WebKit drops the file if it is cleared first), so
      // the same photo can be chosen again.
      event.target.value = '';
    }
  };

  // ---- the four corners ----------------------------------------------------

  const toPhoto = (clientX: number, clientY: number): Point | null => {
    const el = svg.current;
    if (!el || !photo) return null;
    const box = el.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * photo.width;
    const y = ((clientY - box.top) / box.height) * photo.height;
    return [Math.min(photo.width, Math.max(0, x)), Math.min(photo.height, Math.max(0, y))];
  };
  const move = (i: number, to: Point) => setCorners((c) => {
    if (!c) return c;
    const next = [...c] as Corners;
    next[i] = to;
    return next;
  });
  const onKey = (i: number, event: React.KeyboardEvent) => {
    if (!photo || !corners) return;
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(photo.width, photo.height);
    const d: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const by = d[event.key];
    if (!by) return;
    event.preventDefault();
    const [x, y] = corners[i];
    move(i, [Math.min(photo.width, Math.max(0, x + by[0])), Math.min(photo.height, Math.max(0, y + by[1]))]);
  };

  // ---- making the page -----------------------------------------------------

  const make = async () => {
    if (!photo || !corners) return;
    if (!isPageShape(corners)) {
      setError('Those dots do not make a page. Put one on each corner of the paper, going round in order.');
      return;
    }
    setError('');
    setBusy('Making a clean page…');
    // A moment for the words above to appear before the phone is busy.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const g = photo.getContext('2d');
      if (!g) throw new PieceError('This phone could not read the photo.');
      const pixels = g.getImageData(0, 0, photo.width, photo.height);
      const flat = warp({ width: photo.width, height: photo.height, data: pixels.data }, corners, PAGE_WIDTH);
      if (!flat) throw new PieceError('Those dots do not make a page. Put one on each corner of the paper.');
      const ink = clean(flat.grey, flat.width, flat.height);
      const out = document.createElement('canvas');
      out.width = flat.width;
      out.height = flat.height;
      const og = out.getContext('2d');
      if (!og) throw new PieceError('This phone could not draw the page.');
      const image = og.createImageData(flat.width, flat.height);
      image.data.set(ink);
      og.putImageData(image, 0, 0);
      const blob = await toBlob(out);
      setPage({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The page could not be made.');
    } finally {
      setBusy('');
    }
  };

  const keep = async () => {
    if (!page) return;
    setBusy('Keeping it…');
    try {
      const piece = await savePiece('page', title || 'Scanned page', page.blob);
      onSaved(piece);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This phone would not keep it.');
    } finally {
      setBusy('');
    }
  };

  const r = photo ? Math.max(photo.width, photo.height) * 0.025 : 0;

  return (
    <Card className="p-5" data-panel="page-scanner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">Scan a page</h2>
          <p className="mt-1 text-sm text-gray-600">
            Take a photo of a page of music, or choose one. It is straightened and made black on white, on this phone.
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel}>Close</Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={choose}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        data-scan-input
      />

      {!photo && (
        <div className="mt-4">
          <Button variant="gold" onClick={() => fileRef.current?.click()} disabled={!!busy}>📷 Take or choose a photo</Button>
        </div>
      )}

      {photo && corners && !page && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-navy">
            Drag the four dots onto the four corners of the paper. On a keyboard, choose a dot with Tab and move it with the arrows.
          </p>
          <div className="relative mx-auto w-full max-w-xl">
            <canvas ref={shown} className="block h-auto w-full rounded-xl" aria-hidden />
            <svg
              ref={svg}
              viewBox={`0 0 ${photo.width} ${photo.height}`}
              className="absolute inset-0 h-full w-full"
              onPointerMove={(e) => {
                if (dragging === null) return;
                const to = toPhoto(e.clientX, e.clientY);
                if (to) move(dragging, to);
              }}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
            >
              <polygon
                points={corners.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="rgba(13, 148, 136, 0.12)"
                stroke="#0f766e"
                strokeWidth={r * 0.25}
              />
              {corners.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={r}
                  fill="#ffffff"
                  stroke="#0f766e"
                  strokeWidth={r * 0.35}
                  tabIndex={0}
                  role="button"
                  aria-label={`${CORNER_NAMES[i]} corner. Move it with the arrow keys.`}
                  style={{ touchAction: 'none', cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    svg.current?.setPointerCapture(e.pointerId);
                    setDragging(i);
                  }}
                  onKeyDown={(e) => onKey(i, e)}
                  data-corner={i}
                />
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void make()} disabled={!!busy}>✨ Make a clean page</Button>
            <Button variant="ghost" onClick={() => setCorners(startingCorners(photo.width, photo.height))}>Reset the dots</Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>Another photo</Button>
          </div>
        </div>
      )}

      {page && (
        <div className="mt-4 space-y-3">
          <img src={page.url} alt="The clean page" className="mx-auto w-full max-w-xl rounded-xl ring-1 ring-navy/10" data-clean-page />
          <label className="block">
            <span className="text-sm font-bold text-navy">Name it</span>
            <input
              id="scan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="For example: Hymn 100, page 1"
              className="tap mt-1 w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-navy/20"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" onClick={() => void keep()} disabled={!!busy}>Keep this page</Button>
            <Button variant="ghost" onClick={() => setPage(null)}>Move the dots again</Button>
          </div>
        </div>
      )}

      {busy && <p role="status" className="mt-3 text-sm font-semibold text-navy">{busy}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
    </Card>
  );
}
