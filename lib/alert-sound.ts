// Beacon's own sound, and when a notification uses it.
//
// THE ASK: "make sure the notification sound is unique and has a distinct
// sound."
//
// ---------------------------------------------------------------------------
// WHAT A WEB APP CAN AND CANNOT DO, because the answer is not "anything".
//
// The sound of a notification on the lock screen belongs to the phone. There
// is no `sound` option in the web's notification standard (it was proposed
// and never implemented), so no website can choose it. A notification can
// only be asked to make the device's usual sound or to make none (`silent`).
//
// What a web app CAN do is make a sound of its own while it is on the screen.
// So that is the rule:
//
//   Beacon on your screen  ->  Beacon's sound, and the notification is shown
//                              silently so the two never play together.
//   Beacon not on screen   ->  the phone's own notification sound, which also
//                              obeys the ringer and Do Not Disturb.
//
// ON SCREEN ONLY, ON PURPOSE. A sound made by a web page follows the MEDIA
// volume on Android, not the ringer, so a phone set to vibrate for church would
// still chime. A person looking at Beacon can see it and switch it off; a phone
// in a pocket is better left to the ringer the person already set.
//
// It goes straight to the speakers, not through a media element as the
// ambience in lib/player.tsx does. On an iPhone that means the silent switch
// mutes it, which is exactly right for a notification and exactly wrong for
// rain sounds somebody chose to play.
//
// NOTHING IS DOWNLOADED. The sound is made by oscillators on the device, like
// the Music room's click, so there is no file to fetch, cache or license.
// ---------------------------------------------------------------------------

/** One struck note of the sound. Times are seconds from the start. */
export interface Note {
  at: number;
  hz: number;
  /** How long it rings before it is gone. */
  len: number;
  level: number;
}

/**
 * THE SOUND: a glint. Up a fifth and settling on the third, D6, A6, F♯6, the
 * last one held, like a light that flashes and then stays on.
 *
 * DISTINCT FROM BEACON'S OTHER SOUNDS as well as from other apps. The wind
 * chimes in the Music room strike single random notes of C major pentatonic
 * with a bell's out-of-tune partial and ring for seconds. This is a fixed
 * figure, ends on F♯, which no chime voice has, uses only in-tune harmonics
 * (glass, not metal) and is over in under a second.
 * tests/beacon-has-its-own-sound.mjs holds it to all of that.
 */
export const BEACON_NOTES: readonly Note[] = [
  { at: 0.0, hz: 1174.66, len: 0.22, level: 0.7 },
  { at: 0.1, hz: 1760.0, len: 0.24, level: 0.6 },
  { at: 0.2, hz: 1479.98, len: 0.7, level: 0.9 },
];

/**
 * Whole-number partials, quieter and shorter as they go up: bright on the
 * strike and mellow in the tail. [ratio, share of the note, share of its ring]
 */
export const PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [2, 0.16, 0.5],
  [3, 0.05, 0.3],
];

/**
 * The whole sound's level. Rendered in Chromium it peaks near -8 dBFS with
 * nothing clipped: clear on a phone speaker, under whatever the media volume
 * is set to.
 */
export const LEVEL = 0.42;

/**
 * Put the sound on any audio graph, starting at `at`. Returns when it ends.
 * The app plays it through an AudioContext; the owner's preview files are
 * rendered through an OfflineAudioContext with this same function.
 */
export function scheduleBeaconSound(
  c: BaseAudioContext,
  to: AudioNode,
  at: number,
  notes: readonly Note[] = BEACON_NOTES,
): number {
  const out = c.createGain();
  out.gain.value = LEVEL;
  out.connect(to);
  let end = at;
  for (const n of notes) {
    const t = at + n.at;
    for (const [ratio, share, ring] of PARTIALS) {
      const len = n.len * ring;
      // exponentialRamp cannot reach zero, so it aims near silence and the
      // oscillator is stopped just after.
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(n.level * share, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      env.connect(out);
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = n.hz * ratio;
      osc.connect(env);
      osc.start(t);
      osc.stop(t + len + 0.02);
      end = Math.max(end, t + len + 0.02);
    }
  }
  return end;
}

// ---- The person's switch ---------------------------------------------------

const KEY = 'hb-sound';

/** On unless somebody turned it off, on this device. */
export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

// ---- Playing it ------------------------------------------------------------

let ctx: AudioContext | null = null;
let unlocked = false;
let lastPlayed = -Infinity;
let sleep: ReturnType<typeof setTimeout> | undefined;

/**
 * Several things arriving at once make one sound. A notification inside this
 * window counts as already announced, so it is still shown silently.
 */
export const BURST_MS = 1500;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = W.AudioContext ?? W.webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { return null; }
  return ctx;
}

/** Let the audio clock rest between sounds, so an idle tab holds no speaker open. */
function restSoon(c: AudioContext, until: number): void {
  clearTimeout(sleep);
  sleep = setTimeout(() => { void c.suspend().catch(() => {}); }, Math.max(0, until - c.currentTime) * 1000 + 300);
}

async function wake(c: AudioContext): Promise<boolean> {
  if (c.state === 'running') return true;
  try {
    await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 300))]);
  } catch { /* refused */ }
  return (c.state as string) === 'running';
}

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

function disarm(): void {
  for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
}

function onGesture(): void {
  const c = audio();
  if (!c) return;
  void wake(c).then((running) => {
    if (!running) return;
    unlocked = true;
    disarm();
    restSoon(c, c.currentTime);
  });
}

/**
 * A BROWSER WILL NOT LET A PAGE MAKE A SOUND UNTIL SOMEBODY HAS TOUCHED IT, and
 * Safari wants the audio started inside that touch. So the first tap or key
 * anywhere opens the audio clock, plays nothing, and lets it rest. A
 * notification later in the visit can then be heard. Until then playBeaconSound
 * answers false and the notification keeps the device's own sound.
 *
 * Mounted once, by components/ServiceWorker.tsx. Returns the undo. Arming
 * twice adds nothing: the same listener is only ever added once.
 */
export function armBeaconSound(): () => void {
  if (typeof window === 'undefined') return () => {};
  for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
  return disarm;
}

/**
 * Play Beacon's sound for something that has just arrived. True when the
 * person heard it (now, or a moment ago for the same burst), and only then may
 * the notification be silent. False sends it back to the device's sound.
 */
export async function playBeaconSound(): Promise<boolean> {
  if (!soundOn()) return false;
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  if (Date.now() - lastPlayed < BURST_MS) return true;
  const c = ctx;
  if (!c || !unlocked) return false;
  if (!(await wake(c))) {
    // An iPhone call or another app can take the audio away. Ask for the next
    // tap again rather than failing quietly for the rest of the visit.
    unlocked = false;
    armBeaconSound();
    return false;
  }
  lastPlayed = Date.now();
  restSoon(c, scheduleBeaconSound(c, c.destination, c.currentTime + 0.02));
  return true;
}

/** The Hear it button. Plays even with the switch off: it was asked for. */
export async function previewBeaconSound(): Promise<boolean> {
  const c = audio();
  if (!c || !(await wake(c))) return false;
  unlocked = true;
  restSoon(c, scheduleBeaconSound(c, c.destination, c.currentTime + 0.02));
  return true;
}

// ---- Which notification is which -------------------------------------------

/**
 * WHY TAGS MATTER TO SOUND. Every notification used to carry the tag `beacon`.
 * A notification with the tag of one already showing REPLACES it, and by the
 * standard it makes no sound doing so unless `renotify` is set. So the second
 * thing to arrive while the first was still in the tray made no sound at all.
 *
 * A tag per item. The service worker (app/sw.js/route.ts) works out the same
 * one from a push, so a push and the open app announcing the same item still
 * collapse into one notification. Title and body are cut exactly as the
 * `notify` function cuts them before sending, or the two would never match.
 */
export function tagFor(title: string, body?: string | null): string {
  const s = `${title.trim()}\n${(body ?? '').slice(0, 300)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `beacon:${h.toString(36)}`;
}

const proto = (): object | null =>
  typeof Notification === 'undefined' ? null : (Notification.prototype as object);

/** Can a notification be shown with no sound? Not on an iPhone. */
export const silentSupported = (): boolean => { const p = proto(); return !!p && 'silent' in p; };

/** Can a replacement sound again? Chrome and Edge only. */
export const renotifySupported = (): boolean => { const p = proto(); return !!p && 'renotify' in p; };

export interface AlertWanted {
  body?: string;
  url: string;
  tag: string;
  /** A new one for the same thing should sound again, like a new message. */
  renotify?: boolean;
  /** Beacon's own sound was heard for it. */
  heard: boolean;
}

/**
 * The options a notification is shown with. Kept out of lib/push.ts so it can
 * be run in a test rather than read.
 */
export function alertOptions(
  w: AlertWanted,
  can: { silent: boolean; renotify: boolean },
): NotificationOptions & { renotify?: boolean } {
  const options: NotificationOptions & { renotify?: boolean } = {
    body: w.body,
    icon: '/icons/icon.svg',
    badge: '/icons/icon-maskable.svg',
    data: { url: w.url },
    tag: w.tag,
  };
  if (w.renotify) {
    // Where a replacement cannot sound again, do not replace: a tag of its
    // own makes it a new notification, and a new one always sounds.
    if (can.renotify) options.renotify = true;
    else options.tag = `${w.tag}:${Date.now().toString(36)}`;
  }
  // NEVER SILENT UNLESS BEACON'S SOUND WAS HEARD. A silent notification with
  // no sound of ours is a notification nobody hears.
  if (w.heard && can.silent) options.silent = true;
  return options;
}
