'use client';

import { useCallback, useEffect, useState } from 'react';

export interface NotificationPrefs {
  inApp: boolean;
  push: boolean;
}

const KEY = 'beacon-notif-prefs';
const DEFAULTS: NotificationPrefs = { inApp: true, push: true };

function load(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      inApp: typeof parsed.inApp === 'boolean' ? parsed.inApp : true,
      push: typeof parsed.push === 'boolean' ? parsed.push : true,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}

export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);

  useEffect(() => setPrefs(load()), []);

  const update = useCallback((patch: Partial<NotificationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return { prefs, update };
}
