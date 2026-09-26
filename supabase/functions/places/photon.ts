// Place suggestions from OpenStreetMap, shaped so one tap is enough.
//
// ASKED FOR, 26 September 2026: "I can't see my destination if it's really
// going to be that destination unless I already input the destination. I need
// to see the destination name, like auto name in google search, then just
// click or tap it to secure the location."
//
// The search itself is Photon, run by komoot over OpenStreetMap data: made for
// search-as-you-type, free, and needing no account or key a church would have
// to set up and pay for. (OpenStreetMap's own Nominatim forbids exactly this
// use.) What goes to it is the words typed in the place box and, when there is
// one, a point rounded to about ten kilometres to prefer nearby answers. No
// name, no email, no account, and -- because this runs on the church's server
// rather than in the browser -- not the member's own internet address either.
//
// THIS FILE HAS NO BACKSLASHES, ON PURPOSE. Edge functions are deployed by
// sending their source as JSON, and a JSON parser rewrites backslash escapes
// (tests/the-deployed-function-is-the-file.mjs has the history). Whitespace and
// control characters are handled by character code instead, and the test for
// this function refuses a backslash anywhere in it.
//
// Pure functions only: no Deno, no network, so tests/place-search.mjs runs them
// in Node against a real response saved from the service.

export const PHOTON = 'https://photon.komoot.io/api/';

/** One suggestion, as the app draws it and stores it. */
export interface Place {
  /** What the place is called: "Jollibee", "SM City Bacoor". */
  name: string;
  /** Where it is, most specific first: street, barangay, city, province. */
  detail: string;
  /** What kind of place, when that helps tell two apart: "Mall", "Bus stop". */
  kind: string;
  lat: number;
  lon: number;
}

/** How many suggestions are drawn. More is a list nobody reads on a phone. */
export const MAX_PLACES = 6;

/**
 * The words to search for, or null when there is nothing worth asking.
 *
 * Under three characters every answer is a guess, and over eighty it is not a
 * place name any more. Control characters become spaces and runs of spaces
 * become one, done by character code (see the note about backslashes above).
 */
export function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let out = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  const q = out.split(' ').filter(Boolean).join(' ');
  if (q.length < 3 || q.length > 80) return null;
  return q;
}

/**
 * A point to prefer answers near, rounded to one decimal place -- about eleven
 * kilometres, which is "this town", never "this house".
 *
 * Accepts {lat, lon} from the app, or "lat,lon" from the PLACES_NEAR setting a
 * church can give its own server. Anything else is no point at all.
 */
export function nearFrom(raw: unknown): { lat: number; lon: number } | null {
  let lat: unknown;
  let lon: unknown;
  if (typeof raw === 'string') {
    const parts = raw.split(',');
    if (parts.length !== 2) return null;
    lat = Number(parts[0].trim());
    lon = Number(parts[1].trim());
  } else if (raw && typeof raw === 'object') {
    lat = (raw as { lat?: unknown }).lat;
    lon = (raw as { lon?: unknown }).lon;
  } else {
    return null;
  }
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
}

/** The request to Photon. Built with URL, so nothing typed can break out of it. */
export function photonUrl(q: string, near: { lat: number; lon: number } | null): string {
  const url = new URL(PHOTON);
  url.searchParams.set('q', q);
  // Asked for more than are shown, because duplicates are folded together below.
  url.searchParams.set('limit', '12');
  url.searchParams.set('lang', 'en');
  if (near) {
    url.searchParams.set('lat', String(near.lat));
    url.searchParams.set('lon', String(near.lon));
  }
  return url.toString();
}

// What a kind of place is called in words people use. Anything not listed is
// its OpenStreetMap name with the underscores taken out.
const KIND: Record<string, string> = {
  place_of_worship: 'Church',
  fast_food: 'Fast food',
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  mall: 'Mall',
  supermarket: 'Supermarket',
  marketplace: 'Market',
  school: 'School',
  college: 'College',
  university: 'University',
  hospital: 'Hospital',
  clinic: 'Clinic',
  park: 'Park',
  bus_stop: 'Bus stop',
  bus_station: 'Bus terminal',
  taxi: 'Taxi stand',
  library: 'Library',
  community_centre: 'Community centre',
  townhall: 'Town hall',
  house: 'Address',
  city: 'City',
  town: 'Town',
  village: 'Village',
  suburb: 'Area',
  neighbourhood: 'Area',
  quarter: 'Area',
  hamlet: 'Area',
};

function kindOf(key: string, value: string): string {
  if (KIND[value]) return KIND[value];
  if (key === 'highway') return 'Road';
  if (key === 'place') return 'Area';
  if (!value || value === 'yes') return '';
  const words = value.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type Props = Record<string, unknown>;

// Where people wait for a ride, not where they meet.
const STOPS = new Set(['bus_stop', 'taxi', 'platform', 'stop_position', 'halt', 'tram_stop']);
function isStop(f: unknown): boolean {
  const p = ((f as { properties?: unknown })?.properties ?? {}) as Props;
  return STOPS.has(typeof p.osm_value === 'string' ? p.osm_value : '');
}
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Photon's answer, as at most six places a person can tell apart.
 *
 * Five branches of the same restaurant in one city are the normal case, not an
 * edge case -- a search for "jollibee imus" returns exactly that -- so the
 * detail line is what does the work: street, then barangay, then city, then
 * province. The country is added only when the answers are in more than one.
 *
 * Never throws. Anything malformed is skipped rather than drawn wrongly.
 */
export function shape(body: unknown): Place[] {
  const features = (body as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  // PLACES BEFORE THE STOPS NEAR THEM. "SM City Bacoor" is a mall, a bus stop
  // and a tricycle terminal, and the service may list the bus stop first; the
  // person almost always means the mall. Stops stay in the list, after.
  const ordered = [...features].sort((a, b) => Number(isStop(a)) - Number(isStop(b)));

  const rows: (Place & { country: string })[] = [];
  const seen = new Set<string>();
  for (const f of ordered) {
    const p = ((f as { properties?: unknown })?.properties ?? {}) as Props;
    const coords = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const street = [text(p.housenumber), text(p.street)].filter(Boolean).join(' ');
    const name = text(p.name) || street || text(p.city) || text(p.state);
    if (!name) continue;

    const parts: string[] = [];
    const lower = new Set<string>([name.toLowerCase()]);
    for (const part of [street, text(p.locality), text(p.district), text(p.city), text(p.county), text(p.state)]) {
      if (!part || lower.has(part.toLowerCase())) continue;
      lower.add(part.toLowerCase());
      parts.push(part);
    }
    const detail = parts.join(', ');
    const kind = kindOf(text(p.osm_key), text(p.osm_value));
    // The same place listed twice is folded into one -- but only when it is the
    // same KIND of place too, or a mall is lost behind the bus stop at its gate.
    const key = `${name}|${detail}|${kind}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      name: name.slice(0, 120),
      detail: detail.slice(0, 240),
      kind,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      country: text(p.country),
    });
    if (rows.length === MAX_PLACES) break;
  }

  const countries = new Set(rows.map((r) => r.country).filter(Boolean));
  return rows.map(({ country, ...place }) => ({
    ...place,
    detail: countries.size > 1 && country
      ? [place.detail, country].filter(Boolean).join(', ')
      : place.detail,
  }));
}
