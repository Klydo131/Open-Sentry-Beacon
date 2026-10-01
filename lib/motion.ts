// Motion that needs JavaScript, in one place.
//
// ---------------------------------------------------------------------------
// MOST MOTION IS CSS, and belongs there: a class in app/globals.css, switched
// off under prefers-reduced-motion further down the same file. This file is
// for the three things CSS cannot do on its own:
//
//   usePresence    keep a panel on the screen long enough to be seen leaving.
//                  Closing is an unmount; without this a panel simply vanishes.
//   fadeInAfter    fade in whatever a sub-room menu just swapped in below it.
//                  The menu cannot know what each page draws under it, so it
//                  fades the elements that follow it, whatever they are.
//   scrollMotion   'smooth' or 'auto' for scrollIntoView and scrollBy. A
//                  stylesheet's reduced-motion rule never reaches a scroll
//                  started from JavaScript, so it has to ask.
//
// EVERY ONE OF THEM ASKS prefersLessMotion() FIRST. Somebody who has asked
// their device for less movement gets the same screens with nothing moving:
// panels appear and go, rooms swap, scrolls jump.
//
// The numbers are the CSS tokens' (--motion-quick, --motion-base,
// --motion-slow in app/globals.css). tests/every-animation-can-be-stilled.mjs
// fails if they drift apart.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

/** Milliseconds. The same three lengths as the CSS tokens. */
export const MOTION = {
  quick: 160,
  base: 220,
  slow: 280,
} as const;

/** True when the device has been asked for less movement. */
export function prefersLessMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How a scroll started from code should travel. */
export function scrollMotion(): ScrollBehavior {
  return prefersLessMotion() ? 'auto' : 'smooth';
}

/**
 * Keep something mounted while it animates out.
 *
 *   const panel = usePresence(open);
 *   {panel.mounted && <AnchoredPanel leaving={panel.leaving} ... />}
 *
 * Opening is immediate. Closing keeps it for `ms`, with `leaving` true so it
 * can wear its exit class; under reduced motion it goes at once.
 */
export function usePresence(open: boolean, ms: number = MOTION.quick) {
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    if (!shown) return;
    if (prefersLessMotion()) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, shown, ms]);

  return { mounted: open || shown, leaving: !open && shown };
}

/**
 * Fade in what follows `from` on the page: the room a sub-room menu just
 * opened.
 *
 * WHICH ELEMENTS. The menu sits in different wrappers on different pages, so
 * this climbs from it to the first level that has something after it, and
 * fades everything after it at that level. It stops at <main>, so the header
 * and the bar never move.
 *
 * OPACITY ONLY, on purpose. Nothing changes size or place, so a finger already
 * on its way to a button in the new room lands where it was going, and a
 * measurement taken mid-fade is the true one.
 *
 * Run it after the new room is drawn: the caller waits a frame.
 */
export function fadeInAfter(from: HTMLElement | null): void {
  if (!from || prefersLessMotion()) return;
  let level: HTMLElement | null = from;
  while (level && !level.nextElementSibling && level.parentElement && level.tagName !== 'MAIN') {
    level = level.parentElement;
  }
  if (!level || level.tagName === 'MAIN') return;
  for (let next = level.nextElementSibling; next; next = next.nextElementSibling) {
    if (!(next instanceof HTMLElement) || typeof next.animate !== 'function') continue;
    next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.quick, easing: 'ease-out' });
  }
}
