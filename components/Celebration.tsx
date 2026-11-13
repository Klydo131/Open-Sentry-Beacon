'use client';

// Draws lib/celebrate.ts's celebrations: a burst over the page for under three
// seconds, and a line of words. It never takes a tap (pointer-events: none),
// never covers a control for longer than the burst, and is gone afterwards.
// The pieces are plain elements with CSS animations in app/globals.css
// (.celebrate-*), so nothing heavy is loaded for a moment of joy.

import { useEffect, useRef, useState } from 'react';
import { CELEBRATE_EVENT, nextKind, type CelebrationKind } from '@/lib/celebrate';

const PIECES = 18;
const LASTS_MS = 2800;
/** Two finishes in the same breath are one celebration, not a stutter. */
const QUIET_MS = 900;

const HUES = ['#e8b84b', '#0f7b5f', '#2f80ed', '#e05d8a', '#9b6dd6', '#f2994a'];
const GLYPH: Record<CelebrationKind, string[]> = {
  confetti: [''],
  stars: ['★', '✦', '✧'],
  balloons: ['🎈'],
  fireworks: [''],
  hearts: ['\u2665\uFE0F', '\u{1F49B}'],
};

interface Burst { id: number; kind: CelebrationKind; message: string }

export function Celebration() {
  const [burst, setBurst] = useState<Burst | null>(null);
  const last = useRef<CelebrationKind | null>(null);
  const at = useRef(0);

  useEffect(() => {
    let clear = 0;
    const on = (event: Event) => {
      const now = Date.now();
      if (now - at.current < QUIET_MS) return;
      at.current = now;
      const kind = nextKind(last.current);
      last.current = kind;
      const message = String((event as CustomEvent<{ message?: string }>).detail?.message ?? 'Well done!').slice(0, 80);
      setBurst({ id: now, kind, message });
      window.clearTimeout(clear);
      clear = window.setTimeout(() => setBurst(null), LASTS_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => { window.removeEventListener(CELEBRATE_EVENT, on); window.clearTimeout(clear); };
  }, []);

  if (!burst) return null;
  const glyphs = GLYPH[burst.kind];
  return (
    <div key={burst.id} aria-hidden={false} className="celebrate no-print" data-celebration={burst.kind}>
      <div aria-hidden className="celebrate-field">
        {Array.from({ length: PIECES }, (_, i) => {
          const angle = (360 / PIECES) * i;
          const style = {
            '--x': `${(i * 53) % 100}%`,
            '--a': `${angle}deg`,
            '--d': `${(i % 6) * 70}ms`,
            '--c': HUES[i % HUES.length],
            '--s': `${0.8 + ((i * 7) % 5) / 10}`,
          } as React.CSSProperties;
          return (
            <span key={i} className={`celebrate-piece celebrate-${burst.kind}`} style={style}>
              {glyphs[i % glyphs.length]}
            </span>
          );
        })}
      </div>
      <p role="status" className="celebrate-words">{burst.message}</p>
    </div>
  );
}
