'use client';

// Where this device says how to reach it.
//
// ---------------------------------------------------------------------------
// THE HALF OF PUSH THAT WAS NEVER WRITTEN. `subscribeToPush()` in lib/push.ts
// has always asked the browser for a subscription and always handed it back to
// a caller that dropped it on the floor. A subscription nobody keeps is a
// phone number written down and thrown away: the device is willing to be
// reached and there is no record anywhere of how.
//
// So this keeps it, in the church's own database, behind owner-only policies.
// Everything a push needs is here and nothing else is: an endpoint, two
// encryption keys, and a label so somebody can recognise a device they no
// longer own. No location, no identifiers, nothing that says anything about the
// person beyond "one of their devices is willing to be told".
//
// AND IT CAN BE UNDONE. Turning device alerts off does not hide a switch; it
// unsubscribes the browser AND removes the row, so the church has no way to
// reach a device that asked not to be reached. A setting that only stops the
// showing, while the sending carries on, is not the setting people think it is.
// ---------------------------------------------------------------------------

import { db } from '@/lib/live/data';

/** What the browser hands back, in the shape the table stores. */
function partsOf(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

/**
 * A short, human name for the device, so a list of them is readable.
 *
 * DELIBERATELY COARSE. "Android phone" is enough to recognise which of your own
 * devices a row is; the full user-agent string is a fingerprint, and a church
 * database has no business holding one to solve a problem this size.
 */
function describeThisDevice(): string {
  if (typeof navigator === 'undefined') return 'A device';
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows computer';
  return 'A device';
}

/**
 * Keep this device's subscription, so a notification can reach it later.
 *
 * Returns true when the church can now reach this device. Never throws: a
 * device that could not be remembered is a notification that arrives in the
 * app instead of on the lock screen, which is a smaller problem than an error
 * screen in front of somebody who was only turning a setting on.
 */
export async function rememberThisDevice(sub: PushSubscription): Promise<boolean> {
  const parts = partsOf(sub);
  if (!parts) return false;
  try {
    const client = db();
    const { data: session } = await client.auth.getUser();
    const ownerId = session?.user?.id;
    if (!ownerId) return false;

    // UPSERT, BECAUSE A DEVICE COMES BACK. The same browser re-subscribing
    // returns the same endpoint, and an insert would fail on the primary key
    // every time somebody reopened the app.
    const { error } = await client.from('push_subscriptions').upsert({
      owner_id: ownerId,
      endpoint: parts.endpoint,
      p256dh: parts.p256dh,
      auth: parts.auth,
      label: describeThisDevice(),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,endpoint' });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Stop this device being reachable: unsubscribe the browser and remove the row.
 *
 * BOTH HALVES, and the order matters. Removing the row while the browser is
 * still subscribed leaves a device willing to accept pushes that nothing will
 * send, which is harmless; leaving the row while the browser is unsubscribed
 * leaves the church sending to an endpoint that will never answer, which is
 * every future notification wasting a request. So: unsubscribe, then forget.
 */
export async function forgetThisDevice(): Promise<void> {
  let endpoint = '';
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    // No worker, or no subscription. The row below is still worth removing.
  }

  try {
    const client = db();
    const { data: session } = await client.auth.getUser();
    const ownerId = session?.user?.id;
    if (!ownerId) return;
    const query = client.from('push_subscriptions').delete().eq('owner_id', ownerId);
    // Without an endpoint there is nothing to aim at, so every device this
    // person has is retired rather than a random one.
    await (endpoint ? query.eq('endpoint', endpoint) : query);
  } catch {
    // Nothing to do. The browser is already unsubscribed, which is the half
    // that stops notifications arriving here.
  }
}
