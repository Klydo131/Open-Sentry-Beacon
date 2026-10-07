'use client';

// Simple or Advanced, in the Explorer's study room.
//
// ASKED FOR (7 October 2026): "the study room is way complicated for a new user
// of the app, it must have simple UI and advance UI."
//
// SIMPLE IS WHERE EVERYBODY STARTS: a list of pages, New page, search, and on a
// page its name, the writing and a short row of the basics. ADVANCED is the
// room as it was: Starred and the Journal, folders, tags, saved views, the
// whiteboard, the whole insert bar and Markdown in and out. Switching back to
// Simple hides those controls; it never hides or changes anything written.
//
// The room's own segmented control, so it looks like the rest of the room, and
// remembered on this device as the study-writing switch is (WritingMode.tsx).

import type { KeyboardEvent } from 'react';
import { setStudyMode, useStudyMode, type WritingMode } from '@/components/WritingMode';

const OPTIONS: Array<{ id: WritingMode; label: string }> = [
  { id: 'simple', label: 'Simple' },
  { id: 'advanced', label: 'Advanced' },
];

export function StudyModeSwitch({ className = '' }: { className?: string }) {
  const mode = useStudyMode();
  // A radio group: the arrow keys move between the two, as a phone's own
  // segmented controls do with a keyboard attached.
  const move = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = mode === 'simple' ? 'advanced' : 'simple';
    setStudyMode(next);
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="How much of the study room to show"
      onKeyDown={move}
      data-study-mode={mode}
      className={`sr-seg sr-seg--inline ${className}`}
    >
      {OPTIONS.map((o) => {
        const on = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-mode={o.id}
            onClick={() => setStudyMode(o.id)}
            className="tap-sm"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
