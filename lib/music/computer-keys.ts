// A computer's keyboard as a piano's: the row A S D F G H J K L ; plays the
// white keys from C, the row above (W E, T Y U, O P) the black ones, and Z and
// X move down and up an octave. The same layout most music programs use.
//
// Asked for on 15 October 2026: "Not just on phone but on desktop too,
// remember people will use all devices for this ministry tool so make it more
// convenient to ALL devices." On a phone a note is tapped; on a computer it can
// be typed, without reaching for the mouse. Used by Sing the note and by Play.
//
// The keys are read by where they sit (KeyboardEvent.code), not by the letter
// they print, so a French or German keyboard plays the same shape.

/** Semitones above the C shown, for each key that plays a note. */
const NOTE_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

/** The letter printed on each of those keys (an English keyboard), for the hints on the piano. */
const LETTER: Record<string, string> = { Semicolon: ';' };

/** The note a key plays, as semitones above the C shown, or null. */
export function noteKey(code: string): number | null {
  return code in NOTE_KEYS ? NOTE_KEYS[code] : null;
}

/** -1 for an octave down (Z), 1 for up (X), or null. */
export function octaveKey(code: string): -1 | 1 | null {
  return code === 'KeyZ' ? -1 : code === 'KeyX' ? 1 : null;
}

/** The letter to show on the piano key `step` semitones above the C shown, or '' for none. */
export function keyLetter(step: number): string {
  const code = Object.keys(NOTE_KEYS).find((c) => NOTE_KEYS[c] === step);
  return code ? LETTER[code] ?? code.replace(/^Key/, '') : '';
}

/** Inputs that take no typing: a tick box just ticked must not stop the keys playing. */
const NOT_TYPED = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];

/**
 * Whether a key press belongs to the computer's piano: not while somebody is
 * writing in a box, not with Ctrl, Alt or Cmd held (those are the browser's),
 * and not a key held down repeating.
 */
export function playable(e: Pick<KeyboardEvent, 'target' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return false;
  const t = e.target as (HTMLElement & { isContentEditable?: boolean; type?: string }) | null;
  if (!t || typeof t !== 'object') return true;
  const tag = typeof t.tagName === 'string' ? t.tagName.toLowerCase() : '';
  if (tag === 'input') return NOT_TYPED.includes(String(t.type || 'text').toLowerCase());
  return !(tag === 'textarea' || tag === 'select' || t.isContentEditable);
}
