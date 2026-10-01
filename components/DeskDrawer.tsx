'use client';

// The desk (My office, or My room for an Explorer), as a drawer on a phone or a
// pad.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 30 SEPTEMBER 2026, with a screenshot of a phone scrolled past
// the page into My office, On the desk, Pocket and Player: "the mini office
// (like in the desktop) should not be at the bottom for users to scroll down
// at least. For mobile and pads can you make it like a side screen where it's
// only optional to click? Like I'll just click a mini cabinet with an arrow
// '<<<' to appear on it or swipe it at the corner and it will appear, and it
// will disappear if I click an arrow '>>>'."
//
// Below 1280px the desk used to stack UNDER the page, so every page on a phone
// was the page and then a second page of desk that nobody had asked for. It is
// a drawer there now: a small tab on the right edge opens it, the arrows inside
// put it away, and a swipe in from the right edge does the same as the tab.
// It starts closed. From 1280px nothing changes: the desk is the column beside
// the page it has always been, and this component steps out of the way
// entirely (`display: contents`, globals.css `.desk-drawer`).
//
// THE SWIPE IS A SHORTCUT, THE TAB IS THE WAY. Android's gesture navigation
// claims both edges of the screen for Back, so an edge swipe there may be taken
// by the phone before the app sees it. Nobody has to know the swipe exists.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

/** How far in from the right edge a swipe may start, and how far it must go. */
const EDGE = 24;
const PULL = 48;

export function DeskDrawer({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const tab = useRef<HTMLButtonElement>(null);

  // A swipe in from the right edge opens it; a swipe to the right on the open
  // drawer closes it. Horizontal only: a thumb scrolling the page down that
  // drifts sideways is not asking for anything.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking: 'open' | 'close' | null = null;
    const wide = () => window.matchMedia('(min-width: 1280px)').matches;
    const start = (event: TouchEvent) => {
      if (wide()) return;
      const t = event.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      if (!open && t.clientX >= window.innerWidth - EDGE) tracking = 'open';
      else if (open && panel.current?.contains(event.target as Node)) tracking = 'close';
      else tracking = null;
    };
    const end = (event: TouchEvent) => {
      if (!tracking) return;
      const t = event.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (tracking === 'open' && dx < -PULL) setOpen(true);
        if (tracking === 'close' && dx > PULL) setOpen(false);
      }
      tracking = null;
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchend', end);
    };
  }, [open]);

  // Escape puts it away, and the keyboard goes back to the tab that opened it.
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); tab.current?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  // The page behind stays where it was: while the drawer is open the page does
  // not scroll under a thumb that is scrolling the desk.
  useEffect(() => {
    if (!open) return;
    const wasOverflow = document.body.style.overflow;
    if (!window.matchMedia('(min-width: 1280px)').matches) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = wasOverflow; };
  }, [open]);

  return (
    <>
      {/* THE MINI CABINET WITH ITS ARROWS, on the right edge, below 1280px. */}
      <button
        ref={tab}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={`Open ${label}`}
        data-desk-tab
        className="desk-tab no-print fixed right-0 z-40 flex w-9 flex-col items-center gap-1 rounded-l-xl bg-navy py-2.5 text-white lift-3 xl:hidden"
      >
        <CabinetGlyph />
        <span aria-hidden className="text-[11px] font-extrabold leading-none tracking-tighter">‹‹‹</span>
      </button>

      {/* The page behind, dimmed; a tap on it puts the drawer away. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        data-desk-backdrop
        className={`desk-backdrop no-print fixed inset-0 z-[44] bg-black/30 xl:hidden ${open ? 'desk-backdrop-on' : ''}`}
      />

      <div
        ref={panel}
        className="desk-drawer"
        data-open={open ? 'true' : 'false'}
        data-desk-drawer
        role="region"
        aria-label={label}
      >
        {/* THE ARROWS THAT PUT IT AWAY, on the side it came in from. The card
            under them already says "My office", so the bar does not. */}
        <div className="desk-drawer-head xl:hidden">
          <button
            type="button"
            onClick={() => { setOpen(false); tab.current?.focus(); }}
            aria-label={`Put ${label} away`}
            data-desk-close
            className="tap-sm flex items-center rounded-full bg-navy px-3 text-sm font-extrabold tracking-tighter text-white"
          >
            ›››
          </button>
          <p className="sr-only">{label}</p>
        </div>
        {children}
      </div>
    </>
  );
}

/** A small filing cabinet: two drawers and their handles. */
function CabinetGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 12h14M10 7.5h4M10 16.5h4" />
    </svg>
  );
}
