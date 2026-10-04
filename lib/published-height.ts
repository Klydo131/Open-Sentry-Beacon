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
// Here a ResizeObserver does the measuring. It reports after the browser has
// laid the page out and before it paints, so the first frame already has the
// right height, and nothing is forced. The variable is written only when the
// height has actually changed. A bar that is hidden (the tab bar inside a
// conversation) measures 0, and the variable is removed so the page gets the
// room back.
//
//   const headerRef = usePublishedHeight('--app-header');
//   <header ref={headerRef}>...</header>

import { useCallback, useRef } from 'react';

export function usePublishedHeight(name: `--${string}`): (el: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);

  // A callback ref, not useRef + useEffect: it runs when the element itself
  // arrives or leaves, which is exactly when there is something to measure,
  // and never again for an unrelated re-render.
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty(name);
      return;
    }
    observer.current = new ResizeObserver(([entry]) => {
      // The border box, padding included: the tab bar's bottom padding is the
      // phone's home-indicator inset, and it is part of what must be cleared.
      // Reading the rect here is cheap; the page has just been laid out.
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
      const value = height > 0 ? `${height}px` : '';
      if (root.style.getPropertyValue(name) === value) return;
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    });
    observer.current.observe(el);
  }, [name]);
}
