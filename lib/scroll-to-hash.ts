'use client';

// Land on the thing that was linked to, not near it.
//
// THE BUG THIS EXISTS FOR: "it doesn't go to the feature I clicked".
//
// A plain `#anchor` link works only if the target is in the document when the
// browser looks for it. In this app it usually is not. The card lives behind a
// tab that has not rendered, or behind data that has not loaded, so the browser
// finds nothing, gives up silently, and leaves the person at the top of a long
// page hunting for what they just pressed. Being sent to the right page and
// abandoned is the same as not being sent.
//
// So this waits for the element instead of assuming it. It polls briefly, and
// gives up rather than looping forever, because a link to something that
// genuinely is not on this screen should fail quietly rather than hang.

import { useEffect } from 'react';
import { scrollMotion } from '@/lib/motion';

/**
 * Scroll to `location.hash` once the element it names actually exists.
 *
 * @param deps things whose arrival might create the element, so the wait can
 *             restart when a tab opens or a list loads.
 */
export function useScrollToHash(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let tries = 0;
    let timer = 0;
    let stopSettling = () => {};

    const look = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        // `start` and not `center`: the heading of the card should be at the
        // top of the screen, the way arriving at a page feels, rather than the
        // card floating in the middle with its heading cut off above.
        el.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
        // A visible mark, briefly. Somebody who followed a link into the middle
        // of a long page needs to be told which card answered it.
        el.classList.add('beacon-landed');
        window.setTimeout(() => el.classList.remove('beacon-landed'), 2200);
        stopSettling = settle(el);
        return;
      }
      // ~3 seconds, then stop. A link to a card this person cannot see should
      // do nothing rather than keep the page busy.
      if (tries++ < 30) timer = window.setTimeout(look, 100);
    };

    // A SECOND PRESS OF THE SAME LINK MUST ALSO WORK. Following `/dm#prayer`
    // while already on `/dm` changes nothing React can see — same page, same
    // props, no re-render — so the effect never runs again and the link looks
    // dead the second time. `hashchange` is the only event that fires.
    const again = () => {
      window.clearTimeout(timer);
      stopSettling();
      tries = 0;
      look();
    };
    window.addEventListener('hashchange', again);

    look();
    return () => {
      window.clearTimeout(timer);
      stopSettling();
      window.removeEventListener('hashchange', again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * LAND, THEN MAKE SURE.
 *
 * A smooth scroll is aimed once, at where the card is when it starts. Two
 * things can leave the page short of it, and Safari showed both are real: the
 * scroll can be cut off part-way, and the page can change height under it,
 * as Settings does when a link switches it to a shorter section. The landing
 * walk on WebKit ended 2842px from the Install card, with nothing to notice.
 *
 * So once the page has stopped moving, look again. If the card is not where a
 * scroll could put it, go there at once (no second animation). At most twice,
 * for about two and a half seconds, and never against the person: any wheel,
 * touch or key from them ends it, because by then they are steering.
 *
 * Returns a function that stops it early.
 */
function settle(el: HTMLElement): () => void {
  let timer = 0;
  let lastY = Number.NaN;
  let still = 0;
  let checks = 0;
  let corrected = 0;
  const steering = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

  const stop = () => {
    window.clearTimeout(timer);
    for (const type of steering) window.removeEventListener(type, stop);
  };

  const check = () => {
    if (!el.isConnected || checks++ >= 25) return stop();
    const y = window.scrollY;
    still = y === lastY ? still + 1 : 0;
    lastY = y;
    if (still >= 2) {
      // Where `block: 'start'` would put the page, allowing for the card's
      // own scroll margin (the header it sits under), and for how far this
      // page can actually go.
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const most = document.documentElement.scrollHeight - window.innerHeight;
      const want = Math.max(0, Math.min(most, y + el.getBoundingClientRect().top - margin));
      if (Math.abs(want - y) <= 48 || corrected >= 2) return stop();
      corrected++;
      still = 0;
      window.scrollTo({ top: want, behavior: 'auto' });
    }
    timer = window.setTimeout(check, 100);
  };

  for (const type of steering) window.addEventListener(type, stop, { passive: true });
  timer = window.setTimeout(check, 100);
  return stop;
}
