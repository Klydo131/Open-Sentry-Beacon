'use client';

// Real-time synchronisation — the fourth box in the architecture diagram.
//
// WHAT THIS ACTUALLY DOES, STATED PLAINLY: it keeps every open window of this
// app on ONE DEVICE in step with each other, live. Open the missionary in one
// window and the seeker in another, send a message, and it appears in the other
// window immediately with no refresh. That is a genuinely useful thing — it is
// the clearest way to demonstrate a two-person conversation to a room — and it
// is honestly all a backendless app can do. Two different phones cannot sync
// through a server that does not exist.
//
// So this file is deliberately two things at once:
//
//   1. A WORKING FEATURE for the demo, via BroadcastChannel.
//   2. A SEAM. Call setRealtimeTransport() with an adapter for your provider
//      and every window on every device syncs instead, with nothing else in the
//      app changing. That is the same shape as lib/backend/feedback.ts, and for
//      the same reason: the app should not pick your provider for you.
//
// ---------------------------------------------------------------------------
// THE WARNING THAT MATTERS WHEN YOU REPLACE THIS
//
// docs/examples/schema.sql (2c) says it and it bears repeating here, next to
// the code somebody will actually change: a change feed is a SECOND WAY OUT of
// your database, and it does not inherit the rules you wrote for queries. On
// Postgres providers, row-level security for the replication stream is a
// separate switch from row-level security for queries. Turn on the wrong one
// and every listener receives every changed row, including the private note a
// missionary just wrote about somebody.
//
// The default transport below broadcasts the whole database, which would be
// indefensible over a network and is fine here for one specific reason: every
// window it reaches is the same browser on the same device, already sharing the
// same localStorage. It crosses no privilege boundary that was not already
// crossed. YOUR transport does cross one. Subscribe per pairing, not per table,
// and test it with two clients signed in as two different people — a feed leak
// is completely invisible from the sending side.
// ---------------------------------------------------------------------------

import type { DB } from './types';
import { uuid } from './uuid';

const CHANNEL = 'beacon-realtime';

/** What travels between windows. Whole-state today; see the note above. */
export interface RealtimeMessage {
  /** Distinguishes our own echo from somebody else's write. */
  origin: string;
  db: DB;
}

export interface RealtimeTransport {
  /** Tell everyone else what the database now looks like. Must never throw. */
  publish: (msg: RealtimeMessage) => void;
  /** Hear about somebody else's write. Returns its own unsubscribe. */
  subscribe: (fn: (msg: RealtimeMessage) => void) => () => void;
}

// A per-window id. Two windows of the same app must be able to tell each
// other's writes from their own; BroadcastChannel already declines to deliver a
// message back to its sender, but a network transport usually will not, so the
// field is carried from the start rather than added after the first echo loop.
export const ORIGIN = uuid();

// The default: same device, every open window. Silent no-op where
// BroadcastChannel is unavailable (older Safari, some embedded webviews), so
// the app degrades to exactly the behaviour it had before this file existed.
function broadcastChannelTransport(): RealtimeTransport {
  let channel: BroadcastChannel | null = null;
  const open = (): BroadcastChannel | null => {
    if (channel) return channel;
    if (typeof BroadcastChannel === 'undefined') return null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }
    return channel;
  };

  return {
    publish(msg) {
      try {
        open()?.postMessage(msg);
      } catch {
        // A write that cannot be broadcast is still a write. Never let the
        // feed take down the action that produced it.
      }
    },
    subscribe(fn) {
      const ch = open();
      if (!ch) return () => {};
      const handler = (e: MessageEvent) => {
        const msg = e.data as RealtimeMessage | undefined;
        if (!msg || typeof msg !== 'object' || !msg.db) return;
        if (msg.origin === ORIGIN) return;
        fn(msg);
      };
      ch.addEventListener('message', handler);
      return () => ch.removeEventListener('message', handler);
    },
  };
}

let transport: RealtimeTransport = broadcastChannelTransport();

/**
 * Swap in your provider. Call once at startup, before anything renders.
 *
 *     setRealtimeTransport({
 *       publish: (msg) => channel.send({ type: 'broadcast', event: 'db', payload: msg }),
 *       subscribe: (fn) => {
 *         const sub = channel.on('broadcast', { event: 'db' }, (p) => fn(p.payload));
 *         return () => sub.unsubscribe();
 *       },
 *     });
 *
 * A real implementation should send CHANGES scoped to a pairing rather than the
 * whole database. The interface does not stop you doing the simple thing; the
 * comment at the top of this file explains why you should not.
 */
export function setRealtimeTransport(next: RealtimeTransport): void {
  transport = next;
}

export function publishDb(db: DB): void {
  transport.publish({ origin: ORIGIN, db });
}

export function subscribeDb(fn: (db: DB) => void): () => void {
  return transport.subscribe((msg) => fn(msg.db));
}
