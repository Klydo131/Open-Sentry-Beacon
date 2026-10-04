'use client';

// A bar says how tall it is, so the page can make room for it.
//
// The header is sticky and the tab bar is fixed, so the page cannot see either
// of them. Each one publishes its height on <html> as a CSS variable
// (`--app-header`, `--tab-bar`), and globals.css spends it: the page's padding,
// where a scrolled-to control comes to rest, and what floats above the bar.
//
// WHY THIS IS ONE HOOK, AND WHY IT MEASURES THE WAY IT DOES (4 October 2026).
// Three components did this, each with its own copy, and each measured with
// getBoundingClientRect() while React was still putting the new screen in
// place. That forces the browser to lay out the whole page there and then, in
// the middle of the update: about 60ms of every page change on a phone-speed
// processor, spent in the frame where the new screen slides in. Two of the
// copies also ran after EVERY update of the app's frame, not only when the bar
// changed size, because their effect had no dependency list.
//
// Three rules, each learned:
//
//   1. THE FIRST HEIGHT IS WRITTEN AT ONCE, while the bar is being put on the
//      page, so the first frame is already right. It is measured then only if
//      nothing is published yet: once per page load, not once per page change.
//   2. A BAR REPLACED IN THE SAME UPDATE KEEPS ITS HEIGHT. Every page change
//      draws a new tab bar and header. The old one's leaving waits for the end
//      of the update, and the new one's arrival cancels it; otherwise the
//      height would vanish for a frame and everything floating on the bar (the
//      Talk button, the install bar) would drop and jump back.
//   3. LATER CHANGES ARE WRITTEN ON THE NEXT FRAME, not inside the
//      ResizeObserver's own callback. Writing there changed the page's layout
//      while the browser was still delivering size reports, and Safari raised
//      "ResizeObserver loop completed with undelivered notifications" as a
//      page error (the safari run on 218b4bd). A bar's height changes when it
//      rewraps, when the phone turns, and when the tab bar is hidden inside a
//      conversation (it measures 0, and the variable is removed).
//
//   const headerRef = usePublishedHeight('--app-header');
//   <header ref={headerRef}>...</header>

import { useCallback, useRef } from 'react';

type Name = `--${string}`;

/** How many bars are currently publishing under each name. */
const publishing = new Map<Name, number>();

function publish(name: Name, height: number): void {
  const root = document.documentElement;
  const value = height > 0 ? `${Math.ceil(height)}px` : '';
  if (root.style.getPropertyValue(name) === value) return;
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

export function usePublishedHeight(name: Name): (el: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  const frame = useRef(0);

  // A callback ref, not useRef + useEffect: it runs when the element itself
  // arrives or leaves, which is exactly when there is something to measure,
  // and never again for an unrelated re-render.
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    cancelAnimationFrame(frame.current);

    if (!el) {
      // Rule 2: leave at the end of the update, unless a new bar has arrived.
      publishing.set(name, Math.max(0, (publishing.get(name) ?? 0) - 1));
      queueMicrotask(() => {
        if (!publishing.get(name)) document.documentElement.style.removeProperty(name);
      });
      return;
    }

    publishing.set(name, (publishing.get(name) ?? 0) + 1);

    // Rule 1: the first height, at once, and only when there is none yet.
    if (!document.documentElement.style.getPropertyValue(name)) {
      publish(name, el.getBoundingClientRect().height);
    }

    // Rule 3: after that, the browser reports changes and they are written on
    // the next frame. The border box, padding included: the tab bar's bottom
    // padding is the phone's home-indicator inset, and it must be cleared too.
    observer.current = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => publish(name, height));
    });
    observer.current.observe(el);
  }, [name]);
}
