'use client';

import { useEffect, useState } from 'react';
import { NAVY, GOLD } from '@/lib/brand';
import {
  RELEASE_NOTES,
  markNotesSeen,
  seenNoteIds,
  unseenCount,
} from '@/lib/release-notes';
import { versionLabel } from '@/lib/app-update';

// "What's new" — the panel that answers what actually changed.
//
// A version string and a green tick tell you the app is current. They do not
// tell you what you got, which is the only part a person cares about. This is
// the list, newest first, in plain language, with the releases you have not read
// marked so you can see at a glance whether anything is waiting.

export function WhatsNewButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);

  // Read on the client only — localStorage does not exist during the server
  // render, and reading it during render would mismatch the markup.
  useEffect(() => setUnseen(unseenCount()), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20 ${className}`}
      >
        ✨ What&rsquo;s new
        {unseen > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-bold text-white"
            style={{ backgroundColor: '#DC2626' }}
            aria-label={`${unseen} unread release notes`}
          >
            {unseen}
          </span>
        )}
      </button>
      {open && (
        <WhatsNewPanel
          onClose={() => {
            markNotesSeen();
            setUnseen(0);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function WhatsNewPanel({ onClose }: { onClose: () => void }) {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => setSeen(seenNoteIds()), []);

  // Escape closes, and closing marks everything read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="What's new in Beacon"
      onClick={onClose}
    >
      <div
        className="animate-drop overlay-sheet w-full max-w-lg overflow-y-auto rounded-t-2xl solid-panel bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center gap-3 px-5 py-4 text-white"
          style={{ backgroundColor: NAVY }}
        >
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">What&rsquo;s new</p>
            <p className="text-xs text-white/60">You are on {versionLabel()}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-sm shrink-0 rounded-lg bg-white/10 px-3 text-lg"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          {RELEASE_NOTES.map((n) => {
            const isNew = seen.length > 0 && !seen.includes(n.id);
            return (
              <div key={n.id}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-bold text-navy">{n.title}</p>
                  {isNew && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ backgroundColor: GOLD, color: NAVY }}
                    >
                      New
                    </span>
                  )}
                </div>
                <p className="mb-2 text-xs font-semibold text-gray-500">
                  {new Date(n.date).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <ul className="space-y-1.5">
                  {n.items.map((item) => (
                    <li key={item} className="flex gap-2 text-gray-600">
                      <span aria-hidden style={{ color: GOLD }}>
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
