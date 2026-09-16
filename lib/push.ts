// Notifications, both kinds, and the difference matters.
//
// ---------------------------------------------------------------------------
// ON-DEVICE. The app raises a real system notification itself, from the page,
// about something the browser already knows. It has always worked and it can
// only ever reach somebody who has the app open in front of them.
//
// BACKGROUND PUSH. The church's database sends to the device whether or not
// the app is running: a locked phone in a pocket lights up. This is the half
// that was missing, and "notifications do not work on all devices" was a fair
// description of an app that had only the first kind.
//
// It is wired now: subscribeToPush() asks the browser, lib/live/push-devices.ts
// keeps the answer in `push_subscriptions`, a trigger on `notifications` calls
// the `notify` edge function, and the service worker's push handler -- which
// has been sitting ready this whole time -- raises the notification.
//
// THE ONE PLATFORM THAT SAYS NO, and it is not something code can fix: on an
// iPhone or iPad, web push only exists for an app that has been added to the
// Home Screen, on iOS 16.4 or later. Safari in a tab cannot receive a push,
// whatever is set up behind it. iosNeedsInstall() below is how the app tells
// somebody that rather than showing them a switch that will never do anything.
// ---------------------------------------------------------------------------

/**
 * True on an iPhone or iPad where the app is open in a browser tab rather than
 * installed, which is the one configuration where notifications cannot work and
 * no amount of granting permission will change that.
 *
 * DETECTED BY SHAPE, NOT BY NAME. iPadOS reports itself as a Mac, so a plain
 * user-agent test misses every iPad; a Mac with a touchscreen does not exist,
 * so "claims to be a Mac and has touch points" is an iPad. Neither test is
 * pretty and both are what the platform leaves available.
 */
export function iosNeedsInstall(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  if (!isApple) return false;
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
  return !installed;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

export function permission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// Raise a real OS notification via the service worker (so it also shows when the
// app is in the background). Falls back to the page Notification if no SW.
export async function showLocalNotification(
  title: string,
  body?: string,
  url = '/',
): Promise<void> {
  if (permission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon.svg',
        badge: '/icons/icon-maskable.svg',
        data: { url },
        tag: 'beacon',
      });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body });
  } catch {}
}

// Register a background-push subscription. No-op unless a VAPID public key is
// configured. Returns the subscription so the caller can persist it server-side.
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid || !pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
