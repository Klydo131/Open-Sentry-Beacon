'use client';

import { useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import type { Message, Profile } from '@/lib/types';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';
import { ChatView, type ChatEntry } from '@/components/talk/ChatView';
import type { Reaction, ReactionTarget } from '@/lib/talk/reactions';
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

/**
 * The live conversation: the database's rows, handed to the one chat both
 * halves draw (components/talk/ChatView.tsx).
 *
 * EVERYTHING YOU SEE IS IN ChatView. This only turns `messages`,
 * `pairing_media` and `message_reactions` rows into what it draws, and passes
 * the writes through. The reasons behind how a thread looks -- runs, day
 * dividers, the one read receipt, the notes that can be put away -- moved with
 * the drawing on 1 October 2026, when the sample app started using it too.
 *
 * Files are opened through a signed URL made when they are drawn or pressed:
 * the bucket is private, so they have no permanent address.
 */
export function Conversation({
  emptyLine,
  messages,
  files,
  reactions = [],
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
  onReact,
}: {
  emptyLine?: string;
  messages: Message[];
  files: live.PairingFile[];
  reactions?: Reaction[];
  myId: string;
  myName?: string;
  theirName?: string;
  body: string;
  setBody: (value: string) => void;
  /** Send `text`, as a reply to `replyTo` when there is one. Throws to keep the draft. */
  send: (text: string, replyTo: string | null) => Promise<void>;
  busy: boolean;
  /**
   * Change or take back your OWN message, through edit_message() and
   * delete_message(): definer functions that check you are the author and keep
   * what was said in a table no browser can read.
   */
  onEditMessage?: (id: string, body: string) => Promise<void>;
  onDeleteMessage?: (id: string) => Promise<void>;
  onAttach?: (file: File) => void;
  onRemoveFile?: (file: live.PairingFile) => void;
  attachError?: string;
  /** React through react_to(): one per person per thing, from the six. */
  onReact?: (target: ReactionTarget, emoji: string | null) => Promise<void>;
}) {
  const entries: ChatEntry[] = [
    ...messages.map((m): ChatEntry => ({
      kind: 'message',
      id: m.id,
      at: m.created_at,
      who: m.sender_id,
      body: m.body,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
      readAt: m.read_at,
      replyTo: m.reply_to,
    })),
    ...files.map((f): ChatEntry => ({
      kind: 'file',
      id: f.id,
      at: f.created_at,
      who: f.owner_id,
      title: f.title,
      mime: f.mime,
      size: f.size,
      // A fresh signed URL each time: one minted an hour ago may have expired
      // while the conversation sat open.
      load: () => live.pairingFileUrl(f.path),
    })),
  ];

  return (
    <ChatView
      entries={entries}
      me={myId}
      myName={myName}
      theirName={theirName}
      emptyLine={emptyLine}
      reactions={reactions}
      draft={body}
      setDraft={setBody}
      busy={busy}
      onSend={send}
      onEdit={onEditMessage}
      onDelete={onDeleteMessage}
      onReact={onReact}
      onAttach={onAttach}
      // A PICKER THAT CAN CHOOSE A FILE THE SERVER WILL REFUSE IS A TRAP.
      // lib/live/attachments.ts is the bucket's own list.
      attachAccept={ATTACHMENT_ACCEPT}
      onRemoveFile={onRemoveFile
        ? (id) => { const file = files.find((f) => f.id === id); if (file) onRemoveFile(file); }
        : undefined}
      voice
      attachError={attachError}
    />
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
  emptyLabel,
  emptyNote,
  reserveSearchRow = false,
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
  /**
   * What to say when the list is empty because everybody was FILTERED OUT,
   * rather than because nobody exists.
   *
   * REPORTED AS A BUG, AND IT WAS ONE. The Explorer picker offers only people
   * with no Guide, so once every Explorer in a church is paired the list is
   * correctly empty and the control said "No Explorers to choose yet". "Yet"
   * means none exist. A Director looking at a roster of fourteen Explorers and
   * a picker saying there are none concludes the screen is broken, and the
   * default placeholder gave them no way to tell a full church from a failed
   * load. Same class of fault as the one three comments up: a control that is
   * indistinguishable from a broken one.
   */
  emptyLabel?: string;
  /** A sentence under the control saying what to do about it. */
  emptyNote?: string;
  /**
   * Keep the search box's space even when this picker does not need one.
   *
   * REPORTED AS "the UI is glitching ... some can't even pair". Two of these
   * side by side in a grid, and the search box appears only once a list passes
   * six names. The live church has twelve Guides and -- because everybody is
   * already paired -- no Explorers to choose, so the Guide column grew a search
   * box and the Explorer column did not. The two dropdowns then sat on
   * DIFFERENT LINES: the Explorer picker level with the Guide's search field,
   * and the Guide's actual dropdown below it. A Director reading that sees a
   * form that has come apart, and the one they want is not where it should be.
   *
   * WHY A RESERVED ROW AND NOT "ALWAYS SHOW THE BOX". A search field over an
   * empty list is a control that cannot do anything, and over three names it is
   * one more thing to read on the way to a name already on screen -- which is
   * why the threshold exists. The space is what has to match, not the box.
   */
  reserveSearchRow?: boolean;
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
      ? emptyLabel ?? `No ${noun}s to choose yet`
      : `Choose ${noun}`;

  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      {/* The box appears only once the list is long enough to need it. Below
          that it is one more thing to read on the way to a name already on
          screen. */}
      {people.length > 6 && !loading ? (
        <input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          type="search"
          inputMode="search"
          placeholder={`Type a ${noun}'s name`}
          aria-label={`Search the ${noun} list by name`}
          className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-teal-600"
        />
      ) : reserveSearchRow ? (
        // THE SAME HEIGHT, AND NOTHING IN IT. `tap` is the 56px tap target
        // every control on this screen stands on, so the row it leaves behind
        // is exactly the row the box would have taken.
        <div aria-hidden className="tap mt-1 w-full" />
      ) : null}
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
      {/* WHY THERE IS NOBODY TO CHOOSE, WHEN THERE IS NOBODY TO CHOOSE. A
          greyed-out control with no explanation beside it is the same report
          every time: "it is not working". It is usually working. */}
      {!loading && people.length === 0 && emptyNote && (
        <span className="mt-1 block text-xs text-gray-500">{emptyNote}</span>
      )}
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
