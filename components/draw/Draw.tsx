'use client';

// The light half of the drawing board: the button, the picture, and the door
// the heavy half comes in through.
//
// Everything a study screen needs to OFFER a drawing lives here and weighs
// nothing. The board itself (components/draw/DrawingBoard.tsx, with Excalidraw
// in it) is fetched by next/dynamic the moment somebody presses Draw a picture,
// so a Guide reading a study, or an Explorer, never downloads it.

import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';

import { BeaconSpinner } from '@/components/BeaconLoader';
import { PencilGlyph } from '@/components/Glyph';
import { drawingTitle, nextDrawingName } from '@/lib/drawing-file';

export const DrawingBoard = dynamic(
  () => import('@/components/draw/DrawingBoard').then((m) => m.DrawingBoard),
  {
    ssr: false,
    // FULL SCREEN WHILE IT ARRIVES, because what it is loading is full screen.
    loading: () => (
      <div className="fixed inset-0 z-[100] grid place-items-center solid-panel bg-white">
        <BeaconSpinner inline label="Opening the drawing board" />
      </div>
    ),
  },
);

/**
 * "Draw a picture": opens the board, and hands back the finished picture as a
 * file named after the drawings already there.
 */
export function DrawButton({ onDrawn, existing = [], busy = false, title = 'Draw a picture' }: {
  /** The picture, as a PNG file with the drawing inside it. */
  onDrawn: (file: File) => void | Promise<void>;
  /** Names already on this study, so the next is "Drawing 2", not "Drawing". */
  existing?: Array<string | undefined | null>;
  busy?: boolean;
  /** What the board's bar says. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        data-draw-button=""
        className="tap-sm inline-flex items-center gap-2 justify-self-start rounded-full bg-white px-4 text-sm font-bold text-navy ring-1 ring-navy/20 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <PencilGlyph size={18} />
        Draw a picture
      </button>
      {open && (
        <DrawingBoard
          name={nextDrawingName(existing)}
          title={title}
          onClose={() => setOpen(false)}
          onSave={async (file) => { await onDrawn(file); setOpen(false); }}
        />
      )}
    </>
  );
}

/** An address for a file held in the browser, released when it is not shown. */
export function useFileUrl(file: File | null | undefined): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}

/**
 * A drawing, shown as the picture it is. White behind it and a hairline round
 * it, because most drawings are dark lines on nothing and would otherwise
 * vanish into the card.
 */
export function DrawingPicture({ src, name, children }: {
  /** Where the picture is: a signed address, a blob: or a data: URL. Empty while it is fetched. */
  src: string;
  name: string;
  /** What can be done with it, drawn under it: Change drawing, Remove. */
  children?: ReactNode;
}) {
  const title = drawingTitle(name);
  return (
    <figure className="grid gap-1" data-drawing-picture="">
      <div className="grid min-h-[96px] place-items-center overflow-hidden rounded-xl bg-white p-2 ring-1 ring-navy/10">
        {src
          // A plain <img>: this is a user's picture at an address that expires,
          // which next/image's optimiser cannot fetch and should not cache.
          ? <img src={src} alt={title} className="max-h-72 w-auto max-w-full object-contain" />
          : <span className="text-sm text-gray-500">Loading the picture…</span>}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-navy">
          <PencilGlyph size={15} />
          <span className="min-w-0 break-words">{title}</span>
        </span>
        {children}
      </figcaption>
    </figure>
  );
}
