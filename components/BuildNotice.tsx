'use client';

import { useEffect, useState } from 'react';

// A build banner that says its piece and then gets out of the way.
//
// The previous version was permanently parked at bottom-centre, which is where
// page actions live — it sat directly on top of "Reset demo data" and made it
// unclickable. A label nobody can dismiss is not a safeguard, it is an
// obstruction: after the first few seconds it stops being read and only ever
// costs you the control underneath it.
//
// So: it appears, it is legible for a few seconds, it leaves. It comes back
// every so often so a long session never forgets which build it is on, and it
// sits at the top where nothing is tappable — never over the page's own buttons.
export function BuildNotice({
  label,
  color,
  showMs = 7000,
  repeatMs = 20 * 60 * 1000,
}: {
  label: string;
  color: string;
  showMs?: number;
  repeatMs?: number;
}) {
  const [shown, setShown] = useState(false);
  // 4.5rem was hardcoded, which assumed every screen has the app header. The
  // landing and sign-in pages do not, so the badge landed on top of the logo.
  // Measure instead: below a header that is actually pinned to the top of the
  // viewport, near the top edge otherwise.
  const [top, setTop] = useState('4.5rem');
  // Centred under the app header, where the row is empty. Tucked into the
  // corner everywhere else, so it can never sit across a centred heading.
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout>;

    // Follow the header only when it is genuinely STUCK to the top.
    //
    // Two wrong versions preceded this one, and both put the badge on top of
    // something a person was trying to read. The first followed whatever the
    // page's first <header> happened to be, wherever it happened to be: the
    // landing page's hero is a plain scrolling header, so after a little
    // scrolling its bottom edge sat mid-screen and the notice parked there,
    // directly over the "Who are you in your church?" cards. The second tested
    // `top <= 1`, which the hero also satisfies at scroll 0 — because it starts
    // at the top of the document — so the badge landed on the section heading
    // instead.
    //
    // What actually distinguishes the app's header is that it is sticky. So ask
    // the element, the way components/Quest.tsx does.
    const stuckToTop = (el: Element | null): boolean => {
      let node: Element | null = el;
      while (node && node !== document.body) {
        const pos = getComputedStyle(node).position;
        if (pos === 'sticky' || pos === 'fixed') return true;
        node = node.parentElement;
      }
      return false;
    };

    const place = () => {
      const el = document.querySelector('header');
      const r = el?.getBoundingClientRect();
      const under = !!r && stuckToTop(el) && r.top <= 1 && r.bottom > 8;
      setPinned(under);
      setTop(under ? `${Math.round(r.bottom) + 12}px` : '0.75rem');
    };

    const flash = () => {
      place();
      setShown(true);
      hide = setTimeout(() => setShown(false), showMs);
    };

    // Keep measuring while it is up. One reading taken 900ms after mount was
    // sometimes taken mid-navigation, against the previous screen's header, and
    // the notice then sat on top of the next screen's header for its whole life.
    const track = setInterval(place, 500);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);

    // A short delay so it does not fight the first paint.
    const first = setTimeout(flash, 900);
    const again = setInterval(flash, repeatMs);

    // Coming back to the app after a while is exactly when a reminder is worth
    // showing again — you may not remember which build you left open.
    const onVisible = () => {
      if (document.visibilityState === 'visible') flash();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearInterval(again);
      clearInterval(track);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showMs, repeatMs]);

  if (!shown) return null;

  // Under the app header, or out of the way entirely.
  //
  // Below a sticky header, tucked right: the page title underneath is
  // left-aligned, so centring put the badge straight across it. Without one,
  // every top position collides with something: the landing page's content
  // starts at the very top and is centred, so the badge sat across the logo,
  // then across the section heading, then across the heading's right-hand end.
  // Bottom-left is the one corner nothing else uses — the install prompt and the
  // feedback nudge both live bottom-right.
  return (
    <div
      data-steps-aside-for-chat
      className={
        pinned
          ? 'no-print pointer-events-none fixed inset-x-0 z-[65] flex justify-end px-3'
          : 'no-print safe-bottom pointer-events-none fixed bottom-3 left-3 z-[65] flex px-0'
      }
      style={pinned ? { top } : undefined}
      role="status"
      aria-live="polite"
    >
      <button
        onClick={() => setShown(false)}
        className="animate-drop pointer-events-auto max-w-[92vw] rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg"
        style={{ backgroundColor: color }}
        aria-label={`${label}. Tap to dismiss`}
      >
        {label}
      </button>
    </div>
  );
}
