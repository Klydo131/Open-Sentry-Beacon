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
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragEnter={(e) => { if (draggingFiles(e)) { e.preventDefault(); setOver(true); } }}
      onDragOver={(e) => { if (draggingFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(e) => {
        // Only when the pointer leaves the box itself, not a child inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!draggingFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length && !busy) onFiles(multiple ? files : files.slice(0, 1));
      }}
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
