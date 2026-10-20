'use client';

// The things that make the study room look like a study.
//
// ASKED FOR on 20 October 2026: "Make sure the study room feels like a study
// room, like a traditional study room with digital assets on it." So: a shelf
// of books over the bookcase, a reading lamp over the desk, and a ribbon
// bookmark on the open page.
//
// DRAWN HERE, INLINE, AND NOTHING ELSE. No image is downloaded (the room must
// open with no signal), nothing here can be tapped or read aloud (each is
// aria-hidden and pointer-events: none in study-shell.css), and each is only
// drawn where there is room for it, so a 360px phone gives every pixel to the
// writing. The colours are the old bindings of a minister's library: navy,
// oxblood, forest green and the brand's gold.

const BOOKS: Array<{ x: number; w: number; h: number; fill: string; band: string; lean?: number }> = [
  { x: 4, w: 13, h: 46, fill: '#1e2a4a', band: '#e8b84b' },
  { x: 18, w: 10, h: 40, fill: '#7a2a2a', band: '#e9d9b8' },
  { x: 29, w: 15, h: 50, fill: '#2f5a3c', band: '#e8b84b' },
  { x: 45, w: 9, h: 38, fill: '#8a6a3a', band: '#1e2a4a' },
  { x: 55, w: 12, h: 44, fill: '#1e2a4a', band: '#e9d9b8' },
  { x: 70, w: 11, h: 41, fill: '#5a3a5e', band: '#e8b84b', lean: -10 },
  { x: 96, w: 14, h: 48, fill: '#7a2a2a', band: '#e8b84b' },
  { x: 111, w: 10, h: 36, fill: '#2f5a3c', band: '#e9d9b8' },
];

/** A shelf of books, over the room's own name in the bookcase. */
export function Bookshelf({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 60" className={`sr-furniture ${className}`} aria-hidden="true" focusable="false">
      {BOOKS.map((b) => (
        <g key={b.x} transform={b.lean ? `rotate(${b.lean} ${b.x + b.w} 54)` : undefined}>
          <rect x={b.x} y={54 - b.h} width={b.w} height={b.h} rx="1.5" fill={b.fill} />
          <rect x={b.x} y={54 - b.h + 6} width={b.w} height="2.5" fill={b.band} opacity="0.85" />
          <rect x={b.x} y={54 - 9} width={b.w} height="2" fill={b.band} opacity="0.6" />
        </g>
      ))}
      {/* A small stack lying flat, as every real shelf has. */}
      <rect x="84" y="46" width="10" height="4" rx="1" fill="#e9d9b8" />
      <rect x="83" y="50" width="12" height="4" rx="1" fill="#1e2a4a" />
      <rect x="0" y="54" width="128" height="6" rx="1" fill="#8b5e34" />
      <rect x="0" y="54" width="128" height="1.5" fill="#a87545" />
    </svg>
  );
}

/** A green banker's lamp, its light falling on the desk. */
export function DeskLamp({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 120" className={`sr-furniture ${className}`} aria-hidden="true" focusable="false">
      {/* The light, under the shade. */}
      <path d="M30 40 L110 40 L132 116 L8 116 Z" fill="#ffe6a6" opacity="0.28" />
      {/* The green glass shade: a long half-cylinder, darker underneath. */}
      <path d="M22 40 Q22 18 70 16 Q118 18 118 40 Z" fill="#1f5a3a" />
      <path d="M22 40 Q70 30 118 40 L118 44 Q70 35 22 44 Z" fill="#164229" />
      <path d="M34 26 Q70 18 106 26" fill="none" stroke="#5f9a72" strokeWidth="2" opacity="0.7" />
      <rect x="20" y="39" width="100" height="3" rx="1.5" fill="#c99a3b" />
      {/* The brass stem, the pull chain and the foot. */}
      <rect x="66" y="42" width="8" height="52" rx="3" fill="#b8892f" />
      <rect x="66" y="42" width="3" height="52" fill="#d9b25a" opacity="0.6" />
      <line x1="96" y1="44" x2="96" y2="64" stroke="#8a6a24" strokeWidth="1.5" />
      <circle cx="96" cy="66" r="2.6" fill="#8a6a24" />
      <path d="M40 104 Q70 90 100 104 L104 112 L36 112 Z" fill="#b8892f" />
      <path d="M44 104 Q70 94 96 104" fill="none" stroke="#d9b25a" strokeWidth="2" opacity="0.7" />
    </svg>
  );
}

/** A ribbon bookmark, at the top of the page you are writing on. */
export function Ribbon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 56" className={`sr-furniture ${className}`} aria-hidden="true" focusable="false">
      <path d="M0 0 H18 V56 L9 48 L0 56 Z" fill="#8f2d2d" />
      <path d="M2 0 V50" stroke="#b5483f" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}
