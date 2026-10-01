'use client';

// A panel that hangs off a button and STAYS ON THE SCREEN.
//
// THE BUG THIS EXISTS FOR, photographed on a phone held upright: the
// notification panel opened with its left half off the edge of the screen. The
// heading read "ons", the switch was labelled "ications", and a safeguarding
// report said "rding report needs your attention". Every word that mattered was
// past the edge of the glass.
//
// The cause is that `absolute right-0 w-80` aligns the panel's right edge to the
// BUTTON's right edge and then draws 320px leftwards. That is fine on a wide
// screen. The bell is about two thirds of the way across a phone header, so on a
// 412px portrait screen the panel starts at roughly -50px. Nothing clamps it,
// because nothing in that rule knows how wide the screen is.
//
// Turning the phone sideways made it look fixed. It was not fixed; there was
// simply room. That is why the report was "only good for horizontal".
//
// WHY THIS MEASURES INSTEAD OF USING A BREAKPOINT. The sample-data bell had
// already been patched with `fixed inset-x-3 top-16 ... sm:absolute`, and that
// patch carries a magic number: 4rem, the height of ONE header row. The live
// header wraps its sections onto a second row below `lg`, so the same rule
// would have dropped the panel on top of the header it hangs from. A measured
// position has no number in it to be wrong.
//
// It also fixes three things nobody reported but everybody met:
//   * the panel could be taller than the screen with no way to scroll it;
//   * tapping anywhere else did not close it;
//   * Escape did nothing.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Breathing room between the panel and the edge of the screen. */
const MARGIN = 12;
/** Between the button and the panel. */
const GAP = 8;

export interface AnchoredPanelProps {
  /** The wrapper around the button this panel belongs to. */
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** What it would like to be, in pixels. It gets less when there is less. */
  width?: number;
  /** For screen readers, since this has no visible heading of its own. */
  label: string;
  /**
   * On its way out. The caller keeps it mounted for the length of the exit
   * with `usePresence` (lib/motion.ts):
   *
   *   const panel = usePresence(open);
   *   {panel.mounted && <AnchoredPanel leaving={panel.leaving} ... />}
   */
  leaving?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function AnchoredPanel({
  anchor,
  onClose,
  width = 320,
  label,
  leaving = false,
  className = '',
  children,
}: AnchoredPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    // Hidden until measured. One frame in the wrong place is a visible jump on
    // a phone, and this panel's whole problem was being in the wrong place.
    position: 'fixed',
    visibility: 'hidden',
    top: 0,
    left: 0,
  });

  const place = useCallback(() => {
    const host = anchor.current;
    if (!host || typeof window === 'undefined') return;
    const r = host.getBoundingClientRect();

    // clientWidth, not innerWidth: innerWidth includes the scrollbar on a
    // desktop, which would let the panel sit under it.
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    const w = Math.min(width, vw - MARGIN * 2);
    // Right-aligned to the button, the way a dropdown should read, and then
    // pulled back onto the screen if that put it over an edge. The clamp is the
    // whole fix.
    const wanted = r.right - w;
    const left = Math.min(Math.max(MARGIN, wanted), vw - MARGIN - w);
    const top = r.bottom + GAP;

    setStyle({
      position: 'fixed',
      top,
      left,
      width: w,
      // NEVER TALLER THAN WHAT IS LEFT OF THE SCREEN. A phone held upright has
      // little room under a header, and a list of eleven notifications simply
      // ran off the bottom with nothing to scroll.
      maxHeight: `calc(${Math.max(160, vh - top - MARGIN)}px - env(safe-area-inset-bottom, 0px))`,
      overflowY: 'auto',
      visibility: 'visible',
    });
  }, [anchor, width]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    // Turning the phone is the case that started this, so orientationchange is
    // not optional. Scroll is captured because the header is sticky and any
    // scrolling ancestor moves the button under it.
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panel.current?.contains(target)) return;
      // The button itself toggles; closing here as well would reopen it.
      if (anchor.current?.contains(target)) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      data-anchored-panel
      data-leaving={leaving ? 'true' : undefined}
      style={style}
      // In from the button's corner and back into it: globals.css, "Things
      // that hang off a button".
      className={`${leaving ? 'anchored-out' : 'anchored-in'} z-40 rounded-2xl bg-white text-left lift-3 ring-1 ring-black/10 ${className}`}
    >
      {children}
    </div>
  );
}
