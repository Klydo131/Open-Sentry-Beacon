// Beacon's own notification sound.
//
// No web app can choose the sound of the phone's own notification: the
// standard offers only `silent`. So with Beacon on screen we play our sound
// and show the notification silently; otherwise the phone's sound plays.
// On screen only, because a page's sound follows the media volume on Android,
// not the ringer. Sent straight to the speakers, so an iPhone's silent switch
// mutes it.

export interface Note {
  at: number;
  hz: number;
  len: number;
  level: number;
}

// D6, A6, F♯6. Ends on a pitch no Music-room chime plays (the test holds it).
export const BEACON_NOTES: readonly Note[] = [
  { at: 0.0, hz: 1174.66, len: 0.22, level: 0.7 },
  { at: 0.1, hz: 1760.0, len: 0.24, level: 0.6 },
  { at: 0.2, hz: 1479.98, len: 0.7, level: 0.9 },
];

// [ratio, share of the note, share of its ring]
export const PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [2, 0.16, 0.5],
  [3, 0.05, 0.3],
];

// Peaks near -8 dBFS, measured in Chromium.
export const LEVEL = 0.42;

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
      // exponentialRamp cannot reach zero.
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

const KEY = 'hb-sound';

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

let ctx: AudioContext | null = null;
let unlocked = false;
let lastPlayed = -Infinity;
let sleep: ReturnType<typeof setTimeout> | undefined;

// Alerts arriving together make one sound.
export const BURST_MS = 1500;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = W.AudioContext ?? W.webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { return null; }
  // Marked, because this is the one audio clock kept for the whole visit
  // (suspended between sounds); a check counting clocks a room forgot to
  // close has to be able to tell it apart (tests/e2e/the-music-room.js).
  (ctx as AudioContext & { beaconAlert?: boolean }).beaconAlert = true;
  return ctx;
}

// Suspended between sounds, so an idle tab holds no audio device open.
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

// Browsers allow sound only after a tap, and Safari wants the audio started
// inside it, so the first tap of the visit opens the audio and lets it rest.
export function armBeaconSound(): () => void {
  if (typeof window === 'undefined') return () => {};
  for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
  return disarm;
}

// True only when the person heard it; only then may the notification be silent.
export async function playBeaconSound(): Promise<boolean> {
  if (!soundOn()) return false;
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  if (Date.now() - lastPlayed < BURST_MS) return true;
  const c = ctx;
  if (!c || !unlocked) return false;
  if (!(await wake(c))) {
    // A phone call or another app took the audio: wait for the next tap.
    unlocked = false;
    armBeaconSound();
    return false;
  }
  lastPlayed = Date.now();
  restSoon(c, scheduleBeaconSound(c, c.destination, c.currentTime + 0.02));
  return true;
}

// The Hear it button: plays even with the switch off.
export async function previewBeaconSound(): Promise<boolean> {
  const c = audio();
  if (!c || !(await wake(c))) return false;
  unlocked = true;
  restSoon(c, scheduleBeaconSound(c, c.destination, c.currentTime + 0.02));
  return true;
}

// A notification that replaces one with the same tag makes no sound unless
// `renotify` is set, so each item gets its own tag. The service worker
// computes the same one from a push (app/sw.js/route.ts), cutting title and
// body as the `notify` function does, so the two still collapse into one.
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

// Not on an iPhone.
export const silentSupported = (): boolean => { const p = proto(); return !!p && 'silent' in p; };

// Chrome and Edge only.
export const renotifySupported = (): boolean => { const p = proto(); return !!p && 'renotify' in p; };

export interface AlertWanted {
  body?: string;
  url: string;
  tag: string;
  renotify?: boolean;
  heard: boolean;
}

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
    // Without renotify, a new tag is the only way to sound again.
    if (can.renotify) options.renotify = true;
    else options.tag = `${w.tag}:${Date.now().toString(36)}`;
  }
  if (w.heard && can.silent) options.silent = true;
  return options;
}
