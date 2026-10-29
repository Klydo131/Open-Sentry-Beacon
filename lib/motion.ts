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
//   settleIn       bring a screen into place that has just replaced another
//                  without being remounted: the study room's shelf, a page,
//                  a whiteboard.
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

/**
 * Bring into place a screen that has just replaced another in the same box.
 *
 * ASKED FOR ON 29 OCTOBER 2026 in the study room: "Make the transition to have
 * subtle animations". Going in (a page from the shelf) it comes from a little
 * to the right; coming back, from a little to the left, the way a phone pushes
 * and pops a screen; anything else rises a few pixels. 14px at most, over
 * --motion-base, so it reads as a direction and never as a ride.
 *
 * `fade` is opacity alone, for a screen that measures where it is the moment
 * it is drawn: AFFiNE's whiteboard works out which point of the board is under
 * a finger from where its canvas sat when it opened, and a canvas still moving
 * then would put every tap a few pixels off.
 *
 * The box is animated where it is, never remounted: remounting the study
 * room's editor host would throw away the editor. So it is a box that stays
 * while what is inside it changes.
 */
export function settleIn(el: HTMLElement | null, way: 'forward' | 'back' | 'here' | 'fade'): void {
  if (!el || prefersLessMotion() || typeof el.animate !== 'function') return;
  const from = way === 'forward' ? 'translateX(14px)'
    : way === 'back' ? 'translateX(-14px)'
      : way === 'here' ? 'translateY(6px)'
        : 'none';
  el.animate(
    [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }],
    { id: 'settle-in', duration: MOTION.base, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}
