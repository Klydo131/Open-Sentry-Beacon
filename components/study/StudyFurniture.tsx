'use client';

// The things that make the study room look like a study.
//
// ASKED FOR on 20 October 2026: a shelf of books over the bookcase, a reading
// lamp over the desk, and a ribbon bookmark on the open page. On 16 November
// 2026 the room was asked to look finished rather than drawn, and the shelf and
// the lamp went; the ribbon on the page you are writing on stays.
//
// DRAWN HERE, INLINE, AND NOTHING ELSE. No image is downloaded (the room must
// open with no signal), nothing here can be tapped or read aloud (each is
// aria-hidden and pointer-events: none in study-shell.css), and each is only
// drawn where there is room for it, so a 360px phone gives every pixel to the
// writing.

/** A ribbon bookmark, at the top of the page you are writing on. */
export function Ribbon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 56" className={`sr-furniture ${className}`} aria-hidden="true" focusable="false">
      <path d="M0 0 H18 V56 L9 48 L0 56 Z" fill="#8f2d2d" />
      <path d="M2 0 V50" stroke="#b5483f" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}
