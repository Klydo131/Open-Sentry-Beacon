'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as live from '@/lib/live/data';
import type { Message, Profile } from '@/lib/types';
import { MessageBox } from '@/components/MessageBox';
import { Linked } from '@/components/Linked';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';
// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

export const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export const errorText = (cause: unknown) =>
  humanError(cause, 'Something went wrong. Please try again.');

export type Entry =
  | { kind: 'message'; id: string; at: string; who: string; message: Message }
  | { kind: 'file'; id: string; at: string; who: string; file: live.PairingFile };


/**
 * Was this sent today?
 *
 * A thread of this morning's replies stamped "Sep 2" four times reads as four
 * separate days, which is the opposite of what a timestamp is for.
 */
function sameDay(at: string): boolean {
  const then = new Date(at);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

/** The calendar day something happened on, for comparing two entries. */
function dayKey(at: string): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * What to call a day in a divider: Today, Yesterday, or the date itself.
 *
 * WHY A THREAD NEEDS THESE AT ALL. Every bubble already carries its own
 * timestamp, and for a conversation inside one day that is enough. Over weeks
 * it is not: a stamp reading "Sep 2" on one bubble and "Sep 9" four bubbles
 * later tells you the dates but never draws the LINE between them, so a reply
 * that came a week later reads as the next thing said. Where a week passed
 * between two messages is often the most important thing on the screen --
 * especially for a Guide looking back at whether somebody went quiet.
 */
function dayLabel(at: string): string {
  const then = new Date(at);
  if (sameDay(at)) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday.toISOString())) return 'Yesterday';

  // Inside the last week the weekday is what people actually remember -- "we
  // talked about it on Tuesday" -- and a bare date makes them count back.
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days < 7) return then.toLocaleDateString([], { weekday: 'long' });

  // The year only once it is not this one, so an ordinary thread is not
  // stamped 2026 on every divider.
  const thisYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/** Messages this close together, from one person, are one piece of talking. */
const SAME_BREATH_MS = 5 * 60 * 1000;

export function Conversation({
  messages,
  files,
  myId,
  myName,
  theirName,
  body,
  setBody,
  send,
  busy,
  onAttach,
  onRemoveFile,
  attachError,
  onEditMessage,
  onDeleteMessage,
}: {
  messages: Message[];
  files: live.PairingFile[];
  myId: string;
  /** Both optional: a caller that passes neither gets the thread with no names,
   *  exactly as before, rather than a row of blanks. */
  myName?: string;
  theirName?: string;
  body: string;
  setBody: (value: string) => void;
  send: (event: React.FormEvent) => void;
  busy: boolean;
  /**
   * Change or take back your OWN message. Both optional: a caller that passes
   * neither gets the thread exactly as before, with no controls on it.
   *
   * Neither is a plain table write. Until today `messages_mark` -- an UPDATE
   * policy that exists for read receipts -- let either person in the pairing
   * rewrite the other's words silently, because RLS is row level and says
   * nothing about columns. The browser may now only touch `read_at`; these go
   * through definer functions that check you are the author, and both keep what
   * was said in a table no browser can read.
   */
  onEditMessage?: (id: string, body: string) => Promise<void>;
  onDeleteMessage?: (id: string) => Promise<void>;
  onAttach?: (file: File) => void;
  onRemoveFile?: (file: live.PairingFile) => void;
  attachError?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // THE THREAD OPENS ON THE NEWEST MESSAGE, AND FOLLOWS THE ONE YOU JUST SENT.
  //
  // THE BUG: "when I message, it should always track to the latest." There was
  // no scrolling code here at all. The thread is a fixed-height box with
  // `overflow-y-auto`, so it opened at scroll position ZERO — the oldest
  // message in the conversation — and stayed there. Sending appended the new
  // message below the fold, out of sight. The screenshot shows the reply half
  // cut off behind the composer.
  //
  // On a short conversation nothing looks wrong, which is why it survived: you
  // only meet it once there is more history than fits.
  const box = useRef<HTMLDivElement>(null);
  // A ref on the NEWEST MESSAGE — not on a marker after it.
  //
  // The first attempt put a zero-height marker at the end of the list, and it
  // failed in a way worth writing down: after the box scrolls to its bottom the
  // marker sits ON the bottom edge, at window y≈19, which IS inside the window.
  // `block: 'nearest'` then correctly decides nothing needs to move, while the
  // ninety-five-pixel message directly above it is entirely off the top. The
  // thing that must be visible is the message, so the ref goes on the message.
  //
  // THERE ARE TWO SCROLLPORTS, and fixing only one leaves the bug in place.
  // Scrolling the thread box to its bottom is not enough: focusing the composer
  // scrolls the PAGE down to reveal it, and the composer sits below the thread,
  // so the thread is pushed almost entirely above the top of the window.
  // Measured on a 412x780 phone: the page at 1177 of 1355, and the thread box
  // occupying -257 to 19 — nineteen pixels of a conversation.
  //
  // `scrollIntoView({ block: 'nearest' })` on a marker at the end walks EVERY
  // scrolling ancestor and moves each by the least it can. One call, both
  // scrollports, and nothing moves that did not have to.
  const newestEl = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  // Whether the reader is at the bottom RIGHT NOW, kept in a ref so watching it
  // does not re-render on every scroll event.
  const following = useRef(true);
  const lastId = useRef<string>('');

  const timeline: Entry[] = [
    ...messages.map((m): Entry => ({
      kind: 'message', id: m.id, at: m.created_at, who: m.sender_id, message: m,
    })),
    ...files.map((f): Entry => ({
      kind: 'file', id: f.id, at: f.created_at, who: f.owner_id, file: f,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  // EDITING AND TAKING BACK, one message at a time on purpose. Two open editors
  // in one thread is two drafts to lose, and a confirm sitting open on a
  // message you have scrolled away from is a tap waiting to go wrong.
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState('');
  const [rowBusy, setRowBusy] = useState('');
  const [rowError, setRowError] = useState('');
  // Whether the paperclip has been reached for. Turns the photo guidance on
  // at the moment it is about to matter, rather than leaving it on the screen
  // for every conversation that never sends one.
  const [attaching, setAttaching] = useState(false);

  const beginEdit = (id: string, current: string) => {
    setConfirmingId('');
    setRowError('');
    setEditingId(id);
    setDraft(current);
  };

  const saveEdit = async (id: string) => {
    if (!onEditMessage || rowBusy) return;
    const text = draft.trim();
    if (!text) { setRowError('A message has to say something.'); return; }
    setRowBusy(id); setRowError('');
    try {
      await onEditMessage(id, text);
      setEditingId(''); setDraft('');
    } catch (cause) {
      setRowError(humanError(cause, 'That message could not be changed.'));
    } finally {
      setRowBusy('');
    }
  };

  const takeBack = async (id: string) => {
    if (!onDeleteMessage || rowBusy) return;
    setRowBusy(id); setRowError('');
    try {
      await onDeleteMessage(id);
      setConfirmingId('');
    } catch (cause) {
      setRowError(humanError(cause, 'That message could not be deleted.'));
    } finally {
      setRowBusy('');
    }
  };

  // WHETHER THE LAST THING YOU SAID HAS BEEN READ.
  //
  // `read_at` has been written since the app had messages: opening a thread
  // marks the OTHER person's messages read, all three screens call it, and it
  // arrives in the browser on every load. Nothing has ever drawn it. Until now
  // the only thing it fed was the unread count on the bubble.
  //
  // THE OWNER ASKED FOR THIS DELIBERATELY, after it was raised as a decision
  // rather than built. The concern was real and is recorded here so nobody
  // wonders later: a receipt puts pressure on the person who has not replied,
  // and an Explorer bringing something hard to their Guide is exactly the
  // person least able to carry that. TalkDock's note about presence features is
  // amended, not ignored.
  //
  // WHAT MAKES IT WORTH THE COST HERE. Forty-two of this church's Explorers
  // have not opened the app in a week. A Guide writing into that silence cannot
  // tell "they read it and had nothing to say" from "they have not been back
  // since August" -- and those call for completely different responses, one
  // patient and one a phone call. `Sent` on a message from four days ago is the
  // most useful sentence on the screen.
  //
  // ONE RECEIPT IN THE WHOLE THREAD, UNDER THE LAST THING YOU SENT. Not one per
  // message and not one per run: a column of `Seen` down the side of everything
  // you have ever written is surveillance-shaped, and it is the version of this
  // feature people actually dislike. The question is only ever about the most
  // recent thing you said.
  //
  // YOUR OWN MESSAGES ONLY. A receipt on THEIRS would tell them you had read it,
  // which is the same fact from the other side and is not yours to announce.
  const lastMine = (() => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const e = timeline[i];
      // A taken-back message is not something to report a reading of.
      if (e.kind === 'message' && e.who === myId && !e.message.deleted_at) return e;
    }
    return undefined;
  })();

  const newest = timeline[timeline.length - 1];
  const newestKey = newest ? `${newest.kind}-${newest.id}` : '';
  const newestIsMine = newest?.who === myId;

  // ARRIVING. `useLayoutEffect` and no animation: you should simply BE at the
  // bottom when the thread appears, the way opening any messaging app works.
  // Smoothly scrolling a page you have only just seen is a page that moves
  // under you.
  useLayoutEffect(() => {
    if (landed.current || timeline.length === 0) return;
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    newestEl.current?.scrollIntoView({ block: 'nearest' });
    landed.current = true;
    lastId.current = newestKey;
  }, [timeline.length, newestKey]);

  // SOMETHING NEW. Two different cases, and conflating them is the usual bug:
  //
  //   YOU sent it        -> always follow. You pressed send; the thing you
  //                         wrote must be the thing you see.
  //   SOMEBODY ELSE did  -> follow only if you were already at the bottom.
  //                         Yanking a reader who has scrolled up to find what
  //                         was said last Tuesday is worse than not scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el || !newestKey || newestKey === lastId.current) return;
    lastId.current = newestKey;
    if (newestIsMine || following.current) {
      const behavior = landed.current ? 'smooth' : 'auto';
      el.scrollTo({ top: el.scrollHeight, behavior });
      // The page as well, because the composer taking focus drags it away.
      newestEl.current?.scrollIntoView({ block: 'nearest', behavior });
      following.current = true;
    }
  }, [newestKey, newestIsMine]);

  return (
    <Card className="overflow-hidden" data-live-conversation>
      {/* THE PROMISE STAYS. IT JUST STOPS TAKING A FIFTH OF THE PHONE.
          
          "Only the two people walking together can read this" is a privacy
          promise, and for somebody bringing a hard thing to their Guide it may
          be the most important sentence on the screen. It is not furniture and
          it is not being removed.
          
          But at 109 CSS pixels -- a 40px tile, a heavy heading and a full line
          beneath it -- it was costing more room than the message underneath,
          on every single conversation, forever. It is the same words in one
          line on a phone and the full stack from `sm` up, where the room
          exists. Nothing is hidden at any size: on the narrow layout the
          promise is the visible half and the label sits beside it, because
          between "Private conversation" and what private MEANS, the second is
          the one somebody needs. */}
      <div className="flex items-center gap-2.5 border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-2 sm:gap-3 sm:py-3 sm:px-5">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm shadow-sm sm:h-10 sm:w-10 sm:rounded-2xl sm:text-lg">💬</span>
        <div className="min-w-0">
          {/* One line on a phone: "Private — only the two of you can read this."
              Two lines from sm up, where there is room for the heading to be a
              heading. The h2 is present at every size for the document outline
              and for a screen reader, which never sees the layout. */}
          <h2 className="text-[13px] font-extrabold leading-tight text-navy sm:text-base">
            Private conversation
          </h2>
          <p className="text-[11px] leading-tight text-gray-600 sm:text-sm">
            Only the two people walking together can read this.
          </p>
        </div>
      </div>
      {/* NO HEIGHT HERE ANY MORE, ON PURPOSE. This carried `55dvh` and two
          minimums, and every one of those numbers was a guess at how much room
          the rest of the screen had already taken. They guessed wrong on a
          two-row header and put the composer below the glass.

          globals.css now sizes the card against the real chrome and lets this
          be the one part that gives up space, so the thread is whatever is
          left after the heading, the note and the composer have theirs. */}
      <div
        ref={box}
        data-live-thread
        onScroll={() => {
          const el = box.current;
          if (!el) return;
          // A little slack. Sub-pixel heights and a rubber-band bounce on iOS
          // both mean scrollTop rarely lands exactly on the maximum.
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        aria-live="polite"
        aria-label="Conversation messages"
        /* NO `space-y` ANY MORE. Spacing is now per-run -- wide where a new
           person starts talking, tight inside one run -- and a uniform gap
           from the parent would add itself to both and flatten the very
           difference that makes a run read as one piece of talking. */
        className="overflow-y-auto overscroll-contain bg-white p-4 sm:p-5"
      >
        {timeline.length === 0 && <p className="py-16 text-center text-gray-400">Start with a welcome.</p>}
        {timeline.map((entry, index) => {
          const mine = entry.who === myId;
          const isNewest = index === timeline.length - 1;

          // ONE RUN OF TALKING, NOT FIVE SEPARATE CARDS.
          //
          // Every bubble used to carry the speaker's name and its own
          // timestamp, so somebody sending four short lines in a row produced
          // four names and four times -- eight labels around about a dozen
          // words. On a phone that is most of the screen, and it reads as a
          // list of records rather than as somebody talking.
          //
          // A run is the same person, on the same day, within five minutes of
          // the last thing they said. The NAME goes on the first of a run,
          // because that is where it answers a question, and the TIME goes on
          // the last, because that is when the run ended. In between there is
          // just what was said.
          //
          // THE TIME GAP MATTERS AS WELL AS THE SPEAKER. Two messages from one
          // person three hours apart are not one breath, and grouping them
          // would hide that the second was an afterthought hours later.
          const prev = index > 0 ? timeline[index - 1] : undefined;
          const next = index < timeline.length - 1 ? timeline[index + 1] : undefined;

          const newDay = !prev || dayKey(prev.at) !== dayKey(entry.at);

          const runsOn = (a: typeof entry | undefined, b: typeof entry) =>
            !!a && a.who === b.who
              && dayKey(a.at) === dayKey(b.at)
              && Math.abs(new Date(b.at).getTime() - new Date(a.at).getTime()) < SAME_BREATH_MS;

          // A new day always starts a new run, however close the clock times
          // are -- 23:59 and 00:02 are four minutes apart and not one breath.
          const startsRun = newDay || !runsOn(prev, entry);
          const endsRun = !next || !runsOn(entry, next);

          return (
            <div key={`${entry.kind}-${entry.id}`}>
              {/* WHERE ONE DAY BECOMES THE NEXT. Sticky, so scrolling back
                  through a long thread always says which day you are reading
                  rather than making you find the last divider you passed. */}
              {newDay && (
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-black/5 backdrop-blur">
                    {dayLabel(entry.at)}
                  </span>
                </div>
              )}
            {/* ONLY THE NEWEST ROW ANIMATES, and that restriction is the whole
                design. This thread reloads WHOLESALE -- `useKeepUp` re-runs the
                loader rather than patching one row -- so animating every entry
                would make the entire conversation flicker every time anybody
                anywhere changed anything. One row moving says "this just
                arrived"; forty rows moving says nothing and looks broken. */}
            <div
              ref={isNewest ? newestEl : undefined}
              className={`flex ${mine ? 'justify-end' : 'justify-start'} ${
                startsRun ? 'mt-2.5' : 'mt-0.5'} ${isNewest ? 'talk-message-in' : ''}`}
            >
              {/* TWO TINTS, NOT ONE DARK AND ONE LIGHT.
                  A solid navy bubble for your own messages read as a wall of
                  ink on a phone, and it forced every label inside it to be
                  white — so a timestamp was white-on-navy in one bubble and
                  grey-on-white in the next, and an attachment had to carry two
                  colour schemes. Two soft tints let one set of dark text serve
                  both, which is why the `mine ? text-white` branches below are
                  gone rather than adjusted. */}
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                  mine
                    ? 'rounded-br-md bg-[#E4F0F5] text-slate-800'
                    : 'rounded-bl-md bg-[#FCEEDF] text-slate-800'
                }`}
              >
                {/* WHO IS SPEAKING, above the words. On a thread of short
                    replies the side a bubble sits on is a weak signal, and it
                    is no signal at all to somebody reading a screenshot of it
                    or a screen reader reading down the list. */}
                {startsRun && (mine ? myName : theirName) && (
                  <p className={`mb-0.5 text-[13px] font-bold ${mine ? 'text-[#1F7A8C]' : 'text-[#C2762B]'}`}>
                    {(mine ? myName : theirName)?.split(' ')[0]}
                  </p>
                )}
                {entry.kind === 'message' ? (
                  entry.message.deleted_at ? (
                    /* THE NOTE THAT REPLACES THE WORDS, and the reason a
                       deletion is not simply a missing bubble. A message that
                       vanished without trace reads as one that was never sent,
                       which is worse than either the message or its removal:
                       the other person remembers reading something and the
                       thread says they imagined it. The words themselves are
                       gone from here -- they were moved into a table no browser
                       can read -- so there is nothing to reveal by saying this
                       plainly. */
                    <p className="whitespace-pre-wrap break-words text-[15px] italic leading-relaxed text-slate-500">
                      {mine
                        ? 'You deleted a message'
                        : `${theirName?.split(' ')[0] ?? 'They'} deleted a message`}
                    </p>
                  ) : editingId === entry.message.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={3}
                        maxLength={4000}
                        autoFocus
                        aria-label="Change your message"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[15px] leading-relaxed text-slate-800"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="gold"
                          onClick={() => void saveEdit(entry.message.id)}
                          disabled={rowBusy === entry.message.id}
                        >
                          {rowBusy === entry.message.id ? 'Saving' : 'Save the change'}
                        </Button>
                        <Button variant="ghost" onClick={() => { setEditingId(''); setDraft(''); }}>
                          Leave it as it was
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                        <Linked text={entry.message.body} />
                      </p>
                      {/* SAID OUT LOUD, because the other person read the first
                          version. A quiet edit is a way to make somebody doubt
                          what they remember. */}
                      {entry.message.edited_at && (
                        <p className="mt-0.5 text-[11px] italic text-slate-500">edited</p>
                      )}
                      {mine && (onEditMessage || onDeleteMessage) && (
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          {onEditMessage && (
                            <button
                              type="button"
                              onClick={() => beginEdit(entry.message.id, entry.message.body)}
                              className="text-[12px] font-semibold text-slate-500 underline underline-offset-2"
                            >
                              Edit
                            </button>
                          )}
                          {/* A HAND-ROLLED RED CONTROL RATHER THAN A BOXED ONE.
                              tests/destructive-is-discouraged.mjs allows that
                              and it is the right shape here: a 44px danger
                              button under every one of your own messages would
                              shout down the conversation it sits in. Red text,
                              small, and it asks before it acts. */}
                          {onDeleteMessage && confirmingId !== entry.message.id && (
                            <button
                              type="button"
                              onClick={() => { setConfirmingId(entry.message.id); setRowError(''); }}
                              className="text-[12px] font-semibold text-red-700 underline underline-offset-2"
                            >
                              Delete
                            </button>
                          )}
                          {onDeleteMessage && confirmingId === entry.message.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => void takeBack(entry.message.id)}
                                disabled={rowBusy === entry.message.id}
                                className="text-[12px] font-semibold text-red-700 underline underline-offset-2"
                              >
                                {rowBusy === entry.message.id ? 'Deleting' : 'Yes, delete it'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId('')}
                                className="text-[12px] font-semibold text-slate-500 underline underline-offset-2"
                              >
                                Keep it
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {rowError && (editingId === entry.message.id || confirmingId === entry.message.id) && (
                        <p className="mt-1 text-[12px] text-red-800">{rowError}</p>
                      )}
                    </>
                  )
                ) : (
                  <LiveAttachment
                    file={entry.file}
                    mine={mine}
                    onRemove={mine && onRemoveFile ? () => onRemoveFile(entry.file) : undefined}
                  />
                )}
                {/* The time sits under the words on the reading edge, small and
                    quiet. It carries the date only when the message is not from
                    today: a thread of this morning's replies stamped with the
                    date four times reads as four separate days. */}
                {/* THE CLOCK TIME ONLY, AND ONLY WHERE A RUN ENDS.
                    The date used to ride along on any message that was not from
                    today, because nothing else on the screen said which day it
                    was. The divider above says it now, once per day, so
                    repeating it on every bubble is the noise the divider was
                    added to remove. */}
                {endsRun && (
                  <p className="mt-0.5 text-right text-[11px] text-slate-400">
                    {new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}

                {/* SEEN, OR NOT YET. Only under the last thing you sent -- see
                    the note beside `lastMine` for why one receipt and not one
                    per message.

                    `Sent` IS THE HALF THAT DOES THE WORK. A receipt that only
                    ever says "Seen" tells you nothing on the days it matters;
                    the useful sentence is the one on a message from four days
                    ago that still says Sent. */}
                {entry.kind === 'message' && lastMine
                  && entry.id === lastMine.id && entry.kind === lastMine.kind && (
                  <p className="mt-0.5 text-right text-[11px] font-semibold text-slate-400">
                    {entry.message.read_at
                      ? `Seen ${sameDay(entry.message.read_at)
                          ? new Date(entry.message.read_at)
                              .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                          : dayLabel(entry.message.read_at).toLowerCase()}`
                      : 'Sent'}
                  </p>
                )}
              </div>
            </div>
            </div>
          );
        })}
      </div>

      {attachError && (
        <p className="border-t border-black/5 bg-red-50 px-4 py-2 text-sm text-red-800">{attachError}</p>
      )}

      {/* SAID WHERE THE DECISION IS MADE -- WHICH IS WHAT THIS ALWAYS CLAIMED
          AND DID NOT DO.
          
          A photo from a phone camera is two to four megabytes and this app runs
          on a free plan that pays for every one of them twice, to store and
          again on every view. It is made smaller before it is sent, which
          nobody can see on a phone screen, and the location tag the camera
          wrote into it is dropped along the way. People should be told both,
          and told here rather than in a policy nobody opens. All of that is
          still true.
          
          What was wrong is WHEN. Three lines of guidance about photographs sat
          above the composer permanently, whether or not anybody was sending a
          photograph. Measured against the phone screenshot that reported this:
          the privacy banner and this note took about 204 CSS pixels between
          them while the one message on screen took 91. The explanations were
          more than twice the size of the conversation.
          
          So it opens when somebody reaches for the paperclip, and stays open
          while a file is staged. The location promise is the part that has to
          be read BEFORE choosing a photo rather than after, which is why it
          appears on the tap and not on the upload. */}
      {onAttach && (attaching || files.length > 0) && (
        <p className="border-t border-black/5 bg-slate-50 px-4 py-2 text-xs leading-relaxed text-gray-500">
          Photos are made smaller before they are sent, and the location your camera
          recorded is removed. Up to 10 MB each. For anything larger, share a link.
        </p>
      )}

      <form
        onSubmit={send}
        data-live-composer
        className="flex items-end gap-1.5 border-t border-navy/10 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:gap-2 sm:p-4 sm:pb-4"
      >
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              // A PICKER THAT CAN CHOOSE A FILE THE SERVER WILL REFUSE IS A
              // TRAP. Without this, a Guide could pick a study sheet and only
              // find out it was not allowed after the upload came back with
              // Supabase's own wording about mime types. See
              // lib/live/attachments.ts — this list and the bucket's are the
              // same list and must stay that way.
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                // NOT reset here: WebKit invalidates a File once its input is
                // cleared, and onAttach reads the bytes asynchronously. On
                // Safari and iOS that aborted the upload. The reset moved to
                // the click handler below. See components/Chat.tsx for the
                // whole story; this is the live twin of the same bug.
                const chosen = event.target.files?.[0];
                if (chosen) onAttach(chosen);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-3"
              disabled={busy}
              onClick={() => {
                // Clear on the way IN, so the same file can be chosen twice
                // without the File being invalidated after it is chosen.
                if (fileRef.current) fileRef.current.value = '';
                setAttaching(true);
                fileRef.current?.click();
              }}
              aria-label="Attach a file"
            >
              📎
            </Button>
          </>
        )}
        <MessageBox
          value={body}
          onChange={setBody}
          className="rounded-3xl bg-slate-100 ring-1 ring-navy/5"
        />
        {/* A ROUND SEND, AND STILL A 56px TARGET.
            The word "Send" beside a pill-shaped box made the composer three
            different shapes in a row on a phone. A circle reads as the send
            control in every messaging app people already use, and it gives the
            glyph the whole button rather than a label competing with it.
            `tap` keeps the height floor, `aspect-square` makes it a circle
            rather than an oval, and the aria-label is what a screen reader and
            every test that asks for a button called Send actually read — the
            arrow is decorative and is hidden from both. */}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          aria-label="Send"
          className="tap flex aspect-square shrink-0 self-end items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#1F7A8C' }}
        >
          <span aria-hidden className="text-lg leading-none">➤</span>
        </button>
      </form>
    </Card>
  );
}

/**
 * One attachment, opened through a signed URL.
 *
 * The bucket is private, so these have no permanent address — the URL is minted
 * per view and expires in an hour. That is also why it is fetched on the click
 * rather than for every file in the thread at once: a long conversation would
 * otherwise mint dozens of signed URLs nobody opens.
 */

// A picture looks like a picture, and a voice note plays.
//
// THE REPORT, with a screenshot of a photograph rendered as a blue underlined
// filename: "I should see the image or video in my chat, not the document
// file please."
//
// Everything sent into a conversation was drawn the same way, as a paperclip
// and a filename, whether it was a study sheet or a photograph of somebody's
// grandchild. The name a phone gives a photo is `20260901_110714.jpg`, which
// tells the person receiving it nothing at all, and opening it meant leaving
// the conversation for a new browser tab.
//
// THREE SHAPES, DECIDED BY THE MIME TYPE THE DATABASE ALREADY STORES:
//
//   image  -> the picture, tappable for the full size
//   audio  -> a player, because a voice note is for listening to
//   other  -> the filename, which is right for a study sheet
//
// LAZY, AND THAT IS NOT A DETAIL. A private file is fetched through a signed
// link that no cache will keep, so every picture drawn is paid for in egress
// every single time the thread is opened. `loading="lazy"` means a photo from
// March is not fetched by somebody reading today's message, and the audio
// player is told to load nothing until it is pressed.
//
// HEIC IS WHY THERE IS A FALLBACK RATHER THAN A CHECK. Apple's format is in the
// upload allowlist and Safari can draw it; Chrome and Firefox cannot. Rather
// than special-case it, anything that fails to load falls back to the filename
// link, which also covers a signed URL that expired while the tab sat open.
//
// VIDEO IS NOT HERE because it cannot be uploaded: it is deliberately absent
// from the bucket's allowlist. One phone video is the storage of a hundred
// photographs and it would be paid for again on every view, which is the whole
// reason this church can run on a free plan. A video is shared as a link.
export function LiveAttachment({
  file,
  mine,
  onRemove,
}: {
  file: live.PairingFile;
  mine: boolean;
  onRemove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [url, setUrl] = useState('');
  // Set when the browser could not draw it: an unsupported format, or a link
  // that expired. Either way the filename still works.
  const [broken, setBroken] = useState(false);

  const isImage = /^image\//i.test(file.mime);
  const isAudio = /^audio\//i.test(file.mime);
  const showsItself = (isImage || isAudio) && !broken;

  // Signed at render time and never stored, for the same reason as everywhere
  // else in this app: a stored signed URL expires and becomes a broken picture
  // with nothing to explain it.
  useEffect(() => {
    if (!showsItself) return;
    let alive = true;
    live.pairingFileUrl(file.path)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setBroken(true); });
    return () => { alive = false; };
  }, [file.path, showsItself]);

  const open = async () => {
    setBusy(true);
    setFailed('');
    try {
      const fresh = await live.pairingFileUrl(file.path);
      window.open(fresh, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed('That file could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const size = file.size >= 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  const caption = (
    <span className="block text-[11px] text-slate-500">
      {busy ? 'Opening…' : size}
      {onRemove && (
        <>
          {' · '}
          <button type="button" onClick={onRemove} className="font-semibold text-red-700 underline underline-offset-2">Remove</button>
        </>
      )}
    </span>
  );

  if (isImage && !broken) {
    return (
      <span className="block">
        <button
          type="button"
          onClick={() => void open()}
          className="block overflow-hidden rounded-xl"
          // The filename is the accessible name. A photo from a phone is called
          // 20260901_110714.jpg, which is nothing to a screen reader, so it is
          // said as what it is instead.
          aria-label={`Open the picture ${file.title}`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.title}
              loading="lazy"
              onError={() => setBroken(true)}
              className="block max-h-72 rounded-xl bg-black/10 object-cover"
            />
          ) : (
            // A box of the right shape while it arrives, rather than the text
            // jumping down the moment the picture lands.
            <span className="block h-32 w-44 animate-pulse rounded-xl bg-black/10" />
          )}
        </button>
        {caption}
        {failed && <span className="block text-[11px] text-red-600">{failed}</span>}
      </span>
    );
  }

  if (isAudio && !broken) {
    return (
      <span className="block">
        <span className="block break-words text-sm font-semibold text-navy">
          🎧 {file.title}
        </span>
        {url ? (
          // preload="none": a voice note is not fetched until somebody presses
          // play, which on a thread with several of them is the difference
          // between one download and all of them.
          <audio
            controls
            preload="none"
            src={url}
            onError={() => setBroken(true)}
            className="mt-1 w-full"
          />
        ) : (
          <span className="block text-[11px] text-slate-500">Loading…</span>
        )}
        {caption}
      </span>
    );
  }

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="block break-words text-left font-semibold underline underline-offset-2 text-navy"
      >
        📎 {file.title}
      </button>
      {caption}
      {failed && <span className="block text-[11px] text-red-600">{failed}</span>}
    </span>
  );
}


/**
 * A Field that picks from a list instead of accepting anything typed.
 *
 * `options` is passed already widened by `optionsFor`, so an answer somebody
 * gave before this was a list is still in it and still selected. Without that,
 * a `select` holding an unknown value renders as its FIRST option and the next
 * save rewrites that person's answer to something they never chose.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  blank = 'Prefer not to say',
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  blank?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      >
        {/* Leaving it unanswered stays possible, and is the default. Every
            question on this screen is optional and this one must not become
            the exception by being a list. */}
        <option value="">{blank}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
        required
      />
    </label>
  );
}


/**
 * Pick a person from a list.
 *
 * ---------------------------------------------------------------------------
 * WHY IT KNOWS WHETHER IT IS STILL LOADING, reported from a Xiaomi phone as
 * "I dont see the names when it comes to pairing".
 *
 * The names were all there. The church has forty-one approved Guides, every
 * one of them named, and the signed-in Executive Director could read all
 * forty-one. What went wrong was WHEN.
 *
 * LiveAdminPage keeps a `loading` flag and used it for the account lists, but
 * the pairing form was drawn regardless. So for as long as the fetch took, both
 * of these were on screen, fully tappable, holding nothing but their own
 * placeholder. And a native `<select>` that is ALREADY OPEN does not take new
 * options: the list arrives, the open sheet keeps showing what it had, and it
 * stays empty until the person closes it and opens it again. Nobody does that.
 * They report that the names are missing.
 *
 * It reads as a phone-specific fault and is not one. It is a race, and a phone
 * on mobile data loses it every time while a laptop on office wifi finishes
 * loading before a hand can reach the control. That is the whole reason it was
 * seen on a Xiaomi and not here.
 *
 * So: disabled until the answer is known, and it says which of the three
 * states it is in rather than looking identical in all of them.
 * ---------------------------------------------------------------------------
 */
export function SelectPerson({
  label,
  value,
  onChange,
  people,
  loading = false,
  noneLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  people: Profile[];
  /** True while the list is still being fetched. */
  loading?: boolean;
  /**
   * What the empty choice says, where "not yet" is a real answer rather than a
   * missing one — the invitation form's Guide picker, where "Pair later" is a
   * decision and "Choose guide" would read as a thing left undone.
   */
  noneLabel?: string;
}) {
  const noun = label.toLowerCase();

  // TYPE A NAME INSTEAD OF SCROLLING FORTY.
  //
  // Reported by Directors, and the numbers are why: this church has 42 Explorers
  // with no Guide and 39 Guides carrying nobody, so both pickers are around
  // forty entries. A native select is right at five and a scroll at forty, and
  // the person a Director is looking for is one they already have a name for —
  // they are not browsing, they are looking somebody up.
  //
  // The same threshold and the same wording as the library shelf and Approved
  // accounts, because somebody who has learned one of these should not have to
  // learn the others.
  const [find, setFind] = useState('');
  const needle = find.trim().toLowerCase();
  const matching = needle
    ? people.filter((p) => (p.full_name ?? '').toLowerCase().includes(needle))
    : people;

  // THE CHOSEN PERSON IS ALWAYS IN THE LIST, even when the words no longer
  // match them. Without this, typing after choosing drops the selected option
  // out of the select, which draws as blank while the value is still set --
  // the control disagreeing with itself, and a Director pairing the wrong
  // person because the box looked empty.
  const chosen = people.find((p) => p.id === value);
  const options = chosen && !matching.some((p) => p.id === chosen.id)
    ? [chosen, ...matching]
    : matching;
  // Three states, three sentences. "Choose guide" over an empty list is the
  // one that cost an evening: it is indistinguishable from a working control.
  const placeholder = loading
    ? `Loading ${noun}s…`
    : people.length === 0
      ? `No ${noun}s to choose yet`
      : `Choose ${noun}`;

  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      {/* The box appears only once the list is long enough to need it. Below
          that it is one more thing to read on the way to a name already on
          screen. */}
      {people.length > 6 && !loading && (
        <input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          type="search"
          inputMode="search"
          placeholder={`Type a ${noun}'s name`}
          aria-label={`Search the ${noun} list by name`}
          className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-teal-600"
        />
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || people.length === 0}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base disabled:opacity-60"
      >
        <option value="">{noneLabel ?? placeholder}</option>
        {options.map((person) => (
          // A NAME, OR SOMETHING. An option whose text is empty draws as a
          // blank row, which is the same "no names" report by another route.
          // Nobody in this church has a blank name today; that is a fact about
          // the data, not a guarantee about it.
          <option key={person.id} value={person.id}>
            {person.full_name?.trim() || 'Somebody with no name set'}
          </option>
        ))}
      </select>
      {/* WHAT THE TYPING DID. A list that silently shortens is one a Director
          cannot trust: they type three letters, see four names, and have no way
          to know whether the fifth person is missing or simply does not match.
          When nothing matches it says so and offers the way back, because an
          empty picker reads as a broken church rather than a narrow search. */}
      {needle && (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span>
            {matching.length} of {people.length} {noun}
            {people.length === 1 ? '' : 's'} match “{find.trim()}”
          </span>
          {matching.length === 0 && (
            <button
              type="button"
              onClick={() => setFind('')}
              className="font-semibold text-teal-700 underline underline-offset-2"
            >
              Show everyone again
            </button>
          )}
        </span>
      )}
    </label>
  );
}


export function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p className={`rounded-xl px-4 py-3 text-sm ring-1 ${tone === 'error' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
      {children}
    </p>
  );
}

// Build-time assertion: this module belongs only to configured deployments.

/**
 * One kind of person, on their own.
 *
 * See docs/DESIGN.md rule 1. Guides and Explorers were a single list a Director
 * scrolled and sorted in their head. They are different jobs and they answer
 * different questions: a Guide has a load and a cap of five, an Explorer has a
 * Guide and a stage. The list that answers neither is the one nobody reads.
 */
