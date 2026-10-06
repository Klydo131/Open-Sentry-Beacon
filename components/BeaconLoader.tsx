'use client';

import { useEffect, useState } from 'react';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { APP_NAME } from '@/lib/brand';

// -------------------------------------------------------------------------
// The Beacon loader.
//
// A lighthouse that sweeps its beam while you wait. Built entirely from SVG
// and CSS — no image to download, no animation library, and it renders on the
// very first paint, which is the only time a splash screen is any use.
//
// Two forms:
//   <BeaconSplash />  full screen, for the app's first load
//   <BeaconSpinner /> inline, for a section that is fetching
//
// Both respect prefers-reduced-motion: the sweep stops and the mark simply
// fades, because a rotating beam is exactly the kind of motion that makes some
// people ill.
// -------------------------------------------------------------------------

// THE REAL LOGO, NOT A DRAWING OF ONE.
//
// This drew its own lighthouse: a tower, a lamp, and for a while a sweeping
// beam, all built here in SVG. It was pretty and it was not the brand. People
// saw one mark on the loading screen and a different one on every screen after
// it, which is exactly the kind of thing that makes a product look assembled
// rather than designed. The church app that came before this one had already
// worked that out and fixed it; this is the same fix, brought across.
//
// `SentryBeaconMark` is the mark. The animation stays around it: a halo that
// breathes behind, stopped under prefers-reduced-motion like everything else.
//
// `beacon-halo`, NOT `beacon-glow`. There are two different `.beacon-glow`
// rules in globals.css: one is this breathing animation and the other is the
// big radial ring behind the sign-in door. Reusing the name here would have
// hung the door's blue and gold rings off the loading mark.
function Mark({ size = 96 }: { size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div
        className="beacon-halo absolute -inset-4 rounded-full blur-2xl"
        style={{ backgroundColor: '#2F80ED' }}
        aria-hidden
      />
      <SentryBeaconMark size={size} className="relative" />
    </div>
  );
}

/**
 * The full-screen splash, on first load.
 *
 * QUIETER THAN IT WAS, and every removal is the point. It had a rotating beam,
 * a pulsing halo, a flickering lamp, a wordmark and a sliding bar, five moving
 * things on a screen whose whole job is to be over quickly. A loading screen
 * that is busy makes an app feel slower than the same wait spent looking at
 * something calm.
 *
 * What is left: the mark, the name, one line, and one bar. The bar is the
 * honest part, so it stays; it is the only element that says "still going"
 * rather than merely moving.
 *
 * The ground is a soft vertical wash rather than flat navy, because a flat
 * fill at this size reads as a failed page rather than a deliberate screen.
 */
export function BeaconSplash({
  label = 'Lighting the way…',
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center"
      style={{ background: 'linear-gradient(180deg, #24314f 0%, #1E2A4A 55%, #182240 100%)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <Mark size={88} />
        <div>
          {/* From the brand constant, not typed here. lib/brand.ts is the one
              place the app's name lives, and a loading screen with last year's
              name on it is the most visible place to get that wrong. */}
          <p className="text-[1.6rem] font-extrabold tracking-tight text-white">
            {APP_NAME}
          </p>
          <p className="mt-1.5 text-sm text-white/50">{label}</p>
        </div>
        {/* One bar, thin, and it never claims a percentage. A progress bar that
            invents its own position is a lie that people learn to distrust, so
            this one only travels. */}
        <div className="beacon-track h-[3px] w-32 overflow-hidden rounded-full bg-white/10">
          <div className="beacon-bar h-full w-1/3 rounded-full bg-gold" />
        </div>
      </div>
    </div>
  );
}

/**
 * The inline wait.
 *
 * `inline` puts the mark and the label on one line at a small size, for a
 * section inside a card that is fetching. Without it the loader is centred
 * with generous padding, which is right for a whole page and far too heavy
 * for a strip inside a card.
 *
 * A SECOND LOADER WAS ALMOST WRITTEN FOR THIS — a plain grey ring, because the
 * inline case did not fit. Two spinners in one product is two answers to "is
 * it working?", and people learn one of them. The variant belongs here.
 *
 * The label is the accessible name. A spinner with no words announces "busy"
 * and leaves a screen reader user guessing at what.
 */
export function BeaconSpinner({
  label = 'Loading…',
  size = 48,
  inline = false,
  className = '',
}: {
  label?: string;
  size?: number;
  inline?: boolean;
  className?: string;
}) {
  if (inline) {
    return (
      <div className={`flex items-center gap-2.5 ${className}`} role="status" aria-live="polite">
        <Mark size={22} />
        <span className="beacon-spinner-label text-sm font-semibold text-gray-500">{label}</span>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Mark size={size} />
      <p className="text-sm font-semibold text-gray-500">{label}</p>
    </div>
  );
}

/**
 * A grey block standing in for content that is about to arrive.
 *
 * Used where the SHAPE of what is coming is known — a list of cards, a row of
 * rows. It keeps the page from jumping when the real thing lands, which a
 * centred spinner does not.
 */
export function Skeleton({ className = '', rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="beacon-skeleton block h-12 rounded-xl bg-gray-100"
          // Staggered, so it reads as one thing loading rather than several
          // unrelated boxes flashing at each other.
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

// Wraps the app on first mount: shows the splash until the client is ready,
// then fades it out. `minMs` keeps it on screen just long enough to read as
// intentional rather than a flash of navy.
export function BootSplash({
  ready,
  minMs = 550,
}: {
  ready: boolean;
  minMs?: number;
}) {
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => setDone(true), 320);
    }, minMs);
    return () => clearTimeout(t);
  }, [ready, minMs]);

  if (done) return null;
  return (
    <div className={leaving ? 'beacon-splash-out' : undefined}>
      <BeaconSplash />
    </div>
  );
}
