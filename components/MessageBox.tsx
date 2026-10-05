'use client';

// The box you write a message in.
//
// WHAT WAS WRONG. It was an `<input>`. A single line, 4000 characters allowed
// into it, and no way to see more than about forty of them at once. Somebody
// writing a real message — the kind people actually send their Guide, several
// sentences about something difficult — could see only the fragment under the
// cursor, and the text scrolled sideways as they typed. It was reported as "I
// can't see the whole message, and I can't scroll up or down", and the second
// half of that sentence is the diagnosis: there is no up or down in a one-line
// input. Nothing was broken, and nothing could have been scrolled.
//
// WHAT IT IS NOW. A textarea that grows as you write, up to a cap, and scrolls
// inside itself after that. It starts exactly one line tall, so a short reply
// looks and feels the way it always did.
//
// WHY THE CAP. Left to grow freely, a long message pushes the Send button off
// the bottom of a phone — replacing "I can't see what I wrote" with "I can't
// send it", which is worse. Growing to at most 40% of the window keeps both the
// text and the button on screen.
//
// THE ENTER KEY, which is the part worth being careful about:
//
//   On a phone or tablet, Return always makes a new line. The Send button is
//   right there and visible, and a keyboard whose Return key fires off a
//   half-written message is how people send half a thought to their pastor.
//
//   On a desktop, Enter sends and Shift+Enter makes a new line, which is what
//   every chat application has trained people to expect.
//
// The two are told apart by `pointer: coarse` — a touch device — and not by
// screen width. A small window on a laptop is still a laptop, and a tablet with
// a keyboard case still has a touchscreen.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Emoji, suggest, tokenAt, replaceToken } from '@/lib/live/emoji';

/** Grow to at most this share of the window, so Send is never pushed off. */
const MAX_SHARE = 0.4;

export function MessageBox({
  value,
  onChange,
  onSend,
  placeholder = 'Write a message',
  maxLength = 4000,
  ariaLabel = 'Message',
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Called when Enter should send. The form's own submit still works too. */
  onSend?: () => void;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [touch, setTouch] = useState(false);

  // EMOJI, SUGGESTED WHILE YOU TYPE. See lib/live/emoji.ts for why the trigger
  // is a colon rather than ordinary words -- briefly: this is the box somebody
  // tells their Guide about a bereavement in, and an app that offers a cheerful
  // picture beside those words unasked has made a joke of them.
  const [picks, setPicks] = useState<Emoji[]>([]);
  const [chosen, setChosen] = useState(0);
  // Where the `:token` starts, so choosing can replace it rather than append.
  const [tokenStart, setTokenStart] = useState(-1);

  const closeSuggestions = () => { setPicks([]); setChosen(0); setTokenStart(-1); };

  /** Re-read the token under the caret after any change to text or position. */
  const rethink = (text: string, caret: number) => {
    const found = tokenAt(text, caret);
    if (!found) { closeSuggestions(); return; }
    const next = suggest(found.query);
    setPicks(next);
    setChosen(0);
    setTokenStart(next.length ? found.start : -1);
  };

  /** Put `emoji` in place of the token being typed, and put the caret after it. */
  const take = (emoji: Emoji) => {
    const el = ref.current;
    if (!el || tokenStart < 0) return;
    const { text, caret } = replaceToken(value, tokenStart, el.selectionStart, emoji.char);
    onChange(text);
    closeSuggestions();
    // AFTER REACT HAS WRITTEN THE NEW VALUE, or the caret is placed into the
    // old string and jumps to the end on the next render. The box is a
    // controlled component, so the DOM value only catches up on the next paint.
    requestAnimationFrame(() => {
      const box = ref.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(caret, caret);
    });
  };

  useEffect(() => {
    // In an effect, not at render: matchMedia does not exist on the server, and
    // reading it during render would make the first paint differ from the
    // markup Next.js sent.
    setTouch(
      typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches,
    );
  }, []);

  // Re-measure on every change. `height: auto` first, or scrollHeight only ever
  // reports the height it already has and the box can grow but never shrink.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // EMPTY IS ONE LINE, AND NEEDS NO MEASURING. Reading scrollHeight makes the
    // browser lay out the whole page there and then, and the box is empty at
    // exactly the moment that costs most: when a conversation has just opened
    // and every message in it is new on the page (4 October 2026).
    if (!value) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = 'auto';
    const cap = Math.max(120, Math.round(window.innerHeight * MAX_SHARE));
    const next = Math.min(el.scrollHeight, cap);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, [value]);

  const open = picks.length > 0;

  return (
    // `relative` so the suggestions can hang ABOVE the box without being part of
    // the composer's flex row -- in the row they would push the send button
    // sideways every time somebody typed a colon.
    <div className="relative min-w-0 flex-1">
      {open && (
        <ul
          // A LISTBOX, NAMED AND NUMBERED, because this is a combobox and a
          // screen reader has no other way to know a menu appeared under
          // somebody's fingers. The textarea points at the active option below.
          id="emoji-suggestions"
          role="listbox"
          aria-label="Emoji suggestions"
          className="absolute bottom-full left-0 z-20 mb-1.5 flex max-w-full gap-1 overflow-x-auto rounded-2xl solid-panel bg-white p-1.5 shadow-lg ring-1 ring-black/10"
        >
          {picks.map((e, i) => (
            <li key={e.char} role="none">
              <button
                type="button"
                id={`emoji-option-${i}`}
                role="option"
                aria-selected={i === chosen}
                // ON POINTER-DOWN, NOT ON CLICK. A click fires after the
                // textarea has already lost focus, and losing focus is what
                // closes this list -- so the button would be gone before its own
                // click landed. preventDefault keeps the caret where it is.
                onMouseDown={(event) => { event.preventDefault(); take(e); }}
                className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-lg ${
                  i === chosen ? 'bg-slate-200' : 'bg-transparent'
                }`}
              >
                <span aria-hidden>{e.char}</span>
                <span className="text-[11px] font-semibold text-slate-500">{e.names[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          rethink(event.target.value, event.target.selectionStart);
        }}
        // MOVING THE CARET COUNTS TOO. Clicking into the middle of a line, or
        // walking there with the arrow keys, changes which token is under it --
        // and without this the list keeps showing matches for a word somebody
        // has left behind.
        onSelect={(event) => {
          const el = event.currentTarget;
          rethink(el.value, el.selectionStart);
        }}
        onBlur={closeSuggestions}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls="emoji-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={open ? `emoji-option-${chosen}` : undefined}
        // `resize-none` because the box sizes itself; a drag handle that fights
        // the measurement above just looks broken.
        className={`tap w-full resize-none rounded-xl bg-gray-100 px-4 py-4 text-base leading-snug outline-none focus:ring-2 focus:ring-gold ${className}`}
        onKeyDown={(event) => {
          // THE SUGGESTIONS GET THE KEYS FIRST, AND ENTER IS THE WHOLE REASON
          // THIS BLOCK IS ABOVE THE SEND BRANCH RATHER THAN BELOW IT.
          //
          // On a desktop Enter SENDS. With a list open, somebody reaching for
          // an emoji would instead fire off the half-written message they were
          // still composing -- to their Guide, about something that mattered.
          // So while the list is open Enter takes the highlighted emoji and
          // nothing leaves the box.
          if (open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
              event.preventDefault();
              setChosen((i) => (i + 1) % picks.length);
              return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
              event.preventDefault();
              setChosen((i) => (i - 1 + picks.length) % picks.length);
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              take(picks[chosen]);
              return;
            }
            if (event.key === 'Escape') {
              // A WAY OUT THAT KEEPS WHAT WAS TYPED. Somebody writing "be there
              // at 7:00 :) " wants the characters, not a menu, and must be able
              // to say so without deleting anything.
              event.preventDefault();
              closeSuggestions();
              return;
            }
          }

          if (event.key !== 'Enter') return;
          if (touch) return;              // phones and tablets: Return = new line
          if (event.shiftKey) return;     // desktop: Shift+Enter = new line
          event.preventDefault();
          if (!value.trim()) return;
          if (onSend) { onSend(); return; }
          // Submit the form this box sits in, so the page's own onSubmit runs and
          // there is only one send path. requestSubmit() also honours validation;
          // the click fallback is for engines too old to have it (Safari < 16).
          const form = event.currentTarget.form;
          if (!form) return;
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
        }}
      />
    </div>
  );
}
