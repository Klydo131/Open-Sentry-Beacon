'use client';

// Drag files in, or choose them. One box for every place a person adds a file.
//
// Asked for on 25 September 2026: "files must be drag and drop please ... easy
// to add". On a computer that means dropping a file from the desktop onto the
// box; on a phone, where nothing can be dragged, the same box is a button that
// opens the phone's own picker. Both land in one callback, so a screen that
// accepts files has exactly one way in to reason about.

import { useRef, useState } from 'react';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';

/** True while something being dragged is a file rather than text or a link. */
export function draggingFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Makes any element a place to drop files: spread `handlers` on it, and use
 * `over` to show that it will take them.
 *
 * Asked for on 28 September 2026: a study being written or edited should take a
 * file dropped anywhere on it, not only on the small box inside it. A file
 * dropped a few pixels outside that box was not merely ignored -- the browser
 * opened the file itself, leaving the app and everything typed into the form.
 *
 * A drop that something inside has already taken (the box within the form) is
 * left alone, so one file is never added twice.
 */
export function useFileDropArea(
  onFiles: (files: File[]) => void,
  { busy = false, multiple = true }: { busy?: boolean; multiple?: boolean } = {},
) {
  const [over, setOver] = useState(false);
  const taken = (e: React.DragEvent) => e.isDefaultPrevented() || e.nativeEvent.defaultPrevented;
  const handlers = {
    onDragEnter: (e: React.DragEvent) => { if (draggingFiles(e)) { e.preventDefault(); setOver(true); } },
    onDragOver: (e: React.DragEvent) => {
      if (draggingFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    },
    onDragLeave: (e: React.DragEvent) => {
      // Only when the pointer leaves the area itself, not a child inside it.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!draggingFiles(e)) return;
      setOver(false);
      if (taken(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length && !busy) onFiles(multiple ? files : files.slice(0, 1));
    },
  };
  return { over, handlers };
}

export function FileDrop({
  onFiles,
  busy = false,
  multiple = true,
  title = 'Drag files here',
  hint = 'Photos, PDFs, documents and audio. Up to 10 MB each.',
  id,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  multiple?: boolean;
  title?: string;
  hint?: string;
  /** A stable id for the hidden input, so a label elsewhere can point at it. */
  id?: string;
  /** Smaller, for a box inside a form rather than the main way in. */
  compact?: boolean;
}) {
  const { over, handlers } = useFileDropArea(onFiles, { busy, multiple });
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      {...handlers}
      data-file-drop=""
      className={`rounded-2xl border-2 border-dashed text-center transition-colors ${
        compact ? 'px-3 py-3' : 'px-4 py-5'
      } ${over ? 'border-teal-600 bg-teal-50' : 'border-navy/20 bg-white'}`}
    >
      <p className={`font-bold text-navy ${compact ? 'text-sm' : 'text-base'}`}>{over ? 'Drop to add' : title}</p>
      <p className={`mt-0.5 text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>{hint}</p>
      <label
        className={`tap-sm inline-flex cursor-pointer items-center rounded-full text-sm font-bold ${
          compact ? 'mt-2 bg-white px-3 text-navy ring-1 ring-navy/20' : 'mt-3 bg-navy px-4 text-white'
        } ${busy ? 'pointer-events-none opacity-50' : ''}`}
      >
        {busy ? 'Adding…' : multiple ? 'Choose files' : 'Choose a file'}
        <input
          ref={input}
          id={id}
          type="file"
          multiple={multiple}
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            // Cleared AFTER the files are handed over. Clearing first aborts the
            // read on WebKit, which fails silently on every iPhone.
            if (picked.length) onFiles(picked);
            setTimeout(() => { if (input.current) input.current.value = ''; }, 0);
          }}
        />
      </label>
    </div>
  );
}

/**
 * A whole card or form that takes dropped files, with a clear "drop here" state
 * over it while a file is being dragged across. The small FileDrop box inside it
 * still works on its own, and a drop on the box is not counted twice.
 */
export function DropArea({
  onFiles,
  busy = false,
  label = 'Drop to add',
  className = '',
  children,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { over, handlers } = useFileDropArea(onFiles, { busy });
  return (
    <div
      {...handlers}
      data-drop-area=""
      className={`relative ${over ? 'outline outline-2 outline-teal-600' : ''} ${className}`}
    >
      {children}
      {over && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-teal-50/85"
        >
          <p className="rounded-full bg-white px-4 py-2 text-sm font-bold text-teal-800 shadow-sm ring-1 ring-teal-600/30">
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
