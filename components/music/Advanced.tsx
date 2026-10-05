'use client';

// The Music room's Advanced settings: one tick box per folder.
//
// Asked for on 5 October 2026: "How do we make it more dynamic but also simple
// in Advance mode or setting for users to play and be more creative in music
// play?" The same answer the Sabbath program and the blog already give: every
// folder is exactly as simple as it was, and a tick box at the end opens the
// rest. It is off until somebody ticks it, remembered on this phone only, and
// turning it off puts that folder back as it was.

import { useCallback, useEffect, useState } from 'react';

const KEY = (folder: string) => `beacon:music-advanced:${folder}`;

/** Whether this folder's Advanced settings are open on this phone. */
export function useAdvanced(folder: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try { setOn(localStorage.getItem(KEY(folder)) === '1'); } catch { /* a convenience only */ }
  }, [folder]);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try { localStorage.setItem(KEY(folder), next ? '1' : '0'); } catch { /* a convenience only */ }
  }, [folder]);
  return [on, set];
}

export function AdvancedToggle({ folder, on, onChange, what }: {
  folder: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** What ticking it adds, in a line. */
  what: string;
}) {
  return (
    <label className="flex items-start gap-3 text-navy" data-music-advanced={folder}>
      <input
        id={`music-advanced-${folder}`}
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
      />
      <span>
        <span className="block font-semibold">Advanced settings</span>
        <span className="block text-sm text-gray-500">{what}</span>
      </span>
    </label>
  );
}
