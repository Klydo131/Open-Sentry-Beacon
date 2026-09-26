// Places the sample app suggests when somebody tries booking a meet-up.
//
// The sample app talks to nothing (tests/no-backend.js), so it cannot ask a map
// service. It searches this list instead, which is enough to show what the live
// app does: type part of a name, see where each one is, tap one to pin it.
//
// Public landmarks only -- a cathedral, a mall, a park -- never a home or a
// person. The coordinates were looked up on OpenStreetMap on 26 September 2026,
// so Check it on the map opens the right spot. Two cathedrals in two cities are
// here on purpose: typing "cathedral" shows why the address line matters.

import type { PlaceSuggestion } from '@/lib/live/place-pin';

export const SAMPLE_PLACES: PlaceSuggestion[] = [
  { name: 'Manila Cathedral', detail: 'Cabildo Street, Intramuros, Manila, Metro Manila', kind: 'Church', lat: 14.591511, lon: 120.973638 },
  { name: 'Imus Cathedral', detail: 'General J. Castañeda Street, Poblacion III-A, Imus, Cavite', kind: 'Church', lat: 14.42978, lon: 120.936057 },
  { name: 'SM Mall of Asia', detail: 'Seaside Boulevard, Pasay, Metro Manila', kind: 'Mall', lat: 14.535182, lon: 120.981599 },
  { name: 'SM City Bacoor', detail: 'Aguinaldo Highway, Dulong Habay, Bacoor, Cavite', kind: 'Mall', lat: 14.444592, lon: 120.950333 },
  { name: 'Quezon Memorial Circle', detail: 'Elliptical Road, Diliman, Quezon City, Metro Manila', kind: 'Park', lat: 14.651447, lon: 121.049288 },
  { name: 'Ayala Triangle Gardens', detail: 'Ayala Avenue, Bel-Air, Makati, Metro Manila', kind: 'Park', lat: 14.555647, lon: 121.023923 },
  { name: 'Aguinaldo Shrine', detail: 'Tirona Highway, Kaingen, Kawit, Cavite', kind: 'Museum', lat: 14.445, lon: 120.906896 },
];

/** Every sample place whose name or address has all the words typed, in any order. */
export async function searchSamplePlaces(q: string): Promise<PlaceSuggestion[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.join('').length < 3) return [];
  return SAMPLE_PLACES.filter((p) => {
    const hay = `${p.name} ${p.detail}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
