// What an Apple device calls the thing everybody else calls Install.
//
// THE ASK, from the owner: "Do not put Install when it is Safari or the device
// is made by Apple. Install is too misleading for Apple users."
//
// They are right, and the code already half knew it. InstallPrompt carries the
// note "Apple has no programmatic install, so Install now cannot install", and
// the button was labelled Install anyway. On an iPhone or iPad the control is
// called Add to Home Screen; on a Mac it is Add to Dock. Neither menu contains
// the word Install anywhere, so somebody told to press Install goes looking
// through a Share sheet for a word that is not in it, and concludes the app is
// broken rather than that the instruction was wrong.
//
// THE THREE ARE NOT ONE. An iPhone and an iPad were treated as a single case
// and they are not: the Share button is at the BOTTOM of Safari on an iPhone
// and at the TOP, in the toolbar, on an iPad. A Mac has no Share button in the
// steps at all, it has a menu bar. So they get three sets of words.

// NO IMPORTS ON PURPOSE. This module is pure so a plain Node test can run it
// against real user-agent strings, and an import of the brand constants would
// drag in the `@/` alias that only the bundler understands. The app's name is
// passed in by the caller, which also keeps it in the one place brand.ts asks
// for it to live.

export type AppleKind = 'iphone' | 'ipad' | 'mac' | null;

/**
 * Which Apple device this is, from a user agent and a touch count.
 *
 * PURE ON PURPOSE, so it can be checked against real user-agent strings in a
 * plain Node test rather than only in a browser. The browser wrapper below is
 * the only part that touches `navigator`.
 *
 * ORDER MATTERS AND IS NOT OBVIOUS, in two directions at once. An iPad on
 * iPadOS 13 or later reports itself as a Macintosh, so it must be caught before
 * the plain Mac case or it is told to use a menu bar it does not have. And an
 * iPhone's user agent contains the words "like Mac OS X", so it must be caught
 * before that same touch-point test or it is answered as an iPad.
 */
export function appleKindFrom(ua: string, maxTouchPoints = 0): AppleKind {
  if (/iPad/i.test(ua)) return 'ipad';
  // THE iPHONE GOES BEFORE THE MAC TEST, and the mac test says `Macintosh`
  // rather than `Mac OS X`. Every iPhone user agent contains the words
  // "like Mac OS X", so the first version of this read an iPhone as an iPad on
  // touch points and sent every iPhone in the church to look for a Share button
  // at the top of Safari, where there has never been one. Caught by the test
  // below running a real iPhone string, not by reading it.
  if (/iPhone|iPod/i.test(ua)) return 'iphone';
  // An iPad running iPadOS 13 or later reports a Macintosh, and the only thing
  // that gives it away is that it reports more than one touch point, which no
  // Mac has ever done.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ipad';
  if (/Macintosh/i.test(ua)) return 'mac';
  return null;
}

/** The same question, asked of the browser this is running in. */
export function appleKind(): AppleKind {
  if (typeof navigator === 'undefined') return null;
  return appleKindFrom(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** The words Apple itself puts on the control, so they can be looked for. */
export function addLabel(kind: AppleKind): string {
  if (kind === 'mac') return 'Add to Dock';
  if (kind) return 'Add to Home Screen';
  return 'Install';
}

/** Short enough for a chip or a tab. */
export function addChip(kind: AppleKind): string {
  if (kind === 'mac') return 'Add to Dock';
  if (kind) return 'Home Screen';
  return 'Install';
}

/** A heading for a card that offers it. */
export function addTitle(kind: AppleKind, app: string): string {
  if (kind === 'mac') return `Add ${app} to your Dock`;
  if (kind) return `Add ${app} to your Home Screen`;
  return `Install ${app}`;
}

/**
 * Where the Share button is, which differs by device and is the single most
 * reported cause of somebody giving up.
 */
export function sharePlace(kind: AppleKind): string {
  if (kind === 'ipad') return 'at the top of Safari, in the toolbar';
  if (kind === 'iphone') return 'at the bottom of Safari';
  return 'in Safari';
}
