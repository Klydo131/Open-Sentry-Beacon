'use client';

import Link from 'next/link';
import { useEffect, type RefObject } from 'react';
import { useUrlKey } from '@/lib/url-signal';

// -------------------------------------------------------------------------
// WRITING A POST STARTS ON HOME'S FIRST SCREEN.
//
// The owner, 4 October 2026: "I would love writing the Blog to be simple
// (with advance settings too but that's optional) and can be easily
// accessible to Home page". The writing box was already simple, but it lived
// in Home's Blog folder, behind the folder picker ("Notices, 1 of 3"), and
// nothing on the screen Home opens on said it was there.
//
// So Home's first screen carries one line and one button. The button is an
// ordinary link to the Blog folder with `write=1`: the folder opens, and the
// writing box puts the cursor in Title (useFocusOnWrite). A link rather than
// a click handler, so it also works opened in a new tab, and from anywhere
// else that wants to send somebody to write.
// -------------------------------------------------------------------------

export const WRITE_HREF = '/church?room=blogs&write=1';

/**
 * The prompt on Home's first screen. Only drawn for somebody who can write.
 *
 * ONE ROW, AND THE WHOLE ROW IS THE LINK. The first version was a sentence
 * beside a button, and on a phone the button won the line: the question
 * folded into four short lines and the card stood 171px tall, pushing the
 * church's own card down. A row with a title and a line under it is the same
 * height on a phone as on a computer, and the target is the whole width.
 */
export function WritePostPrompt() {
  return (
    <Link
      href={WRITE_HREF}
      data-write-post
      className="tap flex items-center gap-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5 transition hover:ring-navy/30"
    >
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-xl">
        ✍️
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-navy">Write a post</span>
        <span className="block text-sm text-gray-600">Something to share with your church?</span>
      </span>
      <span aria-hidden className="shrink-0 text-2xl leading-none text-navy">›</span>
    </Link>
  );
}

/**
 * When the address says `write=1`, put the cursor in the title and bring the
 * box into view, then take `write=1` back out of the address so a reload or a
 * back-and-forth does not open the keyboard again.
 */
export function useFocusOnWrite(title: RefObject<HTMLInputElement | null>): void {
  const url = useUrlKey();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('write') !== '1') return;
    const el = title.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    params.delete('write');
    const rest = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }, [url, title]);
}
