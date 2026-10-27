'use client';

// The way to add something to a page, without a `/` key and without hunting.
//
// ---------------------------------------------------------------------------
// REPORTED, WITH A PHOTOGRAPH OF AN ANDROID PHONE: the `/` typed into the page
// and sat there as a character. A phone's on-screen keyboard sends composition
// events, not the keydown BlockSuite's slash menu waits for, so this bar is
// the way in on a phone and sits beside `/` on a computer. A bar this app draws
// itself is one a browser walk can open, press and assert on.
//
// THEN, ON 27 OCTOBER 2026, the other half: "If I go to page, I will get
// bombarded with so many options and it's not UI friendly for beginners ...
// Can we make it simplified but has more tools ... that at least a 5 year old,
// a professional, and a 75 year old can understand." The ten buttons in a row
// that scrolled sideways (with arrows to find the rest) became:
//
//   * FOUR, ALWAYS THE SAME, each a picture and a word: Heading, List, To-do,
//     Quote. What a first page of notes is made of, on one line on any phone;
//   * and MORE, which opens every other thing as a card that shows what it
//     makes ("1. 2. 3. in order", "Rows and columns"), so nothing has to be
//     guessed from its name. Two new ones came with it: Today's date, and a
//     Picture from the phone or computer.
//
// Simple and Advanced show the same bar: the difference between them is the
// room's places and the filing, not how a page is written.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react';

import {
  CalloutGlyph, CheckboxGlyph, DividerGlyph, ListGlyph, NumberedListGlyph, QuoteGlyph, TableGlyph,
} from '@/components/Glyph';

export type InsertKind =
  | 'h1' | 'h2' | 'h3'
  | 'bulleted' | 'numbered' | 'todo'
  | 'quote' | 'divider' | 'table' | 'callout'
  | 'date';

type Card = { kind: InsertKind | 'picture'; label: string; hint: string; example: string; Icon?: typeof ListGlyph; picture?: string };

// WORDS, NOT `H1`, and each visible word is INSIDE the button's spoken name, so
// somebody using voice control can say what they see and have it work.
const FOUR: Card[] = [
  { kind: 'h2', label: 'Heading', hint: 'Heading', example: 'A title for a part', picture: 'H' },
  { kind: 'bulleted', label: 'List', hint: 'Bulleted list', example: '• One thing on each line', Icon: ListGlyph },
  { kind: 'todo', label: 'To-do', hint: 'To-do with a box to tick', example: '☐ Something to do', Icon: CheckboxGlyph },
  { kind: 'quote', label: 'Quote', hint: 'Quote a verse or a line', example: '“A verse or a line”', Icon: QuoteGlyph },
];

const MORE: Card[] = [
  { kind: 'h1', label: 'Big heading', hint: 'Big heading', example: 'The title of the whole page', picture: 'H' },
  { kind: 'h2', label: 'Heading', hint: 'Heading', example: 'A title for a part', picture: 'H' },
  { kind: 'h3', label: 'Small heading', hint: 'Small heading', example: 'A smaller title', picture: 'h' },
  { kind: 'bulleted', label: 'List', hint: 'Bulleted list', example: '• One thing on each line', Icon: ListGlyph },
  { kind: 'numbered', label: 'Numbered list', hint: 'Numbered list', example: '1. 2. 3. In order', Icon: NumberedListGlyph },
  { kind: 'todo', label: 'To-do', hint: 'To-do with a box to tick', example: '☐ Something to do', Icon: CheckboxGlyph },
  { kind: 'quote', label: 'Quote', hint: 'Quote a verse or a line', example: '“A verse or a line”', Icon: QuoteGlyph },
  { kind: 'callout', label: 'Note', hint: 'Note, to set something apart', example: 'Set something apart in a box', Icon: CalloutGlyph },
  { kind: 'divider', label: 'Line', hint: 'A line across the page', example: 'Between one day and the next', Icon: DividerGlyph },
  { kind: 'table', label: 'Table', hint: 'Table', example: 'Rows and columns', Icon: TableGlyph },
  { kind: 'date', label: 'Today’s date', hint: 'Today’s date', example: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), picture: '📅' },
  { kind: 'picture', label: 'Picture', hint: 'A picture from this phone or computer', example: 'A photo, a drawing, a page', picture: '🖼️' },
];

export function StudyInsertBar({ onInsert, onPicture, simple = false }: {
  onInsert: (kind: InsertKind) => void;
  /** Pictures chosen with the Picture card, for the editor to put on the page. */
  onPicture?: (files: File[]) => void;
  /** Simple or Advanced, from components/study/StudyModeSwitch.tsx. */
  simple?: boolean;
}) {
  const [more, setMore] = useState(false);
  const pictures = useRef<HTMLInputElement>(null);

  const press = (card: Card) => (e: React.PointerEvent) => {
    // NOT onClick. A click on a phone lands after the editor has lost focus,
    // which loses the caret and with it the place the new block belongs.
    // Pointer-down fires first and keeps the selection.
    e.preventDefault();
    setMore(false);
    if (card.kind === 'picture') pictures.current?.click();
    else onInsert(card.kind);
  };

  return (
    <div className="sr-formatbar mt-4" data-simple={simple ? 'true' : 'false'}>
      <div role="toolbar" aria-label="Add to this page" className="sr-insert-row">
        {FOUR.map((card) => (
          <button
            key={card.kind}
            type="button"
            onPointerDown={press(card)}
            // A keyboard has no pointer: Enter and Space press it too.
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInsert(card.kind as InsertKind); } }}
            title={card.hint}
            aria-label={card.hint}
            className="sr-tool tap-sm"
          >
            {card.Icon ? <card.Icon size={17} /> : <span aria-hidden className="sr-tool-letter">{card.picture}</span>}
            {card.label}
          </button>
        ))}
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); setMore((v) => !v); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMore((v) => !v); } }}
          aria-expanded={more}
          aria-controls="sr-insert-more"
          aria-label="More things to add"
          title="More things to add"
          className="sr-tool sr-tool--more tap-sm"
          data-insert-more
        >
          <span aria-hidden className="sr-tool-letter">＋</span>
          More
        </button>
        {/* The keyboard way in, said once, where a computer can use it. */}
        <span className="ml-1 hidden shrink-0 items-center gap-1.5 whitespace-nowrap pr-1 text-[14px] text-[color:var(--sr-ink-2)] lg:inline-flex">
          or press <span className="sr-kbd">/</span> while writing
        </span>
      </div>

      {more && (
        <div id="sr-insert-more" role="group" aria-label="Everything you can add" className="sr-insert-more" data-insert-panel>
          {MORE.map((card) => (
            <button
              key={card.label}
              type="button"
              onPointerDown={press(card)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                setMore(false);
                if (card.kind === 'picture') pictures.current?.click();
                else onInsert(card.kind);
              }}
              aria-label={card.hint}
              className="sr-insert-card"
            >
              <span aria-hidden className="sr-insert-card-pic">
                {card.Icon ? <card.Icon size={20} /> : card.picture}
              </span>
              <span className="sr-insert-card-name">{card.label}</span>
              <span aria-hidden className="sr-insert-card-example">{card.example}</span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={pictures}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared after reading, never before: WebKit empties the list when
          // the input's value is reset.
          if (files.length) onPicture?.(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default StudyInsertBar;
