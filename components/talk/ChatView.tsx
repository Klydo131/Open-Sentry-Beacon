'use client';

// The conversation: one component, drawn by both halves of the app.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 1 OCTOBER 2026, with a screenshot of the chat: "Can we improve
// the chat more to be modern looking and functional as well ... most people
// are digital natives. All users should feel familiar and welcoming to our app
// (with unique design for sure)." Chosen: keep the soft tints (yours teal,
// theirs warm sand) and sharpen the shape; add reactions, replies and voice
// messages.
//
// ONE COMPONENT FOR BOTH HALVES. The sample app (components/Chat.tsx) and the
// live app (components/live/shared.tsx, Conversation) had drifted into two
// different chats. Each now only fetches and saves; everything you SEE is
// here, so the sample is the live app one-to-one and a fix lands in both.
//
// WHAT IS FAMILIAR, ON PURPOSE:
//   * Bubbles in runs: one person's messages within five minutes sit close,
//     their inner corners tighten, and the time is said once, at the end.
//   * The time and the receipt sit INSIDE the bubble, at the end of the last
//     line, instead of on rows of their own underneath.
//   * Hold a message (or right-click, or ⋯) for React, Reply, Copy, Edit and
//     Delete. Swipe a message to the right to reply to it.
//   * Pictures without a bubble around them, opening full screen in the app.
//   * A message of only one to three emoji is drawn large, with no bubble.
//   * A button back to the newest message when you have scrolled up, with how
//     many arrived meanwhile.
//
// WHAT IS OURS: 🙏 first among the reactions; the soft teal and warm sand; and
// no names inside a conversation between two people -- the header already
// says who it is (a screen reader is still told who is speaking).
//
// WHAT IS DELIBERATELY NOT HERE: no typing indicator and no online status. A
// Guide's silence and an Explorer's are not anybody else's business
// (components/live/TalkDock.tsx). One read receipt, under the last thing you
// sent, by the owner's decision -- see `lastMine` below.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { ArrowDownGlyph, KebabGlyph } from '@/components/Glyph';
import { ChatAttachment, ImageViewer, shapeOf, type ChatFile } from '@/components/talk/ChatAttachment';
import { Composer, type ComposerMode } from '@/components/talk/Composer';
import { MENU_ICONS, MessageMenu, type MenuAction } from '@/components/talk/MessageMenu';
import { clockTime, dayKey, dayLabel, plainTitle, runsOn, sameDay } from '@/lib/talk/thread';
import { reactionLabel, type Reaction, type ReactionTarget } from '@/lib/talk/reactions';
import { scrollMotion } from '@/lib/motion';
import { copyText } from '@/lib/share';
import { emitQuest } from '@/lib/quest';

export type { ChatFile } from '@/components/talk/ChatAttachment';

export interface ChatMessage {
  kind: 'message';
  id: string;
  at: string;
  who: string;
  body: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  readAt?: string | null;
  replyTo?: string | null;
}

export type ChatEntry = ChatMessage | ChatFile;

const keyOf = (e: ChatEntry) => `${e.kind}-${e.id}`;
const targetOf = (e: ChatEntry): ReactionTarget => (e.kind === 'message' ? { message: e.id } : { media: e.id });

/** One to three emoji and nothing else: drawn large, with no bubble. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*\s*){1,3}$/u;

/** How far a thumb drags a message before letting go counts as Reply. */
const SWIPE_REPLY = 56;
/** How long a thumb rests on a message before the menu opens. */
const HOLD_MS = 450;

/**
 * A note somebody has read once and can put away for good. Per person and per
 * device, because that is what localStorage is; read in an effect, because it
 * does not exist while this renders on the server; every access wrapped,
 * because a private window throws, and a note that cannot be dismissed is
 * better than a conversation that will not open.
 */
function useKeepable(key: string): [boolean, () => void] {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === 'put-away') setShown(false);
    } catch {
      /* A private window refuses. The note simply stays. */
    }
  }, [key]);
  const putAway = useCallback(() => {
    setShown(false);
    try {
      window.localStorage.setItem(key, 'put-away');
    } catch {
      /* Dismissed for this sitting rather than for good. Still dismissed. */
    }
  }, [key]);
  return [shown, putAway];
}

/** The X on a note. 44px, because it is a real target on a real thumb. */
function PutAway({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Hide the note about ${what}`}
      className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg leading-none text-slate-500 hover:bg-black/5 hover:text-slate-700"
    >
      &times;
    </button>
  );
}

export function ChatView({
  entries,
  me,
  myName,
  theirName,
  emptyLine,
  reactions = [],
  draft,
  setDraft,
  busy = false,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onAttach,
  attachAccept,
  onRemoveFile,
  replies = true,
  voice = false,
  attachError,
}: {
  entries: ChatEntry[];
  /** The signed-in person's id. */
  me: string;
  myName?: string;
  theirName?: string;
  /**
   * What an empty thread says, to THIS reader. "Start with a welcome" is the
   * Guide's job; an Explorer opening their first conversation should not be
   * told to do somebody else's.
   */
  emptyLine?: string;
  reactions?: Reaction[];
  draft: string;
  setDraft: (next: string) => void;
  busy?: boolean;
  onSend: (body: string, replyTo: string | null) => Promise<void> | void;
  /**
   * Change or take back your OWN message. On the live half both go through
   * definer functions that check you are the author and keep what was said in
   * a table no browser can read (lib/live/data.ts).
   */
  onEdit?: (id: string, body: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onReact?: (target: ReactionTarget, emoji: string | null) => Promise<void> | void;
  onAttach?: (file: File) => void;
  attachAccept?: string;
  onRemoveFile?: (id: string) => Promise<void> | void;
  /** Offer the microphone (a voice message goes out through onAttach). */
  voice?: boolean;
  /**
   * Offer Reply, in the menu and by swiping. Off on a live database that does
   * not have replies yet (components/live/shared.tsx), where a reply would be
   * refused; everything else in the conversation works as it did.
   */
  replies?: boolean;
  attachError?: string;
}) {
  const [showPrivacy, hidePrivacy] = useKeepable('hb-note-private');
  const [showPhotoNote, hidePhotoNote] = useKeepable('hb-note-photos');
  const theirFirst = theirName?.split(' ')[0];

  // A file's title is somebody else's text: cleaned of the characters that
  // reverse a name before it is drawn anywhere (lib/talk/thread.ts).
  const timeline = entries
    .map((e) => (e.kind === 'file' ? { ...e, title: plainTitle(e.title) || 'Attachment' } : e))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byId = new Map(timeline.filter((e) => e.kind === 'message').map((e) => [e.id, e as ChatMessage]));

  // ---- What the composer is doing ------------------------------------------
  const [mode, setMode] = useState<ComposerMode>({ kind: 'new' });
  const [modeTarget, setModeTarget] = useState('');
  const [editText, setEditText] = useState('');
  const [focusSignal, setFocusSignal] = useState<number | undefined>(undefined);
  // Whether the paperclip has been reached for: the photo note opens then,
  // rather than sitting over every conversation that never sends a photo.
  const [attaching, setAttaching] = useState(false);
  const [menuFor, setMenuFor] = useState('');
  const [rowBusy, setRowBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [viewer, setViewer] = useState<{ src: string; title: string } | null>(null);

  const say = (text: string, bad = false) => {
    setNotice({ text, bad });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), bad ? 5000 : 1800);
  };

  const snippetOf = (m: ChatMessage | undefined): string => {
    if (!m) return 'An earlier message';
    if (m.deletedAt) return 'A deleted message';
    return m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body;
  };
  const nameOf = (who: string) => (who === me ? 'You' : theirFirst ?? 'Them');

  const beginReply = (m: ChatMessage) => {
    setMode({ kind: 'reply', who: m.who === me ? 'yourself' : theirFirst ?? 'them', snippet: snippetOf(m) });
    setModeTarget(m.id);
    setFocusSignal(Date.now());
  };
  const beginEdit = (m: ChatMessage) => {
    setMode({ kind: 'edit' });
    setModeTarget(m.id);
    setEditText(m.body);
    setFocusSignal(Date.now());
  };
  const endMode = () => { setMode({ kind: 'new' }); setModeTarget(''); setEditText(''); };

  const submit = async () => {
    if (mode.kind === 'edit') {
      const text = editText.trim();
      if (!text || !onEdit) return;
      try {
        await onEdit(modeTarget, text);
        endMode();
      } catch {
        say('That message could not be changed. Try again.', true);
      }
      return;
    }
    const text = draft.trim();
    if (!text) return;
    const replyTo = mode.kind === 'reply' ? modeTarget : null;
    try {
      await onSend(text, replyTo);
      // The tutorial's "React or reply" step listens for this (lib/quest.ts).
      if (replyTo) emitQuest('beacon:reply');
      endMode();
    } catch {
      /* The caller shows its own error and keeps the draft. */
    }
  };

  // ---- Reactions, grouped per thing ----------------------------------------
  // Nothing on a message that was taken back: the words are gone, so is what
  // was said about them. The live database keeps those rows (taking a message
  // back empties it rather than deleting it), and a row whose emoji is empty
  // is a reaction taken back -- neither is shown.
  const reactionsOn = (e: ChatEntry) => (e.kind === 'message' && e.deletedAt ? [] : reactions.filter((r) =>
    !!r.emoji && (e.kind === 'message' ? r.message_id === e.id : r.media_id === e.id)));
  const myReactionOn = (e: ChatEntry) => reactionsOn(e).find((r) => r.person_id === me)?.emoji ?? null;

  // ---- WHETHER THE LAST THING YOU SAID HAS BEEN READ -------------------------
  //
  // THE OWNER ASKED FOR THIS DELIBERATELY, after it was raised as a decision
  // rather than built. The concern was real and is recorded so nobody wonders
  // later: a receipt puts pressure on the person who has not replied, and an
  // Explorer bringing something hard to their Guide is exactly the person least
  // able to carry that. What makes it worth the cost is a Guide writing into a
  // silence who cannot otherwise tell "read it and had nothing to say" from
  // "has not been back since August".
  //
  // ONE RECEIPT IN THE WHOLE THREAD, UNDER THE LAST THING YOU SENT. A column of
  // Seen down everything you have ever written is surveillance-shaped. And YOUR
  // OWN MESSAGES ONLY: a receipt on theirs would announce that you had read it.
  // `Sent` is the half that does the work -- the useful sentence is the one on
  // a message from four days ago that still says Sent.
  const lastMine = (() => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const e = timeline[i];
      // A taken-back message is not something to report a reading of.
      if (e.kind === 'message' && e.who === me && !e.deletedAt) return e;
    }
    return undefined;
  })();

  // ---- THE THREAD OPENS ON THE NEWEST MESSAGE, AND FOLLOWS THE ONE YOU SENT --
  //
  // TWO SCROLLPORTS: the thread, and the page, because the composer taking
  // focus scrolls the page. `scrollIntoView({ block: 'nearest' })` on the
  // NEWEST MESSAGE (not on a marker after it, which sits on the bottom edge and
  // is "visible" while the message above it is not) moves both by the least
  // they can.
  const box = useRef<HTMLDivElement>(null);
  const newestEl = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  const following = useRef(true);
  const lastId = useRef('');
  const [unseen, setUnseen] = useState(0);
  const [awayFromNewest, setAwayFromNewest] = useState(false);

  // WHERE THE TUTORIAL POINTS for "React or reply": their newest message, or
  // the newest message at all when they have not written yet.
  const tutorialTarget = (() => {
    const live = timeline.filter((e): e is ChatMessage => e.kind === 'message' && !e.deletedAt);
    const theirs = live.filter((e) => e.who !== me);
    return (theirs[theirs.length - 1] ?? live[live.length - 1])?.id;
  })();

  const newest = timeline[timeline.length - 1];
  const newestKey = newest ? keyOf(newest) : '';
  const newestIsMine = newest?.who === me;

  // ARRIVING: simply BE at the bottom, the way any messaging app opens. No
  // animation: smoothly scrolling a page you have only just seen moves under you.
  useLayoutEffect(() => {
    if (landed.current || timeline.length === 0) return;
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    newestEl.current?.scrollIntoView({ block: 'nearest' });
    landed.current = true;
    lastId.current = newestKey;
  }, [timeline.length, newestKey]);

  // SOMETHING NEW. You sent it: always follow. Somebody else did: follow only
  // if you were already at the bottom -- yanking a reader who has scrolled up
  // to find what was said last Tuesday is worse than not scrolling -- and
  // count it on the way-back button instead.
  useEffect(() => {
    const el = box.current;
    if (!el || !newestKey || newestKey === lastId.current) return;
    lastId.current = newestKey;
    if (newestIsMine || following.current) {
      const behavior = landed.current ? scrollMotion() : 'auto';
      el.scrollTo({ top: el.scrollHeight, behavior });
      newestEl.current?.scrollIntoView({ block: 'nearest', behavior });
      following.current = true;
      setUnseen(0);
    } else {
      setUnseen((n) => n + 1);
    }
  }, [newestKey, newestIsMine]);

  const toNewest = () => {
    const el = box.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: scrollMotion() });
    following.current = true;
    setUnseen(0);
    setAwayFromNewest(false);
  };

  /** Bring the message a reply quotes into view, and mark it for a moment. */
  const showOriginal = (id: string) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-entry-id="message-${id}"] [data-bubble]`);
    if (!el) { say('That message is further back than this conversation has loaded.'); return; }
    el.scrollIntoView({ block: 'center', behavior: scrollMotion() });
    // AND THE FOCUS GOES WITH IT, so a screen reader or a keyboard lands on the
    // message that was quoted rather than staying on the quote (Delta Chat does
    // the same). tabIndex -1: reachable this way, not a stop on every Tab.
    el.focus({ preventScroll: true });
    el.classList.add('beacon-landed');
    window.setTimeout(() => el.classList.remove('beacon-landed'), 2200);
  };

  // ---- HOLD, SWIPE AND RIGHT-CLICK -------------------------------------------
  //
  // One set of handlers on the thread, not one per message. A thumb resting
  // HOLD_MS on a message opens its menu; a thumb dragging it right by
  // SWIPE_REPLY and letting go replies to it; scrolling cancels both. The
  // bubble follows the thumb directly (`transform`), so it moves with the
  // finger rather than animating, which is why it is not stilled for reduced
  // motion -- nothing moves that the person is not moving.
  const gesture = useRef<{
    key: string; el: HTMLElement; x: number; y: number; timer: number; dx: number; swiping: boolean;
  } | null>(null);
  // A swipe ends with a click on the same bubble; that click is not a tap.
  const justSwiped = useRef(false);

  const entryFrom = (target: EventTarget | null): ChatEntry | undefined => {
    const host = (target as HTMLElement | null)?.closest?.('[data-entry-id]') as HTMLElement | null;
    const key = host?.dataset.entryId;
    return key ? timeline.find((e) => keyOf(e) === key) : undefined;
  };

  const hasMenu = (e: ChatEntry) => !(e.kind === 'message' && e.deletedAt);

  const endGesture = (apply: boolean) => {
    const g = gesture.current;
    if (!g) return;
    window.clearTimeout(g.timer);
    if (g.swiping) {
      justSwiped.current = true;
      window.setTimeout(() => { justSwiped.current = false; }, 80);
      g.el.style.transition = 'transform 160ms ease-out';
      g.el.style.transform = '';
      window.setTimeout(() => { g.el.style.transition = ''; }, 170);
      if (apply && replies && g.dx >= SWIPE_REPLY) {
        const e = timeline.find((x) => keyOf(x) === g.key);
        if (e?.kind === 'message' && !e.deletedAt) beginReply(e);
      }
    }
    gesture.current = null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    const entry = entryFrom(event.target);
    const bubble = (event.target as HTMLElement).closest('[data-bubble]') as HTMLElement | null;
    if (!entry || !bubble || !hasMenu(entry)) return;
    // Not on a control inside the bubble: a play button is pressed, not held,
    // and a link keeps the browser's own long-press. A quoted reply and a
    // picture ARE the message, so holding them opens its menu.
    if ((event.target as HTMLElement).closest('button, a, input, audio, video')
        && !(event.target as HTMLElement).closest('[data-chat-image], [data-reply-quote]')) return;
    const key = keyOf(entry);
    gesture.current = {
      key, el: bubble, x: event.clientX, y: event.clientY, dx: 0, swiping: false,
      timer: window.setTimeout(() => {
        gesture.current = null;
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch { /* not allowed here */ } }
        setMenuFor(key);
      }, HOLD_MS),
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.swiping && (Math.abs(dy) > 10 || Math.abs(dx) > 10)) window.clearTimeout(g.timer);
    if (!g.swiping && Math.abs(dy) > 12) { gesture.current = null; return; }
    // No swipe at all where Reply is not offered: a bubble that follows the
    // thumb promises something will happen.
    if (replies && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      g.swiping = true;
      g.dx = Math.min(dx, SWIPE_REPLY + 24);
      g.el.style.transform = `translateX(${g.dx}px)`;
    }
  };

  // ---- The menu for one message ---------------------------------------------
  const menuEntry = menuFor ? timeline.find((e) => keyOf(e) === menuFor) : undefined;

  const runRow = async (work: () => Promise<void> | void, failed: string) => {
    setRowBusy(true);
    try {
      await work();
      setMenuFor('');
    } catch {
      say(failed, true);
    } finally {
      setRowBusy(false);
    }
  };

  const actionsFor = (e: ChatEntry): MenuAction[] => {
    const mine = e.who === me;
    const list: MenuAction[] = [];
    if (e.kind === 'message') {
      if (replies) list.push({ key: 'reply', label: 'Reply', icon: MENU_ICONS.reply, run: () => { setMenuFor(''); beginReply(e); } });
      list.push({
        key: 'copy', label: 'Copy', icon: MENU_ICONS.copy,
        // Through copyText(), the one place the clipboard is touched: it works
        // over plain http and on Safari, and says honestly when it did not.
        run: () => {
          setMenuFor('');
          void copyText(e.body).then((done) => {
            if (done) say('Copied');
            else say('This browser would not let the app copy. Select the words instead.', true);
          });
        },
      });
      if (mine && onEdit) {
        list.push({ key: 'edit', label: 'Edit', icon: MENU_ICONS.edit, run: () => { setMenuFor(''); beginEdit(e); } });
      }
      if (mine && onDelete) {
        list.push({
          key: 'delete', label: 'Delete', icon: MENU_ICONS.delete,
          // Said plainly: a message is never silently gone. The other person
          // remembers reading something, and the thread must not say they
          // imagined it.
          danger: {
            confirm: 'Delete this message?',
            detail: `It goes for both of you, and ${theirFirst ?? 'they'} will see that a message was deleted.`,
          },
          run: () => void runRow(() => onDelete(e.id), 'That message could not be deleted.'),
        });
      }
    } else {
      list.push({
        key: 'open', label: shapeOf(e) === 'image' ? 'Open the picture' : 'Open the file', icon: MENU_ICONS.open,
        run: () => {
          setMenuFor('');
          void e.load().then((url) => {
            if (shapeOf(e) === 'image') setViewer({ src: url, title: e.title });
            else window.open(url, '_blank', 'noopener,noreferrer');
          }).catch(() => say('That file could not be opened.', true));
        },
      });
      if (mine && onRemoveFile) {
        list.push({
          key: 'remove', label: 'Remove', icon: MENU_ICONS.delete,
          danger: { confirm: 'Remove this file?', detail: 'It goes for both of you.' },
          run: () => void runRow(() => onRemoveFile(e.id), 'That file could not be removed.'),
        });
      }
    }
    return list;
  };

  // ---- Drawing ----------------------------------------------------------------
  return (
    <Card className="relative overflow-hidden" data-live-conversation>
      {/* THE PROMISE STAYS. IT JUST STOPS TAKING A FIFTH OF THE PHONE.
          "Only the two people walking together can read this" may be the most
          important sentence on the screen for somebody bringing a hard thing
          to their Guide. One line on a phone, the full stack from `sm` up, and
          an X once it has been read. */}
      {showPrivacy && (
        <div className="flex items-center gap-2.5 border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-2 sm:gap-3 sm:px-5 sm:py-3">
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm shadow-sm sm:h-10 sm:w-10 sm:rounded-2xl sm:text-lg">💬</span>
          <div className="min-w-0">
            <h2 className="text-[0.722rem] font-extrabold leading-tight text-navy sm:text-base">
              Private conversation
            </h2>
            <p className="text-[0.722rem] leading-tight text-gray-600 sm:text-sm">
              Only the two people walking together can read this.
            </p>
          </div>
          <PutAway onClick={hidePrivacy} what="this being private" />
        </div>
      )}

      {/* THE THREAD. No fixed height: globals.css sizes the card against the
          real chrome and lets this be the one part that gives up space. */}
      <div
        ref={box}
        data-live-thread
        className="chat-thread overflow-y-auto overscroll-contain bg-[#FBFAF8] px-3 pb-3 pt-2 sm:px-4"
        onScroll={() => {
          const el = box.current;
          if (!el) return;
          // Slack for sub-pixel heights and the iOS rubber band.
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          following.current = atBottom;
          setAwayFromNewest(!atBottom && el.scrollHeight - el.scrollTop - el.clientHeight > 240);
          if (atBottom) setUnseen(0);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        onContextMenu={(event) => {
          const entry = entryFrom(event.target);
          if (!entry || !hasMenu(entry)) return;
          if ((event.target as HTMLElement).closest('a')) return; // a link keeps its own menu
          event.preventDefault();
          endGesture(false);
          setMenuFor(keyOf(entry));
        }}
        aria-live="polite"
        aria-label="Conversation messages"
      >
        {timeline.length === 0 && (
          <p className="py-16 text-center text-slate-600">
            {emptyLine ?? 'Start with a welcome.'}
          </p>
        )}

        {timeline.map((entry, index) => {
          const mine = entry.who === me;
          const isNewest = index === timeline.length - 1;
          const prev = index > 0 ? timeline[index - 1] : undefined;
          const next = index < timeline.length - 1 ? timeline[index + 1] : undefined;
          const newDay = !prev || dayKey(prev.at) !== dayKey(entry.at);
          const startsRun = newDay || !runsOn(prev, entry);
          const endsRun = !next || !runsOn(entry, next);
          const key = keyOf(entry);
          const lit = menuFor === key;

          const here = reactionsOn(entry);
          const grouped = [...new Set(here.map((r) => r.emoji))].map((emoji) => ({
            emoji,
            count: here.filter((r) => r.emoji === emoji).length,
            mineToo: here.some((r) => r.emoji === emoji && r.person_id === me),
          }));

          // WHAT SITS AT THE END OF THE BUBBLE: "edited", the time where a run
          // ends, and the one receipt. Built once, drawn twice for text (see
          // the spacer below).
          const isLastMine = entry.kind === 'message' && lastMine && entry.id === lastMine.id;
          const receipt = isLastMine && entry.kind === 'message'
            ? (entry.readAt
              ? `Seen ${sameDay(entry.readAt) ? clockTime(entry.readAt) : dayLabel(entry.readAt).toLowerCase()}`
              : 'Sent')
            : '';
          const metaParts = [
            entry.kind === 'message' && entry.editedAt && !entry.deletedAt ? 'edited' : '',
            endsRun ? clockTime(entry.at) : '',
            receipt,
          ].filter(Boolean);
          const meta = metaParts.length ? metaParts.join(' · ') : '';

          // RUNS AS ONE SHAPE: the corners on the speaker's side tighten where
          // a bubble touches the next one in its run, and the last keeps a small
          // corner as its tail.
          const corners = mine
            ? `rounded-[20px] ${startsRun ? '' : 'rounded-tr-[6px]'} rounded-br-[6px]`
            : `rounded-[20px] ${startsRun ? '' : 'rounded-tl-[6px]'} rounded-bl-[6px]`;
          const tint = mine ? 'bg-[#E4F0F5]' : 'bg-[#FCEEDF]';

          const message = entry.kind === 'message' ? entry : undefined;
          const bigEmoji = !!message && !message.deletedAt && !message.replyTo
            && EMOJI_ONLY.test(message.body.trim());
          const quoted = message?.replyTo ? byId.get(message.replyTo) : undefined;

          return (
            <div key={key}>
              {/* WHERE ONE DAY BECOMES THE NEXT. Sticky, so scrolling back
                  through a long thread always says which day you are reading. */}
              {newDay && (
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[0.722rem] font-semibold text-slate-500 shadow-sm ring-1 ring-black/5 backdrop-blur">
                    {dayLabel(entry.at)}
                  </span>
                </div>
              )}
              {/* ONLY THE NEWEST ROW ANIMATES. The thread reloads wholesale, so
                  animating every row would make the whole conversation flicker
                  whenever anything changed. */}
              <div
                ref={isNewest ? newestEl : undefined}
                data-chat-entry={entry.kind === 'message' ? 'message' : 'media'}
                data-entry-id={key}
                data-mine={mine ? 'true' : undefined}
                className={`group/msg flex ${mine ? 'justify-end' : 'justify-start'} ${
                  startsRun ? 'mt-3' : 'mt-[3px]'} ${grouped.length ? 'mb-3.5' : ''} ${isNewest ? 'talk-message-in' : ''}`}
              >
                <div className={`relative flex max-w-[84%] items-center gap-1 sm:max-w-[78%] ${mine ? 'flex-row-reverse' : ''}`}>
                  <div
                    data-bubble
                    tabIndex={-1}
                    data-quest={entry.kind === 'message' && entry.id === tutorialTarget ? 'chat-message' : undefined}
                    // TAP A MESSAGE FOR ITS MENU. Holding works too, as does
                    // right-click and ⋯, but a tap is the one thing nobody has
                    // to be told -- and an older hand finds a hold hard to time.
                    // Not when the tap was on a link, a button or the player
                    // inside it, not at the end of a swipe, and not while words
                    // are being selected to copy by hand.
                    onClick={(event) => {
                      if (entry.kind !== 'message' || entry.deletedAt || justSwiped.current) return;
                      if ((event.target as HTMLElement).closest('a, button, input, audio, video')) return;
                      if ((window.getSelection?.()?.toString() ?? '').length > 0) return;
                      setMenuFor(key);
                    }}
                    className={`chat-bubble relative min-w-0 ${entry.kind === 'message' && !entry.deletedAt ? 'cursor-pointer' : ''} ${lit ? 'rounded-[20px] ring-2 ring-[#1F7A8C]/40' : ''} ${
                      entry.kind === 'file' || bigEmoji ? 'rounded-[20px]' : ''}`}
                  >
                    {/* WHO IS SPEAKING, for a screen reader and nobody else: in a
                        conversation between two people the side says it. */}
                    {startsRun && <span className="sr-only">{mine ? 'You:' : `${theirFirst ?? 'They'}:`}</span>}

                    {entry.kind === 'file' ? (
                      <ChatAttachment
                        file={entry}
                        mine={mine}
                        meta={meta || undefined}
                        onViewImage={(src, title) => setViewer({ src, title })}
                      />
                    ) : bigEmoji ? (
                      <div className="px-1">
                        <p className="text-[2.222rem] leading-[1.15]" aria-label={`${entry.body}`}>{entry.body}</p>
                        {meta && <p className={`text-[0.722rem] text-slate-600 ${mine ? 'text-right' : ''}`}>{meta}</p>}
                      </div>
                    ) : entry.deletedAt ? (
                      // THE NOTE THAT REPLACES THE WORDS. A message that vanished
                      // without trace reads as one never sent, which is worse than
                      // either the message or its removal.
                      <div className={`${corners} border border-dashed border-slate-300 bg-white px-3.5 py-2`}>
                        <p className="text-[0.833rem] italic leading-snug text-slate-500">
                          {mine ? 'You deleted a message' : `${theirFirst ?? 'They'} deleted a message`}
                        </p>
                        {meta && <p className="mt-0.5 text-right text-[0.722rem] text-slate-500">{meta}</p>}
                      </div>
                    ) : (
                      <div className={`${corners} ${tint} px-3.5 pb-2 pt-2 text-slate-800`}>
                        {message?.replyTo && (
                          <button
                            type="button"
                            onClick={() => showOriginal(message.replyTo as string)}
                            className={`mb-1.5 block w-full rounded-xl border-l-[3px] bg-white/65 px-2.5 py-1.5 text-left ${
                              quoted?.who === me ? 'border-[#1F7A8C]' : 'border-[#C2762B]'}`}
                            data-reply-quote
                          >
                            <span className={`block text-[0.722rem] font-bold ${quoted?.who === me ? 'text-[#1F7A8C]' : 'text-[#9A5A1C]'}`}>
                              {quoted ? nameOf(quoted.who) : 'Reply'}
                            </span>
                            <span className="line-clamp-2 block break-words text-[0.722rem] leading-snug text-slate-600">
                              {snippetOf(quoted)}
                            </span>
                          </button>
                        )}
                        {/* THE TIME AT THE END OF THE LAST LINE. The visible copy is
                            pinned to the corner; an invisible copy at the end of the
                            words holds exactly its room, so a short line keeps the
                            time beside it and a full line pushes it under. */}
                        <div className="relative">
                          <p dir="auto" className="whitespace-pre-wrap break-words text-[0.861rem] leading-[1.42]">
                            <span data-message-text><Linked text={entry.body} /></span>
                            {meta && <span aria-hidden className="invisible ml-2 inline-block text-[0.722rem]">{meta}</span>}
                          </p>
                          {meta && (
                            <span className="absolute bottom-[1px] right-0 text-[0.722rem] leading-none text-slate-600" data-chat-meta>
                              {meta}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* REACTIONS, on the bubble's lower edge, as everywhere else. A
                        tap opens the same menu, to change yours. */}
                    {grouped.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMenuFor(key)}
                        // min-h-0: furniture on the bubble's edge, not a page
                        // control -- the 56px floor would make it a tall capsule.
                        className={`absolute -bottom-3.5 ${mine ? 'right-2' : 'left-2'} flex min-h-0 items-center gap-0.5 rounded-full bg-white px-1.5 py-1 text-[0.778rem] leading-none shadow-sm ring-1 ring-black/10 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']`}
                        aria-label={`Reactions: ${here.map((r) => `${reactionLabel(r.emoji)} from ${r.person_id === me ? 'you' : theirFirst ?? 'them'}`).join(', ')}. Change yours`}
                        data-reactions
                      >
                        {grouped.map((g) => (
                          <span key={g.emoji} className={g.mineToo ? 'rounded-full bg-[#1F7A8C]/10 px-0.5' : 'px-0.5'}>{g.emoji}</span>
                        ))}
                        {here.length > 1 && <span className="pl-0.5 text-[0.722rem] font-bold text-slate-500">{here.length}</span>}
                      </button>
                    )}
                  </div>

                  {/* ⋯ BESIDE IT, for a mouse and a keyboard. Hidden on a phone,
                      where holding the message does the same (globals.css
                      .chat-more). */}
                  {hasMenu(entry) && (
                    <button
                      type="button"
                      onClick={() => setMenuFor(key)}
                      aria-label={`More options for ${mine ? 'your' : `${theirFirst ?? 'their'}`} ${entry.kind === 'message' ? 'message' : 'file'}`}
                      className="chat-more grid h-11 min-h-0 w-11 shrink-0 place-items-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-black/5 hover:text-slate-600 focus:opacity-100 group-hover/msg:opacity-100"
                      data-message-more
                    >
                      <KebabGlyph size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* BACK TO THE NEWEST, once you have scrolled away from it. Sticky to
            the bottom of the thread and zero height, so it never adds to the
            scroll or covers the last message when you are already there. */}
        {(awayFromNewest || unseen > 0) && (
          <div className="pointer-events-none sticky bottom-0 z-20 h-0">
            <button
              type="button"
              onClick={toNewest}
              className="chat-jump pointer-events-auto absolute bottom-2 right-0 grid h-11 min-h-0 w-11 place-items-center rounded-full bg-white text-navy lift-3 ring-1 ring-black/10"
              aria-label={unseen > 0 ? `${unseen} new ${unseen === 1 ? 'message' : 'messages'}. Go to the newest` : 'Go to the newest message'}
              data-jump-newest
            >
              <ArrowDownGlyph size={20} />
              {unseen > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-[#1F7A8C] px-1 text-center text-[0.722rem] font-bold leading-5 text-white">
                  {unseen}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p
          role={notice.bad ? 'alert' : 'status'}
          className={`border-t border-black/5 px-4 py-2 text-sm ${notice.bad ? 'bg-red-50 text-red-800' : 'bg-teal-50 text-teal-900'}`}
        >
          {notice.text}
        </p>
      )}

      {attachError && (
        <p className="border-t border-black/5 bg-red-50 px-4 py-2 text-sm text-red-800">{attachError}</p>
      )}

      {/* SAID WHERE THE DECISION IS MADE: a photo is made smaller and loses the
          location the camera wrote into it. Opened when the paperclip is
          reached for, not left over every conversation. */}
      {onAttach && showPhotoNote && attaching && (
        <div className="flex items-start gap-2 border-t border-black/5 bg-slate-50 px-4 py-2">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-500">
            Photos are made smaller before they are sent, and the location your camera
            recorded is removed. Up to 10 MB each. For anything larger, share a link.
          </p>
          <PutAway onClick={hidePhotoNote} what="photos" />
        </div>
      )}

      <Composer
        value={mode.kind === 'edit' ? editText : draft}
        onChange={mode.kind === 'edit' ? setEditText : setDraft}
        mode={mode}
        onCancelMode={endMode}
        onSubmit={() => void submit()}
        busy={busy}
        onAttach={onAttach}
        attachAccept={attachAccept}
        onAttachIntent={() => setAttaching(true)}
        onVoice={voice && onAttach ? onAttach : undefined}
        focusSignal={focusSignal}
      />

      {menuEntry && (
        <MessageMenu
          title={menuEntry.who === me
            ? `your ${menuEntry.kind === 'message' ? 'message' : 'file'}`
            : `${theirFirst ?? 'their'}'s ${menuEntry.kind === 'message' ? 'message' : 'file'}`}
          mine={menuEntry.who === me}
          preview={menuEntry.kind === 'message'
            ? snippetOf(menuEntry)
            : shapeOf(menuEntry) === 'image' ? 'Photo'
              : shapeOf(menuEntry) === 'voice' ? 'Voice message' : menuEntry.title}
          myReaction={myReactionOn(menuEntry)}
          canReact={!!onReact}
          actions={actionsFor(menuEntry)}
          busy={rowBusy}
          onReact={(emoji) => {
            const target = targetOf(menuEntry);
            setMenuFor('');
            void Promise.resolve(onReact?.(target, emoji))
              // The tutorial's "React or reply" step listens for this.
              .then(() => { if (emoji) emitQuest('beacon:react'); })
              .catch(() => say('That reaction did not go through.', true));
          }}
          onClose={() => setMenuFor('')}
        />
      )}

      {viewer && <ImageViewer src={viewer.src} title={viewer.title} onClose={() => setViewer(null)} />}
    </Card>
  );
}
