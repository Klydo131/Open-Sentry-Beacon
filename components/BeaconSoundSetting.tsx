'use client';

// The switch for Beacon's own notification sound, and a way to hear it.
//
// One component for both halves' Settings, so the sample church and a real
// one describe the sound in the same words. What it does, and why it is only
// heard with Beacon on the screen, is in lib/alert-sound.ts.

import { useEffect, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import { previewBeaconSound, setSoundOn, soundOn } from '@/lib/alert-sound';

/** `compact` matches the sample card's smaller rows; the live card's are roomier. */
export function BeaconSoundSetting({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState(true);
  const [note, setNote] = useState('');
  // Read after mount: the server has no localStorage, and a value that flips
  // on hydration is a flicker and a console warning.
  useEffect(() => setOn(soundOn()), []);

  const flip = (next: boolean) => {
    setOn(next);
    setSoundOn(next);
  };

  const hear = async () => {
    setNote((await previewBeaconSound()) ? '' : 'This browser would not play a sound just now.');
  };

  return (
    <div className={`rounded-xl bg-gray-50 ${compact ? 'p-3' : 'p-4'}`}>
      {/* compact-ui: the phone's 56px tap floor would blow the switch up into
          a blob (app/globals.css). Hear it keeps the floor; it is a button. */}
      <div className="compact-ui flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold text-navy ${compact ? 'text-sm' : ''}`}>{APP_SHORT_NAME}&rsquo;s own sound</p>
          <p className="text-sm text-gray-500">
            While {APP_SHORT_NAME} is on your screen, new alerts play this instead of
            your device&rsquo;s usual sound. When it is not, your device&rsquo;s own
            sound plays, following your ringer.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label={`${APP_SHORT_NAME}'s own sound`}
          onClick={() => flip(!on)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
            on ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            aria-hidden
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <button
        type="button"
        onClick={() => void hear()}
        className="tap-sm mt-3 rounded-xl bg-white px-4 text-sm font-semibold text-navy ring-1 ring-black/10 hover:bg-gray-100"
      >
        <span aria-hidden>▶ </span>Hear it
      </button>
      {note && <p className="mt-2 text-sm text-gray-600">{note}</p>}
    </div>
  );
}
