'use client';

// Simple or Advanced: how much of the study-writing form somebody is shown.
//
// ASKED FOR on 28 September 2026: "Make sure the UI for making lesson studies
// are easy and simple use / Most guides are not much technical so there must be
// a simple and advance setting for it."
//
// SIMPLE IS WHERE EVERYBODY STARTS, and it is the whole job: a name, the
// studies, their handouts and drawings, and Save. ADVANCED adds what a Guide who
// wants it can use -- a topic to group the series on the shelf, a line under
// its name, and the marks that make text bold or slanted, which are typed as
// asterisks and look like mistakes to anybody who has not been told.
//
// ONE SETTING FOR THE WHOLE DEVICE, not one per form. Somebody who chose
// Advanced chose it for themselves, and being put back to Simple on the next
// study would be the app forgetting what they said. It lives in this browser
// only: it is a preference about the screen, not something the church needs to
// know. It never hides anything already written -- a topic typed in Advanced is
// still saved after switching back.
//
// Both halves of the app use this, so a Guide who learns it in the sample app
// finds the same switch after signing in.

import { useSyncExternalStore, type KeyboardEvent } from 'react';

export type WritingMode = 'simple' | 'advanced';

const KEY = 'beacon.writing-mode';
const listeners = new Set<() => void>();
// Held here too, so a browser that refuses storage still keeps the choice for
// as long as the tab is open.
let remembered: WritingMode | null = null;

function read(): WritingMode {
  if (remembered) return remembered;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'advanced' || saved === 'simple') remembered = saved;
  } catch {
    // Storage blocked: Simple, which is the safe answer for anybody.
  }
  return remembered ?? 'simple';
}

function subscribe(changed: () => void): () => void {
  listeners.add(changed);
  // Another tab changing it changes it here too.
  const other = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    remembered = null;
    changed();
  };
  window.addEventListener('storage', other);
  return () => {
    listeners.delete(changed);
    window.removeEventListener('storage', other);
  };
}

export function setWritingMode(mode: WritingMode): void {
  remembered = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* kept in memory above */ }
  for (const changed of listeners) changed();
}

/** The current setting. Simple until somebody chooses otherwise. */
export function useWritingMode(): WritingMode {
  return useSyncExternalStore(subscribe, read, () => 'simple');
}

const OPTIONS: Array<{ id: WritingMode; label: string }> = [
  { id: 'simple', label: 'Simple' },
  { id: 'advanced', label: 'Advanced' },
];

/**
 * The switch. Two segments, the chosen one lifted -- the control a phone
 * already uses for "this or that". A radio group underneath, not two toggle
 * buttons: one of the two is always the answer.
 */
export function WritingModeSwitch({ className = '' }: { className?: string }) {
  const mode = useWritingMode();
  const move = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = mode === 'simple' ? 'advanced' : 'simple';
    setWritingMode(next);
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="How much of the form to show"
      onKeyDown={move}
      data-writing-mode={mode}
      className={`inline-flex shrink-0 rounded-full bg-slate-100 p-0.5 ring-1 ring-navy/10 ${className}`}
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
            onClick={() => setWritingMode(o.id)}
            className={`tap-sm rounded-full px-3 text-sm font-semibold transition-colors ${
              on ? 'bg-white text-navy shadow-sm ring-1 ring-navy/10' : 'text-gray-600 hover:text-navy'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One line saying what the other setting would show, so nothing is a mystery. */
export function WritingModeNote() {
  const mode = useWritingMode();
  return (
    <p className="text-sm text-gray-500" data-writing-mode-note="">
      {mode === 'simple'
        ? 'Just what a study needs. Advanced adds a topic and bold text.'
        : 'Adds a topic, a line under the name, and bold or slanted text.'}
    </p>
  );
}
