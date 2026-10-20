'use client';

// The chat bubble on every screen. Tapping it opens the conversation: full
// screen on a phone or pad, a side panel on a computer. The badge counts
// unread messages.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_TALK } from '@/lib/live/keep-up';
import { TalkSurface } from '@/components/live/TalkSurface';
import { TalkBubble, TalkSheet, useTalkDock } from '@/components/talk/Dock';
import { showLocalNotification } from '@/lib/push';
import { APP_SHORT_NAME } from '@/lib/brand';

export function TalkDock() {
  const { profile } = useLiveSession();
  const router = useRouter();
  const path = usePathname();
  const [threads, setThreads] = useState<live.Thread[]>([]);
  const { open, leaving, target, show, close } = useTalkDock();
  // Unread counts from the last look, so only new messages raise an alert.
  const [seen, setSeen] = useState<Record<string, number> | null>(null);

  const total = threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0);

  const refresh = useCallback(async () => {
    try {
      const rows = await live.listMyThreads();
      setThreads(rows);

      const now: Record<string, number> = {};
      for (const t of rows) now[t.pairing_id] = Number(t.unread) || 0;

      setSeen((before) => {
        if (before === null) return now;
        for (const t of rows) {
          const was = before[t.pairing_id] ?? 0;
          const is = now[t.pairing_id] ?? 0;
          // Alert only when the count rises, and never for the thread on screen.
          if (is > was && !(path === '/talk' && typeof window !== 'undefined'
                            && window.location.search.includes(t.pairing_id))) {
            void showLocalNotification(
              APP_SHORT_NAME,
              // An alert can show on a locked phone: who sent it, never the words.
              `${t.other_name} sent you a message`,
              `/talk?with=${encodeURIComponent(t.pairing_id)}`,
              { tag: `beacon-talk:${t.pairing_id}`, renotify: true },
            );
          }
        }
        return now;
      });
    } catch {
      /* Silent: this runs on every screen, and a background error must not cover it. */
    }
  }, [path]);

  useEffect(() => { void refresh(); }, [refresh]);
  useKeepUp(KEEP_UP_MY_PAIRING, refresh);
  // Debounced: a burst of messages causes one reload, not one per row.
  useKeepUp(KEEP_UP_TALK, refresh);

  if (!profile || (profile.role !== 'ds' && profile.role !== 'dm')) return null;
  if (path === '/talk') return null;

  if (open) {
    return (
      <TalkSheet leaving={leaving}>
        <TalkSurface
          compact
          openWith={target}
          onExit={close}
          onFull={() => router.push('/talk')}
        />
      </TalkSheet>
    );
  }

  return <TalkBubble total={total} onOpen={() => show()} />;
}
