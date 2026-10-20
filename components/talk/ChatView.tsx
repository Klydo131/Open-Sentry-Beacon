'use client';

// The conversation, drawn by both halves of the app: the sample church
// (components/Chat.tsx) and the live app (components/live/shared.tsx) only
// fetch and save; everything shown is here.
//
// Bubbles group into runs; time and receipt sit inside the bubble; hold,
// right-click or ⋯ opens React/Reply/Copy/Edit/Delete; swipe right to reply;
// one to three emoji are drawn large. There is no typing indicator and no
// online status, and only one read receipt (see `lastMine`).

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
 * A note somebody can dismiss for good, per person and device. Read in an
 * effect (no localStorage on the server); every access guarded (private windows throw).
 */
function useKeepable(key: string): [boolean, () => void] {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === 'put-away') setShown(false);
    } catch {
      /* A private window refuses; the note stays. */
    }
  }, [key]);
  const putAway = useCallback(() => {
    setShown(false);
    try {
      window.localStorage.setItem(key, 'put-away');
    } catch {
      /* Dismissed for this sitting only. */
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
  /** What an empty thread says to this reader. */
  emptyLine?: string;
  reactions?: Reaction[];
  draft: string;
  setDraft: (next: string) => void;
  busy?: boolean;
  onSend: (body: string, replyTo: string | null) => Promise<void> | void;
  /** Edit or take back your own message (author-checked database functions on the live half). */
  onEdit?: (id: string, body: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onReact?: (target: ReactionTarget, emoji: string | null) => Promise<void> | void;
  onAttach?: (file: File) => void;
  attachAccept?: string;
  onRemoveFile?: (id: string) => Promise<void> | void;
  /** Offer the microphone (a voice message goes out through onAttach). */
  voice?: boolean;
  /** Offer Reply. Off on a live database without replies yet, where it would be refused. */
  replies?: boolean;
  attachError?: string;
}) {
  const [showPrivacy, hidePrivacy] = useKeepable('hb-note-private');
  const [showPhotoNote, hidePhotoNote] = useKeepable('hb-note-photos');
  const theirFirst = theirName?.split(' ')[0];

  // File titles are cleaned of direction-override characters (lib/talk/thread.ts).
  const timeline = entries
    .map((e) => (e.kind === 'file' ? { ...e, title: plainTitle(e.title) || 'Attachment' } : e))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byId = new Map(timeline.filter((e) => e.kind === 'message').map((e) => [e.id, e as ChatMessage]));

  // --- Composer ---
  const [mode, setMode] = useState<ComposerMode>({ kind: 'new' });
  const [modeTarget, setModeTarget] = useState('');
  const [editText, setEditText] = useState('');
  const [focusSignal, setFocusSignal] = useState<number | undefined>(undefined);
  // The photo note opens only once the paperclip is used.
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
      // The tutorial's "React or reply" step listens for this.
      if (replyTo) emitQuest('beacon:reply');
      endMode();
    } catch {
      /* The caller shows the error and keeps the draft. */
    }
  };

  // --- Reactions, grouped per message ---
  // None on a taken-back message; a row with an empty emoji is a reaction removed.
  const reactionsOn = (e: ChatEntry) => (e.kind === 'message' && e.deletedAt ? [] : reactions.filter((r) =>
    !!r.emoji && (e.kind === 'message' ? r.message_id === e.id : r.media_id === e.id)));
  const myReactionOn = (e: ChatEntry) => reactionsOn(e).find((r) => r.person_id === me)?.emoji ?? null;

  // --- Read receipt ---
  // One receipt only, under the last message you sent, never on theirs.
  // "Sent" is the useful half: it shows a message still unread.
  const lastMine = (() => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const e = timeline[i];
      // A taken-back message gets no receipt.
      if (e.kind === 'message' && e.who === me && !e.deletedAt) return e;
    }
    return undefined;
  })();

  // --- Scrolling ---
  // scrollIntoView({ block: 'nearest' }) on the newest message moves both the
  // thread and the page by the least they can.
  const box = useRef<HTMLDivElement>(null);
  const newestEl = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  const following = useRef(true);
  const lastId = useRef('');
  const [unseen, setUnseen] = useState(0);
  const [awayFromNewest, setAwayFromNewest] = useState(false);

  // Where the tutorial points for "React or reply".
  const tutorialTarget = (() => {
    const live = timeline.filter((e): e is ChatMessage => e.kind === 'message' && !e.deletedAt);
    const theirs = live.filter((e) => e.who !== me);
    return (theirs[theirs.length - 1] ?? live[live.length - 1])?.id;
  })();

  const newest = timeline[timeline.length - 1];
  const newestKey = newest ? keyOf(newest) : '';
  const newestIsMine = newest?.who === me;

  // On arrival, simply be at the bottom (no animation).
  useLayoutEffect(() => {
    if (landed.current || timeline.length === 0) return;
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    newestEl.current?.scrollIntoView({ block: 'nearest' });
    landed.current = true;
    lastId.current = newestKey;
  }, [timeline.length, newestKey]);

  // New message: always follow your own; follow theirs only if already at the
  // bottom, otherwise count it on the way-back button.
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
    // Move focus to the quoted message too (tabIndex -1).
    el.focus({ preventScroll: true });
    el.classList.add('beacon-landed');
    window.setTimeout(() => el.classList.remove('beacon-landed'), 2200);
  };

  // --- Hold, swipe and right-click ---
  // One set of handlers on the thread. Holding HOLD_MS opens the menu; dragging
  // right past SWIPE_REPLY replies; scrolling cancels both. The bubble follows
  // the thumb directly, so reduced motion does not apply.
  const gesture = useRef<{
    key: string; el: HTMLElement; x: number; y: number; timer: number; dx: number; swiping: boolean;
  } | null>(null);
  // A swipe ends with a click on the same bubble; ignore that click.
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
    // Not on controls inside the bubble; quotes and pictures are part of the message.
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
    // No swipe where Reply is not offered.
    if (replies && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      g.swiping = true;
      g.dx = Math.min(dx, SWIPE_REPLY + 24);
      g.el.style.transform = `translateX(${g.dx}px)`;
    }
  };

  // --- The menu for one message ---
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
        // Through copyText(): works over plain http and in Safari, and reports failure.
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
          // A deleted message leaves a note, so it never silently disappears.
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

  // --- Drawing ---
  return (
    <Card className="relative overflow-hidden" data-live-conversation>
      {/* The privacy promise: one line on a phone, in full from `sm`, dismissible once read. */}
      {showPrivacy && (
        <div className="flex items-center gap-2.5 border-b border-teal-800/10 wash-teal-sky px-4 py-2 sm:gap-3 sm:px-5 sm:py-3">
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

      {/* No fixed height: globals.css sizes the card and lets the thread give up space. */}
      <div
        ref={box}
        data-live-thread
        className="chat-thread chat-ground overflow-y-auto overscroll-contain px-3 pb-3 pt-2 sm:px-4"
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

          // The end of the bubble: "edited", the time where a run ends, and the receipt.
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

          // Corners tighten where bubbles in a run touch; the last keeps a small tail.
          const corners = mine
            ? `rounded-[20px] ${startsRun ? '' : 'rounded-tr-[6px]'} rounded-br-[6px]`
            : `rounded-[20px] ${startsRun ? '' : 'rounded-tl-[6px]'} rounded-bl-[6px]`;
          // Blue for you, white for them, with dark versions (globals.css).
          const tint = mine ? 'bubble-mine' : 'bubble-theirs';

          const message = entry.kind === 'message' ? entry : undefined;
          const bigEmoji = !!message && !message.deletedAt && !message.replyTo
            && EMOJI_ONLY.test(message.body.trim());
          const quoted = message?.replyTo ? byId.get(message.replyTo) : undefined;

          return (
            <div key={key}>
              {/* Day separator, sticky. */}
              {newDay && (
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[0.722rem] font-semibold text-slate-500 shadow-sm ring-1 ring-black/5 backdrop-blur">
                    {dayLabel(entry.at)}
                  </span>
                </div>
              )}
              {/* Only the newest row animates; the thread reloads wholesale. */}
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
                    // A tap opens the menu (not on a link, a button or the player, not after a
                    // swipe, and not while selecting text).
                    onClick={(event) => {
                      if (entry.kind !== 'message' || entry.deletedAt || justSwiped.current) return;
                      if ((event.target as HTMLElement).closest('a, button, input, audio, video')) return;
                      if ((window.getSelection?.()?.toString() ?? '').length > 0) return;
                      setMenuFor(key);
                    }}
                    className={`chat-bubble relative min-w-0 ${entry.kind === 'message' && !entry.deletedAt ? 'cursor-pointer' : ''} ${lit ? 'rounded-[20px] ring-2 ring-[#1F7A8C]/40' : ''} ${
                      entry.kind === 'file' || bigEmoji ? 'rounded-[20px]' : ''}`}
                  >
                    {/* Who is speaking, for screen readers only. */}
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
                      // A deleted message leaves a note in its place.
                      <div className={`${corners} border border-dashed border-slate-300 bg-white px-3.5 py-2`}>
                        <p className="text-[0.833rem] italic leading-snug text-slate-500">
                          {mine ? 'You deleted a message' : `${theirFirst ?? 'They'} deleted a message`}
                        </p>
                        {meta && <p className="mt-0.5 text-right text-[0.722rem] text-slate-500">{meta}</p>}
                      </div>
                    ) : (
                      <div className={`${corners} ${tint} px-3.5 pb-2 pt-2`}>
                        {message?.replyTo && (
                          <button
                            type="button"
                            onClick={() => showOriginal(message.replyTo as string)}
                            className="bubble-quote mb-1.5 block w-full rounded-xl px-2.5 py-1.5 text-left"
                            data-reply-quote
                          >
                            <span className="block text-[0.722rem] font-bold">
                              {quoted ? nameOf(quoted.who) : 'Reply'}
                            </span>
                            <span className="bubble-meta line-clamp-2 block break-words text-[0.722rem] leading-snug">
                              {snippetOf(quoted)}
                            </span>
                          </button>
                        )}
                        {/* The time at the end of the last line: the visible copy is pinned to the
                           corner; an invisible copy reserves its space in the text. */}
                        <div className="relative">
                          <p dir="auto" className="whitespace-pre-wrap break-words text-[0.861rem] leading-[1.42]">
                            <span data-message-text><Linked text={entry.body} /></span>
                            {meta && <span aria-hidden className="invisible ml-2 inline-block text-[0.722rem]">{meta}</span>}
                          </p>
                          {meta && (
                            <span className="bubble-meta absolute bottom-[1px] right-0 text-[0.722rem] leading-none" data-chat-meta>
                              {meta}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Reactions on the bubble's lower edge; a tap opens the menu. */}
                    {grouped.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMenuFor(key)}
                        // min-h-0: not a page control, so no 56px minimum height.
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

                  {/* ⋯ for mouse and keyboard; hidden on a phone (globals.css .chat-more). */}
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

        {/* Back to the newest message; zero height, so it never covers anything. */}
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

      {/* Photos are resized and lose their location; said when the paperclip is used. */}
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
