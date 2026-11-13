// Sends a notification to a member's devices. Called by the database when a
// notification is created.
//
// On an iPhone, web push reaches only an app added to the Home Screen
// (iOS 16.4 or later); Safari in a tab cannot receive one.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Payload = {
  owner_id?: string;
  title?: string;
  body?: string;
  url?: string;
};

type Device = { endpoint: string; p256dh: string; auth: string };

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
// A mailto: or https: the push service can complain to. Required by the spec;
// used by nobody until something goes wrong, which is when you want it.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@example.org';

/** No wildcard: the only caller is the database, and it sends no Origin. */
const headers = { 'Content-Type': 'application/json' };

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

// Constant time: a wrong key takes as long to refuse as a nearly right one.
async function sameKey(a: string, b: string): Promise<boolean> {
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [x, y] = (await Promise.all([hash(a), hash(b)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_KEY || !(await sameKey(bearer, SERVICE_KEY))) {
    return reply(401, { error: 'This function is called by the database.' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // A MISSING KEY IS A SETUP STEP, NOT A FAILURE, and saying which one saves
    // somebody an afternoon reading logs for a bug that is not there.
    return reply(503, {
      error: 'No VAPID keys are set, so nothing can be pushed yet.',
      fix: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on this function, and '
        + 'NEXT_PUBLIC_VAPID_PUBLIC_KEY on the site, to the same key pair.',
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: 'That was not JSON.' });
  }

  const ownerId = (payload.owner_id ?? '').trim();
  const title = (payload.title ?? '').trim();
  if (!ownerId || !title) return reply(400, { error: 'owner_id and title are required.' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('owner_id', ownerId);

  if (error) return reply(500, { error: error.message });

  const devices = (data ?? []) as Device[];
  // NOT AN ERROR. Most people will not have turned notifications on, and a
  // 500 here would make every ordinary notification look like a broken one.
  if (devices.length === 0) return reply(200, { sent: 0, devices: 0 });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // THE PAYLOAD IS SMALL ON PURPOSE. Push services cap it, and more to the
  // point this is a lock screen: the title and a line. Anything private stays
  // behind the app, which is where the person has to sign in to read it.
  const message = JSON.stringify({
    title,
    body: (payload.body ?? '').slice(0, 300),
    url: payload.url && payload.url.startsWith('/') ? payload.url : '/',
  });

  const dead: string[] = [];
  let sent = 0;

  await Promise.all(devices.map(async (device) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        message,
        { TTL: 60 * 60 * 24 },
      );
      sent += 1;
    } catch (cause) {
      // A DEVICE THAT IS GONE SHOULD STOP BEING TRIED. 404 and 410 are the push
      // service saying this endpoint no longer exists: the browser was cleared,
      // the app uninstalled, the subscription rotated. Keeping the row means
      // every future notification spends a request failing. Anything else --
      // a timeout, a 500 from the push service -- is temporary and the row
      // stays, because deleting on a bad afternoon costs somebody their
      // notifications permanently.
      const status = (cause as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(device.endpoint);
    }
  }));

  if (dead.length > 0) {
    await db.from('push_subscriptions')
      .delete()
      .eq('owner_id', ownerId)
      .in('endpoint', dead);
  }

  return reply(200, { sent, devices: devices.length, retired: dead.length });
});
