// A chosen place, written into an appointment so both people see the same spot.
//
// Asked for on 26 September 2026: "I need to see the destination name, like
// auto name in google search, then just click or tap it to secure the
// location." Securing it means the other person opens THE place that was
// chosen -- this branch, on this street -- and not whatever a map search
// guesses from the words.
//
// NO NEW COLUMN. `meetings.location` has always held a place name and, when
// there is one, a link, and the card already draws exactly that: the words as
// the place, the link as its Open in Maps button (lib/live/meeting-link.ts). A
// chosen place is therefore written as its name and address followed by a map
// link to its exact coordinates. Every appointment made before this still
// reads the way it did, and so does one somebody types by hand.
//
// Pure functions, so tests/place-search.mjs runs them rather than reads them.

/** One suggestion, as the places function returns it. */
export interface PlaceSuggestion {
  name: string;
  detail: string;
  kind: string;
  lat: number;
  lon: number;
}

/** The column's own limit (0009_meetings.sql). */
const MAX_LOCATION = 500;

/** A map link to exactly this point. Opens in Google Maps, or its app on a phone. */
export function pinUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}

/** The place in words: its name, then where it is. */
export function placeWordsOf(p: Pick<PlaceSuggestion, 'name' | 'detail'>): string {
  return [p.name, p.detail].map((s) => s.trim()).filter(Boolean).join(', ');
}

/**
 * What is saved when somebody taps a suggestion: the words, then the pin.
 *
 * The words are cut, never the link: a place that reads a little short still
 * opens in the right spot, and one whose link was cut opens nowhere.
 */
export function pinFor(p: PlaceSuggestion): string {
  const link = pinUrl(p.lat, p.lon);
  const room = MAX_LOCATION - link.length - 1;
  const words = placeWordsOf(p).slice(0, Math.max(0, room)).trim();
  return words ? `${words} ${link}` : link;
}

const PIN = /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=(-?\d{1,2}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i;

/** The exact point an appointment's place was pinned to, or null for typed words. */
export function pinOf(location: string | null | undefined): { lat: number; lon: number } | null {
  const m = PIN.exec(location ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * A suggestion's name cut into the parts that match what was typed and the
 * parts that do not, so the list can draw the typed letters in bold the way a
 * search engine does: "Jolli" of "Jollibee" for "jolli".
 *
 * Every word typed is matched wherever it appears, ignoring case. Where
 * lowering the case changes a string's length (a few letters outside English
 * do), nothing is marked rather than the wrong letters.
 */
export function matchedParts(text: string, typed: string): { text: string; hit: boolean }[] {
  const words = typed.toLowerCase().split(' ').map((w) => w.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  if (!text || words.length === 0 || lower.length !== text.length) return text ? [{ text, hit: false }] : [];
  const hit = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k++) hit[k] = true;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let k = 0; k < text.length; k++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[k]) last.text += text[k];
    else parts.push({ text: text[k], hit: hit[k] });
  }
  return parts;
}

/**
 * Where to prefer suggestions near: the most recent place this pair pinned,
 * rounded to one decimal -- about eleven kilometres, "this town" and never
 * "this house". The rounding happens HERE, before anything leaves the phone.
 */
export function nearOf(locations: (string | null | undefined)[]): { lat: number; lon: number } | null {
  for (const where of locations) {
    const pin = pinOf(where);
    if (pin) return { lat: Math.round(pin.lat * 10) / 10, lon: Math.round(pin.lon * 10) / 10 };
  }
  return null;
}
