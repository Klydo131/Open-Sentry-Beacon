'use client';

// The chat bubble's frame: the bubble, the sheet it opens to, the one header
// inside it, and the list of conversations. Drawn by BOTH halves of the app.
//
// ---------------------------------------------------------------------------
// ONE FRAME FOR TWO HALVES. The live bubble (components/live/TalkDock.tsx) and
// the sample one (components/DemoTalkDock.tsx) fill it with their own data --
// the live database, or the sample store -- and nothing else. The tutorial and
// the sample app are what a church is shown before it signs up; a bubble that
// looked or moved differently there would be teaching the wrong app.
//
// WHY THE CHAT LIVES HERE NOW. Asked for on 30 September 2026, with a
// screenshot of a Guide's Talk tab: "take out the chat in 'talk' room and
// rename talk to just appointments. Let's just improve talk to our bubble chat
// with smooth animations too and smooth UI design in our chat system (including
// the report system in the bubble chat). It's annoying for the users to scroll
// down for appointments usually." The pages keep the appointments; the bubble
// keeps the talking, and the way to report travels with it into the header.
//
// ONE HEADER, NOT TWO. The live bubble had a navy strip saying "Talk" with Exit
// on it, and under that the surface's own strip with the name and "All" --
// two bars, two ways out, on a panel that is small on a desktop. It is one bar
// now: back to the list when there is one, who you are talking to, Report,
// and close.
//
// MOTION, AND LESS OF IT FOR WHOEVER ASKS. The sheet rises from the corner the
// bubble is in and settles; the list and a conversation slide past each other
// in the direction you went; the count on the bubble pops when it goes UP (a
// number falling because you read something is not news). All of it is
// `transform` and `opacity` only, and globals.css turns every one of them off
// under prefers-reduced-motion. The close waits for its animation only when
// there is one -- see `close` below.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { ChatGlyph, ChevronLeftGlyph, CloseGlyph, FlagGlyph } from '@/components/Glyph';
import { TALK_CLOSE_EVENT, TALK_OPEN_EVENT, type TalkOpenDetail } from '@/lib/talk-open';
import { MOTION } from '@/lib/motion';

/** Remembered per device, so the bubble opens the way it was left. */
const OPEN_KEY = 'beacon:talk-dock-open';

/** How long the sheet takes to leave: `.talk-panel-out` runs for
 *  --motion-quick, and this waits a hair longer so the last frame is seen. */
const LEAVE_MS = MOTION.quick + 10;

function prefersStill(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // An old browser that cannot answer gets the animation; it is harmless.
    return false;
  }
}

/**
 * Open, closing, and which conversation to open at.
 *
 * `target` is set by a Message button anywhere in the app (lib/talk-open.ts)
 * and read by the surface inside the sheet. It is cleared on close, so the
 * next tap on the bubble opens where the person left it rather than where a
 * button once pointed.
 */
export function useTalkDock() {
  const [open, setOpen] = useState(false);
  // ON ITS WAY OUT. Closing used to be an unmount, so the panel vanished
  // between one frame and the next with nothing saying where it had gone. It
  // stays on screen for the length of the exit and leaves afterwards.
  const [leaving, setLeaving] = useState(false);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);

  const remember = (next: boolean) => {
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
  };

  // REMEMBERED ON A DESKTOP ONLY. There the panel sits beside the page, and
  // finding it where you left it on the next page is the point. Below 1280px
  // the sheet covers the whole screen -- including the page somebody has just
  // gone to -- so coming back open by itself would hide what they asked for.
  useEffect(() => {
    try {
      const wide = window.matchMedia('(min-width: 1280px)').matches;
      setOpen(wide && localStorage.getItem(OPEN_KEY) === '1');
    } catch { /* private mode, or an old browser */ }
    return () => window.clearTimeout(timer.current);
  }, []);

  const show = useCallback((pairingId?: string) => {
    window.clearTimeout(timer.current);
    setLeaving(false);
    setTarget(pairingId || undefined);
    setOpen(true);
    remember(true);
  }, []);

  // A Message button on a page, or anything else that names a conversation.
  useEffect(() => {
    const onOpen = (event: Event) => {
      show((event as CustomEvent<TalkOpenDetail>).detail?.pairingId);
    };
    window.addEventListener(TALK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TALK_OPEN_EVENT, onOpen);
  }, [show]);

  /**
   * Put the sheet down rather than deleting it.
   *
   * REDUCED MOTION CLOSES AT ONCE, and that half would have been a real bug
   * rather than a missing nicety: with `animation: none` no animationend event
   * ever fires, so a close that waited for one would leave the sheet open for
   * ever for exactly the people who asked for less movement. The timer is the
   * authority, and it is zero for them.
   */
  const close = useCallback(() => {
    const finish = () => {
      setLeaving(false);
      setOpen(false);
      setTarget(undefined);
      remember(false);
    };
    if (prefersStill()) { finish(); return; }
    setLeaving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(finish, LEAVE_MS);
  }, []);

  // Anything that needs the page back (the tutorial, pointing past the chat).
  useEffect(() => {
    const onClose = () => { if (open) close(); };
    window.addEventListener(TALK_CLOSE_EVENT, onClose);
    return () => window.removeEventListener(TALK_CLOSE_EVENT, onClose);
  }, [open, close]);

  // Escape closes it, as it closes every other layer in the app -- unless
  // something inside it has already answered that Escape (the emoji list, a
  // reply being written, a message's menu, a picture full screen). One press
  // puts away one thing.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return { open, leaving, target, show, close };
}

/**
 * The bubble, closed. Round and small on a phone, where it floats over what
 * somebody is reading; the word comes back where there is room for it.
 */
export function TalkBubble({ total, onOpen }: { total: number; onOpen: () => void }) {
  // THE COUNT POPS WHEN IT GOES UP, and only then. A number that jumps every
  // time it falls is a number that is always jumping.
  const before = useRef(total);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (total > before.current) setPop((n) => n + 1);
    before.current = total;
  }, [total]);

  return (
    <div className="safe-bottom fixed bottom-4 right-4 z-40">
      <button
        type="button"
        onClick={onOpen}
        data-talk-bubble
        className="talk-bubble tap flex items-center gap-2 rounded-full bg-navy px-4 text-white lift-3 sm:px-5"
        /* WITHOUT THIS THE PHONE BUTTON IS UNREADABLE. The visible word names
           this control, and it is hidden below `sm` -- which would leave
           somebody on a screen reader a drawing and a bare number. */
        aria-label={total > 0 ? `Talk, ${total} waiting` : 'Talk'}
      >
        <ChatGlyph size={22} />
        <span className="hidden font-bold sm:inline">Talk</span>
        {total > 0 && (
          <span
            key={pop}
            aria-hidden
            className={`rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy ${pop ? 'talk-count-pop' : ''}`}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The bubble, open: the whole screen on a phone or a pad, a panel standing on
 * the bottom bar beside the page on a desktop.
 *
 * THE HOME INDICATOR STILL EXISTS ABOVE 1280px. An iPad Pro in landscape is
 * 1366 CSS pixels, so it takes the xl branch AND has a home indicator; the
 * panel stands on the taller of that and the bottom bar, as `.safe-bottom`
 * does for the closed bubble. Below xl the sheet covers the screen on purpose
 * and pads its own content instead, which is what `.talk-sheet` does.
 */
export function TalkSheet({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 xl:inset-auto xl:bottom-4 xl:right-4 xl:z-40 xl:[margin-bottom:max(env(safe-area-inset-bottom,0px),var(--tab-bar,0px))]"
      role="dialog"
      aria-label="Talk"
      data-talk-sheet
    >
      <div className={`talk-sheet ${leaving ? 'talk-panel-out' : 'talk-panel-in'} flex h-full w-full flex-col overflow-hidden bg-white ring-1 ring-black/10 xl:h-[32rem] xl:w-[22rem] xl:rounded-2xl xl:lift-3`}>
        {children}
      </div>
    </div>
  );
}

/**
 * The one bar across the top of a conversation.
 *
 * REPORT IS IN IT, IN WORDS, AT THE TOP. The rule in AGENTS.md: a person who
 * has been hurt must be able to report it "findable without hunting and never
 * next to Send". The header is the part of the chat furthest from Send, and
 * the word is always there while a conversation is open -- not behind a menu,
 * which was offered as the tidier choice and turned down on 30 September 2026
 * for exactly that reason.
 */
export function TalkHeader({
  title,
  avatarName,
  onBack,
  onReport,
  reporting = false,
  onFull,
  onClose,
}: {
  title: string;
  /** The person's name, for their initial. Absent on the list. */
  avatarName?: string;
  /** Back to the list, when there is more than one conversation. */
  onBack?: () => void;
  /** Present while a conversation is open. */
  onReport?: () => void;
  reporting?: boolean;
  /** "Open full", on a desktop only, where a page is bigger than the panel. */
  onFull?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="talk-head flex items-center gap-1.5 border-b border-black/5 bg-white px-2 py-2 sm:px-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="tap-sm grid place-items-center rounded-full text-navy hover:bg-black/[0.04]"
          aria-label="Back to your conversations"
        >
          <ChevronLeftGlyph size={22} />
        </button>
      )}
      {avatarName && <Avatar name={avatarName} size={34} />}
      <p className="min-w-0 flex-1 truncate px-1 text-base font-extrabold text-navy" data-talk-title>
        {title}
      </p>
      {onReport && (
        <button
          type="button"
          onClick={onReport}
          data-talk-report
          aria-pressed={reporting}
          className={`tap-sm flex shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold ${
            reporting ? 'bg-red-50 text-red-800' : 'text-gray-600 hover:bg-red-50 hover:text-red-800'}`}
        >
          <FlagGlyph size={16} />
          {reporting ? 'Back to chat' : 'Report'}
        </button>
      )}
      {onFull && (
        /* NOT ON A PHONE, because there it would do nothing: the sheet is
           already the whole screen, so "Open full" would swap a covering
           overlay for a page that looks the same and throws away the screen
           underneath it. It stays where it still means something. */
        <button
          type="button"
          onClick={onFull}
          className="tap-sm hidden shrink-0 px-2 text-sm font-semibold text-gray-600 underline underline-offset-2 xl:inline-block"
        >
          Open full
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="tap-sm grid shrink-0 place-items-center rounded-full text-gray-600 hover:bg-black/[0.04]"
          aria-label="Close the chat"
        >
          <CloseGlyph size={20} />
        </button>
      )}
    </div>
  );
}

/** One conversation in the list, the same fields on both halves. */
export interface TalkThread {
  pairing_id: string;
  other_name: string;
  unread: number;
  last_at: string | null;
  last_preview: string | null;
  last_is_mine: boolean | null;
}

function shortWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * The list of conversations. Only drawn when there is more than one, because a
 * list of one is a screen somebody has to get past to reach the only thing on
 * it.
 */
export function ThreadList({
  threads, onOpen, compact,
}: {
  threads: TalkThread[];
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-black/5" data-talk-list>
      {threads.map((t) => (
        <li key={t.pairing_id}>
          <button
            type="button"
            onClick={() => onOpen(t.pairing_id)}
            data-talk-thread
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.05]"
          >
            <Avatar name={t.other_name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-bold text-navy">{t.other_name}</span>
                <span className="ml-auto shrink-0 text-xs text-gray-400">{shortWhen(t.last_at)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className={`min-w-0 flex-1 truncate text-sm ${
                  t.unread > 0 ? 'font-semibold text-navy' : 'text-gray-500'}`}
                >
                  {t.last_preview
                    ? `${t.last_is_mine ? 'You: ' : ''}${t.last_preview}`
                    : 'No messages yet'}
                </span>
                {/* THE COUNT, and it is the reason the list is worth having.
                    A Guide with five Explorers could not previously tell which
                    of them was waiting without opening all five. */}
                {t.unread > 0 && (
                  <span
                    className="shrink-0 rounded-full bg-[#1F7A8C] px-2 py-0.5 text-xs font-bold text-white"
                    aria-label={`${t.unread} waiting`}
                  >
                    {t.unread > 99 ? '99+' : t.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
      {threads.length === 0 && (
        <li className={`text-center text-sm text-gray-500 ${compact ? 'p-4' : 'p-8'}`}>
          You have no conversations yet. Your church arranges those.
        </li>
      )}
    </ul>
  );
}

/**
 * The part under the header, which slides the way you went: a conversation
 * comes in from the right, the list comes back from the left. Keyed by what is
 * showing, so each change is a fresh entrance rather than an edit in place.
 */
export function TalkView({
  view, direction, children, scroll = false,
}: {
  view: string;
  direction: 'forward' | 'back';
  children: React.ReactNode;
  /** The list scrolls; a conversation manages its own single scrollport. */
  scroll?: boolean;
}) {
  return (
    <div
      key={view}
      className={`talk-view-${direction} min-h-0 flex-1 ${scroll ? 'overflow-y-auto' : 'flex flex-col overflow-hidden'}`}
    >
      {children}
    </div>
  );
}
