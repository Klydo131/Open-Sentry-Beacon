'use client';

// Simple or Advanced, in the Explorer's study room.
//
// ASKED FOR (7 October 2026): "the study room is way complicated for a new user
// of the app, it must have simple UI and advance UI."
//
// SIMPLE IS WHERE EVERYBODY STARTS. Until 28 October 2026 it hid Starred, the
// Journal, folders, tags, saved views, the star and Markdown in and out. Then:
// "The advance should be same with the simple feature, what I mean for advance
// feature is the little details where users can customize in their liking."
// So both modes have every feature, and ADVANCED adds the Templates gallery
// (components/study/StudyTemplates.tsx). Switching never hides or changes
// anything written.
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
