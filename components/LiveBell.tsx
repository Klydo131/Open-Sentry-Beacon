'use client';

// The notification bell, live.
//
// A notification belongs to exactly one person and the policy says so. There is
// no insert policy at all: notifications are written by notify_user(), which is
// SECURITY DEFINER and checks that both people are in the same church. A client
// able to write this table directly could make the app say anything to anybody.

import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import type { Profile, Role } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { permission, requestPermission, showLocalNotification } from '@/lib/push';
import { onOpenBell } from '@/lib/open-bell';
import { planAnnouncement } from '@/lib/live/announce-plan';
import { AnchoredPanel } from '@/components/AnchoredPanel';
import { useKeepUp, KEEP_UP_BELL } from '@/lib/live/keep-up';


/**
 * Where a notification actually leads.
 *
 * THE BUG THIS EXISTS FOR, in the reporter's words: "when I click or tap the
 * desk type on any activities, it doesn't go to the activities I clicked, so it
 * felt like I got scammed or I still need to look for the feature."
 *
 * Pressing a row in this panel used to mark it read and nothing else. It did
 * not navigate. So the app told somebody a safeguarding report needed them,
 * they pressed it, the bold went away, and they were left on whatever screen
 * they had been on with no idea where to go. The tutorial's bell has routed by
 * type since it was written; this one never did.
 *
 * A room is named in the query and a card in the hash, because landing at the
 * top of a long screen is the same failure one step later.
 */
function routeFor(type: string, role: Role): string {
  const leads = role === 'admin' || role === 'executive';
  switch (type) {
    case 'trial':
      // Leadership judges these; anybody else was CALLED to one.
      return leads ? '/admin?room=safeguarding' : '/cases';
    case 'report':
      // EVERYBODY GOES TO THE SAME PLACE, and it is not /admin. A report is now
      // a conversation between the person who raised it and the one who picked
      // it up, and both halves live in Settings under Admin Reports. Sending
      // leadership to the old safeguarding room would land them on a summary of
      // a case whose thread is somewhere else.
      return '/settings#reports';
    case 'watch':
      // THE ACTIVITY RECORD, which only leadership has. Nobody else is ever
      // sent one of these, and if somehow they are, home is not a refusal.
      return leads ? '/admin?room=security' : '/church';
    case 'approval':
      return leads ? '/admin?room=approvals' : '/church';
    case 'pairing':
      return leads ? '/admin?room=pairings' : role === 'dm' ? '/dm' : '/ds';
    case 'prayer':
      // Both sides open straight onto the Prayer room: prayer runs both ways,
      // so an Explorer is now told when their Guide asks them to pray.
      return role === 'dm' ? '/dm#prayer' : '/ds#prayer';
    case 'message':
      return role === 'dm' ? '/dm' : '/ds';
    case 'meeting':
      return role === 'dm' ? '/dm' : '/ds';
    default:
      // An unknown type is a new one somebody added without touching this. Home
      // is where the church's own screen is, and it is never wrong.
      return '/church';
  }
}

export function LiveBell({ me }: { me: Profile }) {
  const [rows, setRows] = useState<live.AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  // THE SWITCH LIVES WHERE THE BELL IS.
  //
  // It was in Settings, three taps away, and the panel itself had no control
  // of any kind. Somebody tapping a bell and finding one line of grey text has
  // been shown a broken feature, whatever is true elsewhere in the app.
  //
  // DEFAULT ON. `!== 'off'` rather than `=== 'on'`, so a member who has never
  // touched this gets alerts. Everyone reported not getting them, and a
  // default of off is indistinguishable from a bug.
  const [alerts, setAlerts] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const router = useRouter();
  // The panel is positioned from this, not from a breakpoint. See AnchoredPanel.
  const anchor = useRef<HTMLDivElement>(null);

  /**
   * Which notifications have already been announced on this device.
   *
   * A ref, not state: it is read inside the poll and must not restart it.
   * PERSISTED, and that is what makes announcing on arrival safe: the same
   * unread items are announced once per device however many times the app is
   * opened, so signing in five times with the same three things waiting gives
   * one pop-up rather than five.
   *
   * This used to seed on the first load and announce NOTHING, to stop a quiet
   * week firing eleven pop-ups at once. The eleven were the problem, not the
   * telling — see the note in `load`.
   */
  const announced = useRef<Set<string>>(new Set());
  /** False until the first poll finishes: "have they just arrived?" */
  const seeded = useRef(false);

  useEffect(() => {
    try { setAlerts(localStorage.getItem('hb-alerts') !== 'off'); } catch { /* private mode */ }
    try {
      const saved = JSON.parse(localStorage.getItem('hb-announced') ?? '[]');
      if (Array.isArray(saved)) announced.current = new Set(saved as string[]);
    } catch { /* private mode, or nothing saved */ }
    setPerm(permission());
  }, []);

  const flip = (on: boolean) => {
    setAlerts(on);
    try { localStorage.setItem('hb-alerts', on ? 'on' : 'off'); } catch { /* private mode */ }
  };

  const askDevice = async () => {
    const result = await requestPermission();
    setPerm(result);
    // PROVE IT WORKS, IMMEDIATELY. Somebody who taps "turn on alerts", sees a
    // browser prompt, taps Allow and then sees nothing has no way to tell
    // whether it worked. One notification, on the spot, is the difference
    // between a setting and a promise.
    if (result === 'granted') {
      await showLocalNotification(
        APP_SHORT_NAME,
        'Alerts are on for this device. This is what one looks like.',
        '/church',
      );
    }
  };

  const load = useCallback(async () => {
    try {
      const next = await live.listNotifications();
      setRows(next);

      // THE POP-UP ON THE DEVICE, which is the half that was missing. The bell
      // polled, the badge counted, and nothing ever reached the notification
      // tray, so somebody with the app in a background tab learned about a
      // safeguarding report the next time they happened to look.
      const fresh = next.filter((n) => !n.read_at && !announced.current.has(n.id));
      for (const n of fresh) announced.current.add(n.id);

      const alerts = (() => {
        try { return localStorage.getItem('hb-alerts') !== 'off'; } catch { return true; }
      })();
      const arriving = !seeded.current;
      seeded.current = true;

      // WHAT to pop up is decided in lib/live/announce-plan.ts, so the counting
      // can be run in a test rather than read. The failure here is somebody
      // buried under eleven pop-ups, or told nothing at all when a safeguarding
      // report was waiting, and neither shows up until it happens to a person.
      const plan = planAnnouncement(fresh, {
        arriving,
        alerts,
        allowed: permission() === 'granted',
      });
      const summary = async (count: number) => showLocalNotification(
        APP_SHORT_NAME, `${count} things are waiting for you.`, '/church',
      );
      const single = async (n: live.AppNotification) => showLocalNotification(
        n.title, n.body ?? undefined, routeFor(n.type, me.role),
      );

      if (plan.kind === 'one') await single(plan.item as live.AppNotification);
      else if (plan.kind === 'summary') await summary(plan.count);
      else if (plan.kind === 'each') {
        for (const n of plan.items) await single(n as live.AppNotification);
        if (plan.heldBack > 0) await summary(plan.items.length + plan.heldBack);
      }

      // NOTE ON NOT NAGGING, because this is the half that makes the above
      // safe. `announced` is persisted, so the same unread items are announced
      // ONCE per device however many times the app is opened. Signing in five
      // times with the same three things waiting gives one pop-up, not five;
      // something new since last time gives another.

      try {
        // Bounded, or this grows for the life of the device.
        localStorage.setItem(
          'hb-announced',
          JSON.stringify([...announced.current].slice(-200)),
        );
      } catch { /* private mode */ }
    } catch { /* a bell that cannot load is not worth an error over the page */ }
  }, [me.role]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);

    // COMING BACK ONLINE IS A MOMENT WORTH CHECKING. Anything that happened
    // while the device had no signal is waiting on the server, and without this
    // the person hears about it whenever the next sixty-second tick lands —
    // which on a phone that has been asleep may be a good deal later.
    const backOnline = () => void load();
    window.addEventListener('online', backOnline);

    // And coming back to the tab, so the badge is never stale in front of
    // somebody who is looking straight at it.
    const recheck = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', recheck);

    return () => {
      clearInterval(t);
      window.removeEventListener('online', backOnline);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [load]);

  // AND THE MOMENT ONE ARRIVES, not at the next tick of the minute timer above.
  // The poll stays: it is what covers a dropped socket and a phone that has
  // been asleep, and it is the reason the count is never more than a minute
  // stale even when realtime is unavailable. This just removes the wait when
  // everything is working, which is the case somebody is watching in a room.
  useKeepUp(KEEP_UP_BELL, load);

  // THE DESK'S "Unread notifications" ROW ENDS HERE. It is drawn in the rail,
  // several branches away, and the bell it means is in the header; an event is
  // the only thing they share. Opening also loads, because the count that made
  // somebody press it may be a minute old.
  useEffect(() => onOpenBell(() => {
    setOpen(true);
    void load();
  }), [load]);


  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="relative shrink-0" ref={anchor}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className="tap-sm relative grid place-items-center rounded-full bg-white/10 px-2.5 hover:bg-white/20"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-navy">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <AnchoredPanel
          anchor={anchor}
          onClose={() => setOpen(false)}
          label="Notifications"
          className="p-3"
        >
          <div className="flex items-center justify-between">
            <p className="font-bold text-navy">Notifications</p>
            {unread > 0 && (
              <button
                onClick={async () => { await live.markAllNotificationsRead(); await load(); }}
                className="text-xs font-semibold text-navy underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {/* THE ON AND OFF, RIGHT HERE, AS A SWITCH.
              A bare checkbox reads as a form field somebody has to submit. A
              switch reads as a thing that is already on or already off, which
              is what this is: it takes effect the moment it moves. */}
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 border-t border-black/5 pt-3">
            <span className="text-sm font-semibold text-navy">In-app notifications</span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                checked={alerts}
                onChange={(e) => flip(e.target.checked)}
                aria-label="In-app notifications"
                className="peer sr-only"
              />
              {/* The track. Green when on, because that is the one colour
                  everybody already reads as "this is running". */}
              <span
                aria-hidden
                className="block h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-navy peer-focus-visible:ring-offset-2"
              />
              {/* The knob. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
              />
            </span>
          </label>

          {/* Device alerts are the browser's to grant, not ours. Asking is the
              only thing a page may do, and once refused it may not ask again,
              so that state says where to go instead of offering a dead button. */}
          {typeof Notification !== 'undefined' && (
            perm === 'granted' ? (
              // SAYING IT IS ON MATTERS AS MUCH AS THE SWITCH. The panel used
              // to show nothing at all once permission was granted, so the only
              // way to know device alerts were working was to wait for one.
              <p className="mt-2 rounded-xl bg-green-50 p-2.5 text-xs font-semibold text-green-800">
                Device alerts are on. New things pop up on this device even when
                Beacon is in another tab.
              </p>
            ) : perm === 'denied' ? (
              <p className="mt-2 rounded-xl bg-gray-50 p-2.5 text-xs text-gray-600">
                Alerts on this device are blocked by your browser. Open the padlock
                beside the address to allow them.
              </p>
            ) : (
              <>
                <button
                  onClick={askDevice}
                  className="tap mt-2 w-full rounded-xl px-4 text-sm font-bold text-white"
                  style={{ backgroundColor: '#1E2A4A' }}
                >
                  Turn on device alerts
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Pops up on your phone or computer, not only in this list. Your
                  browser asks first, and you can turn it off again here.
                </p>
              </>
            )
          )}

          {/* No max-height of its own any more. AnchoredPanel caps the whole
              panel to what is left of the screen and scrolls it, and two nested
              scrolling areas on a touch screen fight each other. */}
          <div className="mt-2 space-y-1">
            {!alerts && (
              <p className="p-2 text-sm text-gray-500">
                Alerts are switched off. Anything that happens is still here when
                you turn them back on.
              </p>
            )}
            {alerts && rows.length === 0 && (
              <p className="p-2 text-sm text-gray-500">
                Nothing yet. A new message, a prayer request or somebody waiting to
                be approved will appear here.
              </p>
            )}
            {alerts && rows.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  // MARK IT READ, SHUT THE PANEL, AND GO. All three, in that
                  // order. It used to do only the first, so the one thing a
                  // person pressed a notification to reach was the one thing
                  // pressing it did not do.
                  setOpen(false);
                  if (!n.read_at) { await live.markNotificationRead(n.id); void load(); }
                  router.push(routeFor(n.type, me.role));
                }}
                className={`block w-full rounded-xl p-2 text-left hover:bg-gray-50 ${n.read_at ? '' : 'bg-navy/5'}`}
              >
                <p className="text-sm font-semibold text-navy">{n.title}</p>
                {n.body && <p className="text-xs text-gray-600">{n.body}</p>}
                <p className="mt-0.5 text-[11px] font-semibold text-gray-400">Tap to open</p>
              </button>
            ))}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-2 block text-center text-xs font-semibold text-gray-400 underline"
          >
            More notification settings
          </Link>
        </AnchoredPanel>
      )}
    </div>
  );
}
