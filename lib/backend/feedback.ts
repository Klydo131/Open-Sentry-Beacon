// Where feedback goes — and the one place this app talks to a server.
//
// THIS FILE IS THE POINT OF THE PROJECT, so it is worth reading even if you skip
// everything else.
//
// Open Sentry Beacon has no backend. Every screen runs from a store in the
// browser, so the app installs, works offline and demonstrates itself with no
// account, no database and no configuration. That is deliberate: a church should
// be able to try the whole thing before deciding anything.
//
// But a real deployment needs somewhere for a member's message to actually go.
// Rather than pick a provider for you — Supabase, Firebase, a mailbox, a
// spreadsheet, a self-hosted API — the app asks a SINK. The default one keeps
// everything on the device. Swap it for your own in one call and nothing else in
// the app changes.
//
//     // app/providers.tsx, or anywhere that runs once at startup
//     import { setFeedbackSink } from '@/lib/backend/feedback';
//
//     setFeedbackSink({
//       async send(message) {
//         const res = await fetch('https://your-church.example/feedback', {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify(message),
//         });
//         return { ok: res.ok };
//       },
//     });
//
// THREE RULES FOR ANY SINK YOU WRITE, each one learned the expensive way:
//
//   1. NEVER THROW. A message a person took the trouble to write must not be
//      lost because a network was down. Return { ok: false } and the app keeps
//      it on the device to try again.
//   2. NEVER PUT A SECRET IN HERE. This file ships to the browser. An API key in
//      a sink is an API key published to every visitor. Put the key on your own
//      server and let the browser talk to that.
//   3. RATE LIMIT ON YOUR SERVER, not here. Anything in the browser can be
//      skipped by anybody who opens the network tab.

/** What the app hands a sink. Nothing here identifies a device or a person. */
export interface FeedbackMessage {
  /** Client-generated id, so a retry cannot create a duplicate. */
  id: string;
  /** 'bug' | 'idea' | 'confusing' | 'praise' */
  category: string;
  /** What the person wrote. */
  message: string;
  /** Only if they chose to give one. Often empty. */
  contact: string;
  /** Which screen they were on, e.g. "/dm". Not a full URL. */
  page: string;
  /** The build they were running, which is usually enough to reproduce a bug. */
  build: string;
  /** ISO timestamp. */
  at: string;
}

export interface FeedbackResult {
  /** True when it is safely somewhere the church can read it. */
  ok: boolean;
  /** Optional note for the person: "saved on this device", and so on. */
  note?: string;
}

export interface FeedbackSink {
  send(message: FeedbackMessage): Promise<FeedbackResult>;
  /** How to describe where messages go. Shown in the app's own words. */
  readonly describe: string;
}

const STORE_KEY = 'hope-beacon.feedback.local';

/**
 * The default: keep it on this device.
 *
 * Not a stub that throws away the message, and not a pretend success. It really
 * stores it, an administrator can really read it back, and the app tells the
 * person honestly that it has not left the device. A demo that silently drops
 * feedback teaches everybody that feedback is pointless.
 */
export const localFeedbackSink: FeedbackSink = {
  describe: 'saved on this device only, no server is configured',
  async send(message) {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const all: FeedbackMessage[] = raw ? JSON.parse(raw) : [];
      // Same id twice is the same message, not two.
      if (!all.some((m) => m.id === message.id)) all.unshift(message);
      // Bounded: this is a demo store, not an archive.
      localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 200)));
      return { ok: true, note: 'Saved on this device.' };
    } catch {
      // Private browsing, a full quota, a locked-down webview.
      return { ok: false };
    }
  },
};

/** Everything written locally, newest first. For an in-app admin view. */
export function readLocalFeedback(): FeedbackMessage[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as FeedbackMessage[]) : [];
  } catch {
    return [];
  }
}

let sink: FeedbackSink = localFeedbackSink;

/** Point the app at your own destination. Call once, at startup. */
export function setFeedbackSink(next: FeedbackSink): void {
  sink = next;
}

export function getFeedbackSink(): FeedbackSink {
  return sink;
}
