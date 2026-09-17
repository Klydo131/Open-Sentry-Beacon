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

export type InsertKind =
  | 'h1' | 'h2' | 'h3'
  | 'bulleted' | 'numbered' | 'todo'
  | 'quote' | 'divider' | 'table' | 'callout';

const BUTTONS: Array<{ kind: InsertKind; label: string; hint: string }> = [
  { kind: 'h1', label: 'H1', hint: 'Big heading' },
  { kind: 'h2', label: 'H2', hint: 'Heading' },
  { kind: 'h3', label: 'H3', hint: 'Small heading' },
  { kind: 'bulleted', label: '• List', hint: 'Bulleted list' },
  { kind: 'numbered', label: '1. List', hint: 'Numbered list' },
  { kind: 'todo', label: '☐ To-do', hint: 'To-do with a box to tick' },
  { kind: 'quote', label: '❝ Quote', hint: 'Quote a verse or a line' },
  { kind: 'divider', label: 'Line', hint: 'A line across the page' },
  { kind: 'table', label: '▦ Table', hint: 'Table' },
  { kind: 'callout', label: '◆ Note', hint: 'Set something apart' },
];

export function StudyInsertBar({ onInsert }: { onInsert: (kind: InsertKind) => void }) {
  return (
    <div className="mb-2 -mx-1">
      <p className="px-1 pb-1 text-xs text-gray-500">
        Add to this page. On a computer you can also press{' '}
        <span className="rounded bg-gray-100 px-1 font-mono">/</span> while writing.
      </p>
      <div
        role="toolbar"
        aria-label="Add to this page"
        className="thin-scroll flex gap-2 overflow-x-auto px-1 pb-1"
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
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/10 hover:bg-navy/5"
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default StudyInsertBar;
