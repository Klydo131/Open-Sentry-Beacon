'use client';

// The things that make the court room look like a court room.
//
// ASKED FOR on 20 October 2026: "it should really look like a court room if
// you are in the court room." So: the judge's bench in dark wood with the seal
// of the scales above it, a gavel on it, the gallery's chairs in a row, and an
// exhibit tag on every piece of evidence.
//
// DRAWN INLINE, AS THE STUDY ROOM'S FURNITURE IS. Nothing is downloaded,
// nothing moves (a page about somebody's conduct is not the place for an
// animation), nothing can be tapped, and each piece is aria-hidden: the words
// beside them say everything they show.

/** The seal: the scales of justice in a gold ring. */
export function Seal({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`ct-furniture ${className}`} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" fill="#1b2442" stroke="#e8b84b" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#e8b84b" strokeWidth="0.8" opacity="0.6" />
      {/* The beam and its post. */}
      <rect x="31" y="15" width="2" height="31" fill="#e8b84b" />
      <rect x="17" y="20" width="30" height="2" rx="1" fill="#e8b84b" />
      <circle cx="32" cy="15" r="2.4" fill="#e8b84b" />
      {/* The pans, on their chains. */}
      <path d="M19 22 L14 34 M19 22 L24 34" stroke="#e8b84b" strokeWidth="0.9" />
      <path d="M45 22 L40 34 M45 22 L50 34" stroke="#e8b84b" strokeWidth="0.9" />
      <path d="M12.5 34 Q19 40 25.5 34 Z" fill="#e8b84b" />
      <path d="M38.5 34 Q45 40 51.5 34 Z" fill="#e8b84b" />
      <path d="M26 46 L38 46 L36 49 L28 49 Z" fill="#e8b84b" />
    </svg>
  );
}

/** A gavel resting on its block. */
export function Gavel({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 48" className={`ct-furniture ${className}`} aria-hidden="true" focusable="false">
      <ellipse cx="54" cy="41" rx="20" ry="4.5" fill="#3a2414" />
      <rect x="36" y="34" width="36" height="7" rx="2" fill="#6b4226" />
      <g transform="rotate(-24 34 22)">
        <rect x="6" y="19" width="44" height="5" rx="2.5" fill="#8a5a33" />
        <rect x="44" y="9" width="14" height="25" rx="3" fill="#6b4226" />
        <rect x="44" y="13" width="14" height="2.5" fill="#e8b84b" />
        <rect x="44" y="27.5" width="14" height="2.5" fill="#e8b84b" />
      </g>
    </svg>
  );
}

/**
 * The gallery: a row of chairs, the taken ones in gold. Eight drawn however
 * many are filled, because an empty seat is the point: a hearing one person is
 * watching should look like it.
 */
export function GalleryChairs({ taken, className = '' }: { taken: number; className?: string }) {
  const seats = Array.from({ length: 8 }, (_, i) => i < taken);
  return (
    <svg viewBox="0 0 176 30" className={`ct-furniture ${className}`} aria-hidden="true" focusable="false">
      {seats.map((on, i) => {
        const x = 4 + i * 21.5;
        const wood = on ? '#e8b84b' : '#7a5235';
        return (
          <g key={i}>
            <rect x={x} y="2" width="16" height="13" rx="2.5" fill={wood} opacity={on ? 1 : 0.55} />
            <rect x={x - 1} y="15" width="18" height="4" rx="1.5" fill={wood} opacity={on ? 1 : 0.7} />
            <rect x={x + 1} y="19" width="2.5" height="9" fill={wood} opacity={on ? 1 : 0.7} />
            <rect x={x + 12.5} y="19" width="2.5" height="9" fill={wood} opacity={on ? 1 : 0.7} />
          </g>
        );
      })}
    </svg>
  );
}

/** An exhibit tag on its string, with the letter written on it. */
export function ExhibitTag({ label, className = '' }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 56 72" className={`ct-furniture ${className}`} aria-hidden="true" focusable="false">
      <path d="M28 2 Q36 8 30 16" fill="none" stroke="#7a5235" strokeWidth="1.5" />
      <path d="M8 14 L28 6 L48 14 L48 68 L8 68 Z" fill="#f1e4c3" stroke="#b99a62" strokeWidth="1.2" />
      <circle cx="28" cy="16" r="3" fill="#fff8e6" stroke="#b99a62" strokeWidth="1" />
      <text x="28" y="34" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#6b4226"
            fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.8">EXHIBIT</text>
      <text x="28" y="56" textAnchor="middle" fontSize={label.length > 1 ? 15 : 20} fontWeight="700" fill="#1b2442"
            fontFamily="Georgia, 'Times New Roman', serif">{label}</text>
    </svg>
  );
}

/** The witness stand's rail, under the place where a person speaks. */
export function StandRail({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 14" preserveAspectRatio="none" className={`ct-furniture ${className}`} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="320" height="5" rx="2" fill="#6b4226" />
      {Array.from({ length: 17 }, (_, i) => (
        <rect key={i} x={6 + i * 19} y="5" width="3" height="9" fill="#7a5235" />
      ))}
    </svg>
  );
}
