// A small celebration when an Explorer finishes something.
//
// Asked for on 13 November 2026.
//
// A screen calls celebrate('Lesson read!') at the moment something is done;
// components/Celebration.tsx, mounted once in each shell, draws it. Five kinds,
// and never the same one twice in a row, so it does not become wallpaper. With
// reduced motion asked for, the words show and nothing moves.

export const CELEBRATE_EVENT = 'beacon:celebrate';

export const CELEBRATIONS = ['confetti', 'stars', 'balloons', 'fireworks', 'hearts'] as const;
export type CelebrationKind = (typeof CELEBRATIONS)[number];

/** A different kind from the last one, at random among the others. */
export function nextKind(last: CelebrationKind | null, roll: number = Math.random()): CelebrationKind {
  const pool = CELEBRATIONS.filter((k) => k !== last);
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}

/** Celebrate with a few words. Safe anywhere: on the server it does nothing. */
export function celebrate(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT, { detail: { message } }));
}
