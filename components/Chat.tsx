'use client';

import { useEffect, useRef } from 'react';
import { useDemo } from '@/lib/demo/store';
import { emitQuest } from '@/lib/quest';
import type { Message, PairingMedia } from '@/lib/types';
import { Attachment } from './Attachment';
import { Button } from './ui';
import { PaperclipGlyph } from './Glyph';
import { MessageBox } from '@/components/MessageBox';
import { useDraft, clearDraft } from '@/lib/drafts';
import { Linked } from '@/components/Linked';

/**
 * One thing in the conversation, whichever kind it is.
 *
 * A THREAD IS A SEQUENCE OF EVENTS, NOT TWO LISTS. This screen used to render
 * every message and then every attachment, in two passes — so a file always
 * appeared at the very bottom no matter when it was sent. A Guide who attached
 * a study sheet and then received a reply saw the reply above their own
 * attachment, and the timestamps underneath said the opposite. On a thread with
 * any history the file ends up nowhere near the message it belongs to.
 *
 * Sorting cannot fix that while the two are separate arrays, so they are not
 * separate any more: both become entries with a time, and the time is the only
 * thing that decides the order.
 */
type Entry =
  | { kind: 'message'; id: string; at: string; who: string; message: Message }
  | { kind: 'media'; id: string; at: string; who: string; media: PairingMedia };

// Private 1:1 thread scoped to a single pairing. In the demo, messages live in
// the store; in production this is the `messages` table with Realtime and RLS
// that only lets the two participants read or write.
//
// IT LIVES IN THE BUBBLE NOW (components/DemoTalkDock.tsx), filling it, as the
// live conversation fills the live one. The Report link that sat beside Attach
// moved up into the bubble's header with the live one: the part of a chat
// furthest from Send, in words, always there (components/talk/Dock.tsx).
export function Chat({ pairingId }: { pairingId: string }) {
  const { db, userId, sendMessage, markMessagesRead, attachMedia, removeMedia, mediaFor } = useDemo();
  // Unsent text survives leaving the room, keyed to this pairing so a draft
  // for one person can never appear in the box open to another.
  const [text, setText] = useDraft(pairingId);
  const newestEl = useRef<HTMLDivElement>(null);
  /** Whether the reader is at the bottom now. A ref, so scrolling is free. */
  const following = useRef(true);
  const lastId = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // mediaFor applies the rule; this screen never filters db.pairing_media
  // itself. In a real deployment the equivalent filter is a database policy,
  // and a screen that did its own filtering would be the thing that quietly
  // disagreed with it.
  const media = mediaFor(pairingId);

  const messages = db.messages.filter((m) => m.pairing_id === pairingId);

  // ISO 8601 sorts correctly as plain text down to the millisecond, which is
  // the resolution both of these are stamped at. The id is a tie-break so that
  // two things created in the same millisecond keep ONE order instead of
  // swapping places between renders — a thread that reshuffles itself while
  // you are reading it is worse than one in the wrong order.
  const timeline: Entry[] = [
    ...messages.map((m): Entry => ({
      kind: 'message', id: m.id, at: m.created_at, who: m.sender_id, message: m,
    })),
    ...media.map((m): Entry => ({
      kind: 'media', id: m.id, at: m.created_at, who: m.owner_id, media: m,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const newest = timeline[timeline.length - 1];
  const newestKey = newest ? `${newest.kind}-${newest.id}` : '';
  const newestIsMine = newest?.who === userId;

  // FOLLOW THE NEWEST MESSAGE, and get two things right that this did not.
  //
  // 1. THE REF GOES ON THE MESSAGE, NOT ON A MARKER AFTER IT. `bottomRef` was
  //    a zero-height <div> at the end of the list. Once the thread is scrolled
  //    to its bottom that marker sits ON the bottom edge and is itself visible,
  //    so nothing is judged to need moving while the message above it is off
  //    the screen entirely.
  //
  // 2. `block: 'nearest'`, NOT THE DEFAULT. With no block option scrollIntoView
  //    uses 'start', which puts the marker at the TOP of every scrolling
  //    ancestor -- pushing the whole conversation up and out of view. Measured
  //    on a 412x780 phone: the message just sent at -131 to -36, above the top
  //    of the window. 'nearest' moves each scrollport by the least it can.
  //
  // 3. A READER IS NOT YANKED. Following on every length change interrupted
  //    somebody who had scrolled up to find what was said last week. Your own
  //    message always follows; somebody else's only if you were already at the
  //    bottom.
  useEffect(() => {
    if (!newestKey || newestKey === lastId.current) return;
    const first = lastId.current === '';
    lastId.current = newestKey;
    if (first || newestIsMine || following.current) {
      newestEl.current?.scrollIntoView({
        block: 'nearest',
        behavior: first ? 'auto' : 'smooth',
      });
      following.current = true;
    }
  }, [newestKey, newestIsMine]);

  // Reading the thread is what marks it read — on open, and again whenever a
  // message lands while it is on screen. markMessagesRead is a no-op when
  // there is nothing unread, so this does not loop.
  useEffect(() => {
    markMessagesRead(pairingId);
  }, [pairingId, messages.length, markMessagesRead]);

  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* THE PROMISE, IN ONE LINE, as the live conversation carries it. */}
      <p className="border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-2 text-[13px] leading-tight text-gray-600">
        <span className="font-extrabold text-navy">Private conversation.</span>{' '}
        Only the two people walking together can read this.
      </p>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        // ONE SCROLLPORT, AND IT IS THE MESSAGES, as in the live bubble:
        // the promise above and the composer below keep their height.
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        {timeline.length === 0 && (
          <p className="mt-8 text-center text-gray-400">
            No messages yet. Say hello.
          </p>
        )}
        {timeline.map((entry, index) => {
          const mine = entry.who === userId;
          const isNewest = index === timeline.length - 1;
          return (
            <div
              key={`${entry.kind}-${entry.id}`}
              // Read by tests/e2e/chat-order.js to check the rendered order
              // against the order things were actually sent. A plain div, so
              // the attribute reaches the DOM — Button would have dropped it.
              data-chat-entry={entry.kind}
              ref={isNewest ? newestEl : undefined}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${isNewest ? 'talk-message-in' : ''}`}
            >
              {entry.kind === 'message' ? (
                <div
                  // TWO TINTS RATHER THAN ONE SOLID NAVY. A filled navy bubble
                  // for your own messages is a wall of ink on a phone, and it
                  // splits every label in the thread into two colour schemes.
                  // Two soft tints let one set of dark text serve both sides,
                  // and they match the live conversation — the demo is what
                  // gets shown to a room, so the two must not diverge.
                  className={`max-w-[80%] text-lg ${
                    mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'
                  } px-4 py-2.5`}
                  style={
                    mine
                      ? { backgroundColor: '#E4F0F5', color: '#1f2937' }
                      : { backgroundColor: '#FCEEDF', color: '#1f2937' }
                  }
                >
                  <Linked text={entry.message.body} />
                </div>
              ) : (
                <Attachment
                  media={entry.media}
                  onRemove={mine ? () => removeMedia(entry.media.id) : undefined}
                />
              )}
              {/* One footer for both kinds, so a file and a message that were
                  sent together read as the same person speaking. */}
              <span className="mt-1 px-1 text-xs text-gray-400">
                {/* The speaker in their own colour, matching the bubble they
                    just spoke from, so a glance down the thread reads as two
                    people rather than one column of grey captions. */}
                <span
                  className="font-bold"
                  style={{ color: mine ? '#1F7A8C' : '#C2762B' }}
                >
                  {mine ? 'You' : nameOf(entry.who)}
                </span>{' '}
                ·{' '}
                {new Date(entry.at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        })}
      </div>

      {/*
        DELIBERATELY OUTSIDE THE FORM BELOW, and it cost two broken test runs to
        learn why.

        [data-quest="chat-send"] is the tutorial's anchor, and other suites reach
        into it positionally: the message box is
        `[data-quest="chat-send"] input`.first() and Send is
        `[data-quest="chat-send"] button`.first(). Putting the hidden file input
        inside captured the first selector, so typing timed out. Moving only the
        input and leaving the Attach button inside then captured the second, so
        the suite clicked Attach instead of Send and the message was never sent —
        a silent failure, because nothing on screen looked wrong.

        So the whole attach control lives out here. That region contains exactly
        one input and one button, and it should stay that way.
      */}
      {/* ONE ROW, AS IN THE LIVE CHAT: a paperclip beside the box, where the
          sample had a whole line for "Attach a file" above it. */}
      <div className="flex items-end gap-2 border-t border-black/5 p-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            // NOT reset here. WebKit invalidates a File once its input is
            // cleared, and the bytes are read asynchronously afterwards, so on
            // Safari and iOS the write aborted: the row was added optimistically,
            // the write failed, the row was taken back out, and the attachment
            // appeared and then vanished. Chromium keeps the File alive, which
            // is why this passed everywhere it was tested. The reset that lets
            // the same file be chosen twice now happens when the picker opens.
            const file = e.target.files?.[0];
            if (file) attachMedia(pairingId, file);
          }}
        />
        {/* A plain button, so the words can be there for a screen reader
            (and for the suites that ask for "Attach a file" by name) while the
            eye sees the paperclip. Button takes a fixed prop list and would
            drop them -- see the comment in ui.tsx. */}
        <button
          type="button"
          className="tap grid shrink-0 place-items-center rounded-xl bg-white px-3 text-gray-600 ring-1 ring-black/10 hover:bg-gray-50"
          onClick={() => {
            // Clear on the way IN, so picking the same file twice still fires a
            // change event, without touching the File after it is chosen.
            if (fileRef.current) fileRef.current.value = '';
            fileRef.current?.click();
          }}
        >
          <PaperclipGlyph size={22} />
          <span className="sr-only">Attach a file</span>
        </button>

        <form
          // The tutorial says "type in the highlighted box and send", so the
          // highlight has to cover the box as well as the button — it used to
          // ring only Send, which pointed at the wrong half of the instruction.
          data-quest="chat-send"
          // items-end so Send stays level with the bottom of a box that grows.
          className="flex min-w-0 flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            sendMessage(pairingId, text);
            emitQuest('beacon:message');
            // Now, not on the debounce — see the note in the live conversation.
            clearDraft(pairingId);
            setText('');
          }}
        >
          <MessageBox
            value={text}
            onChange={setText}
            placeholder="Type a message…"
            className="text-lg"
          />
          <span className="shrink-0 self-end">
            <Button type="submit" disabled={!text.trim()} className="px-4 sm:px-5">
              Send
            </Button>
          </span>
        </form>
      </div>
    </div>
  );
}
