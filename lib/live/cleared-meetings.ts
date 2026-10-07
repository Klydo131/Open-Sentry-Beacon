'use client';

// Appointments a person has cleared from their own list, on this device.
//
// ASKED FOR (7 October 2026): "when I call off online meeting I dont have the
// option to exit it". A called-off or declined appointment stays on both
// people's lists until its time passes, so that both can see who said no
// (components/LiveMeetings.tsx). Once somebody has seen it, they can clear it
// from their own list.
//
// Kept on this device, not in the database. Deleting the row would take the
// record away from the other person too, who may not have seen it yet; a list
// per person in the database would be a database change, not made here.

const KEY = 'beacon-cleared-meetings';
/** Years of appointments; the oldest fall off the front. */
const MOST = 300;

export function clearedMeetings(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Clears one from this person's list here, and returns the whole cleared set. */
export function clearMeeting(id: string): Set<string> {
  const ids = [...clearedMeetings().add(id)].slice(-MOST);
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private browsing or full storage: it is cleared for this visit only.
  }
  return new Set(ids);
}
