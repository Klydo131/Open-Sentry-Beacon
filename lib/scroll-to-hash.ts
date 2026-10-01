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
      tries = 0;
      look();
    };
    window.addEventListener('hashchange', again);

    look();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
