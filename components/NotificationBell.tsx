'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { useNotificationPrefs } from '@/lib/notification-prefs';
import { AnchoredPanel } from '@/components/AnchoredPanel';
import { usePresence } from '@/lib/motion';
import type { AppNotification, Role } from '@/lib/types';
import {
  permission as pushPermission,
  requestPermission,
  subscribeToPush,
  showLocalNotification,
  pushSupported,
} from '@/lib/push';

const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

const ICON: Record<string, string> = {
  message: '💬',
  material: '📚',
  journey: '🎯',
  approval: '🙋',
  prayer: '🙏',
  meeting: '📅',
  default: '🔔',
};

function routeFor(n: AppNotification, role: Role): string {
  if (n.type === 'approval') return '/admin';
  return HOME[role] ?? '/';
}

export function NotificationBell() {
  const { db, currentUser, markNotificationRead, markAllNotificationsRead } = useDemo();
  const { prefs, update: updatePrefs } = useNotificationPrefs();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Kept on the screen while it goes back into the button (lib/motion.ts).
  const panel = usePresence(open);
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const wrapRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);

  const me = currentUser!;
  const mine = db.notifications
    .filter((n) => n.user_id === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = mine.filter((n) => !n.read_at).length;

  useEffect(() => setPerm(pushPermission()), []);

  // Tapping elsewhere and pressing Escape both close this. They used to be
  // written here and nowhere else, so the live bell and the mode switch had
  // neither. Both now live in AnchoredPanel, once, for every panel.

  useEffect(() => {
    const ids = mine.map((n) => n.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    for (const n of mine) {
      if (!seen.current.has(n.id)) {
        seen.current.add(n.id);
        if (prefs.push && pushPermission() === 'granted') {
          showLocalNotification(n.title, n.body, routeFor(n, me.role));
        }
      }
    }
  }, [mine, me.role, prefs.push]);

  const openItem = (n: AppNotification) => {
    markNotificationRead(n.id);
    setOpen(false);
    router.push(routeFor(n, me.role));
  };

  const enableAlerts = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      updatePrefs({ push: true });
      await subscribeToPush();
      showLocalNotification(
        'Alerts are on',
        'Beacon will notify you here and on this device.',
        HOME[me.role],
      );
    }
  };

  const showBadge = prefs.inApp && unread > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        className="tap-sm relative grid place-items-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <span aria-hidden>{prefs.inApp ? '🔔' : '🔕'}</span>
        {showBadge && (
          <span
            className="absolute right-0 top-0.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-navy"
            style={{ backgroundColor: '#E8B84B' }}
          >
            {unread}
          </span>
        )}
      </button>

      {panel.mounted && (
        <AnchoredPanel
          leaving={panel.leaving}
          anchor={wrapRef}
          onClose={() => setOpen(false)}
          width={352}
          label="Notifications"
          className="text-navy"
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <span className="font-extrabold">Notifications</span>
            {unread > 0 && prefs.inApp && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="text-sm font-semibold text-navy/70 underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {!prefs.inApp ? (
            <div className="px-4 py-8 text-center">
              <p className="text-2xl">🔕</p>
              <p className="mt-2 font-semibold text-gray-500">
                Notifications are paused
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Turn them back on to see alerts here.
              </p>
              <button
                onClick={() => updatePrefs({ inApp: true })}
                className="tap mt-3 rounded-xl px-5 text-base font-semibold text-white"
                style={{ backgroundColor: '#1E2A4A' }}
              >
                Turn on
              </button>
            </div>
          ) : (
            <div>
              {mine.length === 0 ? (
                <p className="px-4 py-8 text-center text-gray-400">
                  No notifications yet.
                </p>
              ) : (
                mine.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                      n.read_at ? '' : 'bg-amber-50'
                    }`}
                  >
                    <span className="text-xl" aria-hidden>
                      {ICON[n.type] ?? ICON.default}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{n.title}</span>
                      {n.body && (
                        <span className="block truncate text-sm text-gray-500">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-xs text-gray-400">
                        {new Date(n.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                    {!n.read_at && (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          <div className="compact-ui space-y-2 border-t border-black/5 px-4 py-3">
            <Toggle
              label="In-app notifications"
              checked={prefs.inApp}
              onChange={(v) => updatePrefs({ inApp: v })}
            />

            {pushSupported() && (
              <>
                {perm === 'granted' ? (
                  <Toggle
                    label="Device alerts"
                    checked={prefs.push}
                    onChange={(v) => updatePrefs({ push: v })}
                  />
                ) : perm === 'denied' ? (
                  <p className="text-sm text-gray-400">
                    Device alerts are blocked in your browser settings.
                  </p>
                ) : (
                  <button
                    onClick={enableAlerts}
                    className="tap w-full rounded-xl px-4 text-base font-semibold text-white"
                    style={{ backgroundColor: '#1E2A4A' }}
                  >
                    Turn on device alerts
                  </button>
                )}
              </>
            )}
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
