'use client';

// The way to insert something when there is no `/` key to press.
//
// ---------------------------------------------------------------------------
// REPORTED, WITH A PHOTOGRAPH OF AN ANDROID PHONE: the `/` typed into the page
// and sat there as a character. No menu, nothing.
//
// WHY, AND IT IS NOT A BUG IN BLOCKSUITE. Their slash menu opens on a `keydown`
// for the `/` key. A phone's on-screen keyboard does not send those: GBoard and
// its cousins send composition and `beforeinput` events, and the character
// arrives without any keydown the menu could recognise. AFFiNE knows this --
// their own slash menu declines to register on a mobile scope at all, and their
// answer is a bar above the keyboard instead.
//
// SO WHY NOT USE THEIRS. Because it only exists while a virtual keyboard is
// open, and there is no virtual keyboard in a headless browser: it cannot be
// tested here, at all, by anybody. This project has shipped four things that
// could not be tested here and the owner found every one of them. A bar this
// app draws itself is one that a browser walk can open, press and assert on.
//
// IT IS ON EVERY SCREEN, not only small ones. On a desktop `/` still works and
// this sits alongside it; on a phone it is the only way in. A control that
// appears on some devices and not others is a second thing to get wrong.
// ---------------------------------------------------------------------------

import {
  CalloutGlyph, CheckboxGlyph, DividerGlyph, ListGlyph, NumberedListGlyph, QuoteGlyph, TableGlyph,
} from '@/components/Glyph';

export type InsertKind =
  | 'h1' | 'h2' | 'h3'
  | 'bulleted' | 'numbered' | 'todo'
  | 'quote' | 'divider' | 'table' | 'callout';

// WORDS, NOT `H1`. The first three were `H1 H2 H3`, which is a typesetter's
// shorthand, in an app whose base font is 18px because many of the people
// using it are older. And each visible word is INSIDE the button's spoken name
// ("List" in "Bulleted list", "Line" in "A line across the page"), so somebody
// using voice control can say what they see and have it work.
const BUTTONS: Array<{ kind: InsertKind; label: string; hint: string; Icon?: typeof ListGlyph }> = [
  { kind: 'h1', label: 'Big heading', hint: 'Big heading' },
  { kind: 'h2', label: 'Heading', hint: 'Heading' },
  { kind: 'h3', label: 'Small heading', hint: 'Small heading' },
  { kind: 'bulleted', label: 'List', hint: 'Bulleted list', Icon: ListGlyph },
  { kind: 'numbered', label: 'Numbered', hint: 'Numbered list', Icon: NumberedListGlyph },
  { kind: 'todo', label: 'To-do', hint: 'To-do with a box to tick', Icon: CheckboxGlyph },
  { kind: 'quote', label: 'Quote', hint: 'Quote a verse or a line', Icon: QuoteGlyph },
  { kind: 'divider', label: 'Line', hint: 'A line across the page', Icon: DividerGlyph },
  { kind: 'table', label: 'Table', hint: 'Table', Icon: TableGlyph },
  { kind: 'callout', label: 'Note', hint: 'Note, to set something apart', Icon: CalloutGlyph },
];

export function StudyInsertBar({ onInsert }: { onInsert: (kind: InsertKind) => void }) {
  return (
    <div className="sr-formatbar mt-4">
      <div
        role="toolbar"
        aria-label="Add to this page"
        className="thin-scroll flex items-center gap-2 overflow-x-auto"
      >
        {BUTTONS.map((button) => (
          <button
            key={button.kind}
            type="button"
            // NOT onClick. A click on a phone lands after the editor has lost
            // focus, which loses the caret and with it the place the new block
            // belongs. Pointer-down fires first and keeps the selection.
            onPointerDown={(e) => { e.preventDefault(); onInsert(button.kind); }}
            title={button.hint}
            aria-label={button.hint}
            className={`sr-tool tap-sm ${button.kind === 'h1' ? 'text-[16px]' : ''}`}
          >
            {button.Icon ? <button.Icon size={17} /> : null}
            {button.label}
          </button>
        ))}
        {/* The keyboard way in, said once, where a computer can use it. A
            phone has no key that opens the menu, so a phone is not told about
            one. */}
        <span className="ml-1 hidden shrink-0 items-center gap-1.5 whitespace-nowrap pr-1 text-[14px] text-[color:var(--sr-ink-2)] lg:inline-flex">
          or press <span className="sr-kbd">/</span> while writing
        </span>
      </div>
    </div>
  );
}

export default StudyInsertBar;
