'use client';

// The chat that is always within reach, and says when somebody is waiting.
//
// ---------------------------------------------------------------------------
// ONE SHAPE NOW, AT EVERY SIZE: a bubble you tap, and a conversation over the
// page rather than instead of it.
//
//   PHONE / PAD  bubble in the corner, opening to the WHOLE SCREEN.
//   WIDE         the same bubble, opening to a panel beside the page.
//
// WHAT THIS REPLACED, AND WHY THE OLD REASONING WAS HALF RIGHT. This used to be
// `hidden xl:block`, so only a very wide screen got the floating chat. The
// comment here defended it: "a small floating panel on a small screen covers
// the thing it floats over, which is why the phone does not get one." That is
// true, and it is still true.
//
// What it missed is that the panel does not have to be small. A phone was sent
// to /talk instead -- a PAGE, which means navigating away from whatever you
// were reading and losing the place you had scrolled to, every time you want to
// see whether somebody replied. Reported exactly that way: "I dont like this as
// a separate sub room on the phone or pad, I want it as a bubble like what you
// did at desktop."
//
// So the bubble is tiny and covers almost nothing, and opening it takes the
// whole screen -- the way a conversation does in every messaging app people
// already use. The old objection and the request are both satisfied, and
// neither had to lose. /talk is still a real route, still reachable from the
// navigation and still where "Open full" goes on a desktop; nobody has to use
// it to read a message any more.
//
// THE COUNT IS THE POINT. A chat you have to open to find out whether anything
// happened is a chat people stop opening. The number comes from the database in
// one call and falls the moment a thread is read, so it can be trusted; a badge
// that lies once is a badge nobody believes again.
//
// NOT A COPY OF ANYBODY'S MESSENGER. A collapsed bar that expands, and a count
// on the way in, are older than any product that ships them today. There is no
// presence, no typing indicator, and no conversation that is not a pairing the
// church arranged.
//
// READ RECEIPTS: THIS RULE CHANGED, BY THE OWNER'S DECISION, AND SAYING SO IS
// THE POINT OF THIS PARAGRAPH. It used to read "no read receipts beyond the one
// this app already had". `read_at` was raised as a decision rather than built,
// with the concern stated plainly -- a receipt puts pressure on the person who
// has not replied, and an Explorer bringing something hard to their Guide is
// the person least able to carry it. The owner asked for it anyway, knowing
// that.
//
// What makes it defensible here is the church's own numbers: forty-two
// Explorers have not opened the app in a week, and a Guide writing into that
// silence could not tell "they read it and had nothing to say" from "they have
// not been back since August". Those call for different responses.
//
// The shape keeps the concern in view: ONE receipt, under the last thing YOU
// sent, never a column of `Seen` down everything you have ever written, and
// never on the other person's messages. See components/live/shared.tsx.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_TALK } from '@/lib/live/keep-up';
import { TalkSurface } from '@/components/live/TalkSurface';
import { showLocalNotification } from '@/lib/push';
import { APP_SHORT_NAME } from '@/lib/brand';

/** Remembered per device, so the dock opens the way you left it. */
const OPEN_KEY = 'beacon:talk-dock-open';

export function TalkDock() {
  const { profile } = useLiveSession();
  const router = useRouter();
  const path = usePathname();
  const [threads, setThreads] = useState<live.Thread[]>([]);
  const [open, setOpen] = useState(false);
  // What was already waiting when this device last looked, so arriving is told
  // apart from having-been-there-all-along. Without it, opening the app with
  // three unread pops three notifications for messages you already knew about.
  const [seen, setSeen] = useState<Record<string, number> | null>(null);

  const total = threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0);

  const refresh = useCallback(async () => {
    try {
      const rows = await live.listMyThreads();
      setThreads(rows);

      const now: Record<string, number> = {};
      for (const t of rows) now[t.pairing_id] = Number(t.unread) || 0;

      setSeen((before) => {
        // The first look establishes the baseline and announces nothing.
        if (before === null) return now;
        for (const t of rows) {
          const was = before[t.pairing_id] ?? 0;
          const is = now[t.pairing_id] ?? 0;
          // ONLY WHEN THE COUNT GOES UP, and never while that thread is on the
          // screen -- being told about a message you are looking at is the
          // fastest way to make somebody switch notifications off.
          if (is > was && !(path === '/talk' && typeof window !== 'undefined'
                            && window.location.search.includes(t.pairing_id))) {
            void showLocalNotification(
              APP_SHORT_NAME,
              `${t.other_name}: ${t.last_preview ?? 'sent you a message'}`,
              `/talk?with=${encodeURIComponent(t.pairing_id)}`,
            );
          }
        }
        return now;
      });
    } catch {
      /* A dock that cannot count is still a dock that opens. Silent on purpose:
         this runs on every screen, and an error banner from a background count
         would appear over whatever the person was actually doing. */
    }
  }, [path]);

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === '1'); } catch { /* private mode */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useKeepUp(KEEP_UP_MY_PAIRING, refresh);
  // EVERY CONVERSATION, AND DEBOUNCED. This was a raw channel calling `refresh`
  // on every single row event with nothing between them, which is an
  // amplifier: one cheap insert by anybody woke every open app and each of
  // them asked the database to recount what was waiting. A burst of forty
  // messages was forty recounts per viewer, and up to forty notifications.
  // useKeepUp settles a burst into one reload, which is what every other
  // screen in the app has always done.
  useKeepUp(KEEP_UP_TALK, refresh);

  const setOpenAndRemember = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
  };

  // Only the two people who have conversations, and never on the chat's own
  // page -- a dock floating over the room it opens is a second copy of it.
  if (!profile || (profile.role !== 'ds' && profile.role !== 'dm')) return null;
  if (path === '/talk') return null;

  // OPEN: the whole screen on a phone or a pad, the corner panel on a desktop.
  // CLOSED: a bubble, at every size, which is the change.
  //
  // The two states need different positioning, so the wrapper is not shared.
  // Squeezing both into one set of classes is how a fixed overlay ends up
  // inheriting `bottom-4 right-4` and sitting in the corner at full width.
  if (open) {
    // THE HOME INDICATOR STILL EXISTS ABOVE 1280px. An iPad Pro in landscape
    // is 1366 CSS pixels, so it takes the xl branch AND has a home indicator
    // -- without the margin below, the corner panel sits under it. Below xl
    // the sheet covers the whole screen on purpose and pads its own content
    // instead, which is what .talk-sheet does.
    return (
      <div className="fixed inset-0 z-50 xl:inset-auto xl:bottom-4 xl:right-4 xl:z-40 xl:[margin-bottom:env(safe-area-inset-bottom,0px)]">
        <div className="talk-sheet talk-panel-in flex h-full w-full flex-col overflow-hidden bg-white ring-1 ring-black/10 xl:h-[32rem] xl:w-[22rem] xl:rounded-2xl xl:lift-3">
          <div className="flex items-center gap-2 border-b border-black/5 bg-navy px-3 py-2 text-white">
            <span className="flex-1 text-sm font-bold">Talk</span>
            {/* NOT ON A PHONE, because there it would do nothing: the sheet is
                already the whole screen, so "Open full" would swap a covering
                overlay for a page that looks the same and throws away the
                screen underneath it. It stays where it still means something. */}
            <button
              type="button"
              onClick={() => router.push('/talk')}
              className="tap-sm hidden px-2 text-xs font-semibold underline xl:inline-block"
            >
              Open full
            </button>
            <button
              type="button"
              onClick={() => setOpenAndRemember(false)}
              className="tap-sm px-2 text-xs font-semibold underline"
              aria-label="Close the chat panel"
            >
              Exit
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <TalkSurface compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="safe-bottom fixed bottom-4 right-4 z-40">
      <button
        type="button"
        onClick={() => setOpenAndRemember(true)}
        /* THE WORD GOES, THE BUBBLE STAYS, on a narrow screen. A pill reading
           "Talk" sits over the bottom-right corner of whatever somebody is
           reading; the round bubble is the smallest thing that can still be hit
           reliably with a thumb. The count stays at every size -- it is the
           whole reason the bubble is worth the space it takes. */
        className="talk-bubble tap flex items-center gap-2 rounded-full bg-navy px-4 text-white lift-3 sm:px-5"
        /* WITHOUT THIS THE PHONE BUTTON IS UNREADABLE. The visible word is what
           names this control, and it is hidden below `sm` -- which would leave
           somebody on a screen reader an emoji and a bare number. */
        aria-label={total > 0 ? `Talk, ${total} waiting` : 'Talk'}
      >
        <span aria-hidden>💬</span>
        <span className="hidden font-bold sm:inline">Talk</span>
        {total > 0 && (
          <span aria-hidden className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
    </div>
  );
}
