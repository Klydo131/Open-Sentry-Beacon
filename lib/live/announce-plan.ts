// What to pop up, given what is waiting.
//
// THE ASK.
//
// It did not. The bell announced things that arrived WHILE somebody was already
// looking at the app, and deliberately said nothing on the first poll — which
// is the sign-in moment, because the bell only mounts inside the signed-in
// shell. So the one case that most needs a pop-up, arriving to find a
// safeguarding report waiting, was the one case that never got one.
//
// The reason for that silence was real and is kept: opening the app after a
// quiet week fired ELEVEN separate pop-ups at once, and somebody buried like
// that switches alerts off and then hears about nothing ever again. But silence
// is not the fix for eleven. One is.
//
// Kept out of the component so it can be run. The failure mode here is a
// counting mistake nobody sees until a real person is buried or ignored.

export interface Waiting {
  id: string;
  title: string;
  body?: string | null;
  type: string;
}

export type Announcement =
  | { kind: 'none' }
  /** One pop-up, showing the item itself. */
  | { kind: 'one'; item: Waiting }
  /** One pop-up summarising several. */
  | { kind: 'summary'; count: number }
  /** Up to three separate pop-ups, and a summary when more were held back. */
  | { kind: 'each'; items: Waiting[]; heldBack: number };

/** Never bury somebody: this many at once, at the very most. */
export const AT_MOST = 3;

/**
 * @param fresh    unread items this device has not announced before
 * @param arriving true on the first poll after signing in or coming online
 * @param alerts   the person's own switch
 * @param allowed  whether the browser has granted permission
 */
export function planAnnouncement(
  fresh: Waiting[],
  { arriving, alerts, allowed }: { arriving: boolean; alerts: boolean; allowed: boolean },
): Announcement {
  if (!alerts || !allowed || fresh.length === 0) return { kind: 'none' };

  if (arriving) {
    // ONE, WHATEVER THE NUMBER. A person who has just opened the app is about
    // to see the list anyway; the pop-up's job is to tell them there IS one.
    // A single item is shown as itself, because "Melo asked for prayer" is
    // worth more than "1 thing is waiting" and lands on the right screen.
    return fresh.length === 1
      ? { kind: 'one', item: fresh[0] }
      : { kind: 'summary', count: fresh.length };
  }

  // Arriving while the app is open. They are watching; one at a time is fine.
  return {
    kind: 'each',
    items: fresh.slice(0, AT_MOST),
    heldBack: Math.max(0, fresh.length - AT_MOST),
  };
}
