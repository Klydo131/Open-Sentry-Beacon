'use client';

// The whiteboard's own bar and menu, in words.
//
// ---------------------------------------------------------------------------
// REPORTED on 27 October 2026: "if I right click on it there are no option for
// me to delete objects, options to modify, or edit it", and the room has to
// work for "a 5 year old, a professional, and a 75 year old" without them
// having to discover anything. AFFiNE's canvas has neither a menu nor (here) a
// bar for a selected thing; its tools at the bottom are pictures with no words.
//
// SO ONE BAR, ALWAYS IN THE SAME PLACE, at the top of the board:
//   * nothing selected: the tools, each with a word under its picture, and
//     Undo, Redo and Show everything;
//   * something selected: what it is, and what can be done to it, spelled
//     out: Write on it, Colour, Copy, To front, To back, Delete, Done.
// The same choices open on a right-click, and on a long press for a finger.
// A delete says so and offers Undo, for six seconds.
//
// What each choice does is AFFiNE's own (lib/study/board-actions.ts); this
// file only draws it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import type { BoardApi, BoardColour, BoardThing, BoardTool } from '@/lib/study/board-actions';

const TOOLS: Array<{ id: BoardTool; picture: string; word: string; hint: string }> = [
  { id: 'default', picture: '👆', word: 'Select', hint: 'Select and move things' },
  { id: 'brush', picture: '✏️', word: 'Pen', hint: 'Draw with a pen' },
  { id: 'shape', picture: '🟨', word: 'Shape', hint: 'Add a shape' },
  { id: 'affine:note', picture: '📝', word: 'Sticky note', hint: 'Add a sticky note to write on' },
  { id: 'text', picture: '🔤', word: 'Words', hint: 'Write words anywhere on the board' },
  { id: 'connector', picture: '➡️', word: 'Arrow', hint: 'Draw an arrow from one thing to another' },
  { id: 'eraser', picture: '🧽', word: 'Eraser', hint: 'Rub out what you drew' },
];

const COLOURS: BoardColour[] = ['Yellow', 'Orange', 'Red', 'Green', 'Blue', 'Purple'];

/** "1 shape", "3 things". */
function named(things: BoardThing[]): string {
  if (things.length === 1) return `This ${things[0].kind}`;
  const kinds = new Set(things.map((t) => t.kind));
  return kinds.size === 1 ? `These ${things.length} ${[...kinds][0]}s` : `These ${things.length} things`;
}

export function StudyBoardTools({ api, frame }: {
  api: BoardApi | null;
  /** The board's frame: right-clicks and long presses on it open the menu. */
  frame: React.RefObject<HTMLDivElement | null>;
}) {
  const [, setTick] = useState(0);
  const [colours, setColours] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [said, setSaid] = useState<{ text: string; undo: boolean } | null>(null);
  const saidTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Redraw whenever the board says something changed.
  useEffect(() => {
    if (!api) return;
    return api.watch(() => setTick((n) => n + 1));
  }, [api]);

  const say = useCallback((text: string, undo = false) => {
    clearTimeout(saidTimer.current);
    setSaid({ text, undo });
    saidTimer.current = setTimeout(() => setSaid(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(saidTimer.current), []);

  // RIGHT-CLICK, AND A LONG PRESS FOR A FINGER. Only on the canvas itself: the
  // bar and the menu are the room's own and keep their ordinary behaviour.
  useEffect(() => {
    const el = frame.current;
    if (!api || !el) return;
    const ours = (target: EventTarget | null) => target instanceof Element && target.closest('[data-board-own]');
    const open = (clientX: number, clientY: number) => {
      api.pickAt(clientX, clientY);
      const box = el.getBoundingClientRect();
      setColours(false);
      setMenu({ x: Math.min(clientX - box.left, box.width - 236), y: Math.min(clientY - box.top, box.height - 300) });
    };
    const onContext = (e: MouseEvent) => {
      if (ours(e.target)) return;
      e.preventDefault();
      open(e.clientX, e.clientY);
    };
    let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
    const cancel = () => { if (press) clearTimeout(press.timer); press = null; };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || ours(e.target)) return;
      cancel();
      const { clientX: x, clientY: y } = e;
      press = { x, y, timer: setTimeout(() => { press = null; open(x, y); }, 600) };
    };
    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancel();
    };
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', cancel, true);
    el.addEventListener('pointercancel', cancel, true);
    return () => {
      cancel();
      el.removeEventListener('contextmenu', onContext, true);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerup', cancel, true);
      el.removeEventListener('pointercancel', cancel, true);
    };
  }, [api, frame]);

  // The menu closes on Escape, or a press anywhere else.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    const onPress = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-board-menu]'))) setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPress, true);
    };
  }, [menu]);

  if (!api) return null;

  const things = api.selected();
  const editable = things.length === 1 && things[0].canEditWords && !things[0].isPageWriting;
  const colourable = things.some((t) => t.canColour);
  const deletable = things.some((t) => !t.isPageWriting);
  const tool = api.tool();

  const act = (run: () => void) => () => { setMenu(null); setColours(false); run(); };
  const remove = act(() => {
    const gone = api.remove();
    if (gone) say(gone === 1 ? 'Deleted.' : `${gone} things deleted.`, true);
    else say('Your page’s writing stays on the board. To change it, go back to Write.');
  });
  const copy = act(() => { void api.copy().then(() => say('Copied. The copy is selected; drag it where you want it.')); });
  const edit = act(() => { if (!api.editWords()) say('This one has no words to write on.'); });

  const actions = (
    <>
      {things.length === 1 && things[0].canEditWords && (
        <BarButton picture="✍️" word="Write on it" onClick={edit} disabled={!editable} />
      )}
      {colourable && (
        <BarButton picture="🎨" word="Colour" onClick={() => setColours((v) => !v)} pressed={colours} />
      )}
      <BarButton picture="📄" word="Copy" onClick={copy} />
      <BarButton picture="⬆️" word="To front" onClick={act(() => api.order('front'))} />
      <BarButton picture="⬇️" word="To back" onClick={act(() => api.order('back'))} />
      <BarButton picture="🗑️" word="Delete" onClick={remove} danger disabled={!deletable} />
    </>
  );

  const swatches = colours && colourable && (
    <div role="group" aria-label="Colours" className="sr-board-colours" data-board-own>
      {COLOURS.map((name) => (
        <button
          key={name}
          type="button"
          onClick={act(() => api.colour(name))}
          onMouseDown={keepFocus}
          aria-label={name}
          title={name}
          className="sr-board-swatch tap-sm"
          style={{ background: api.swatch(name) }}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="sr-board-bar" data-board-own data-board-tools={things.length ? 'selected' : 'tools'}>
        {things.length ? (
          <div role="toolbar" aria-label="What you can do to what is selected" className="sr-board-row">
            <span className="sr-board-what" data-board-selection>{named(things)}:</span>
            {actions}
            <BarButton picture="✓" word="Done" onClick={act(() => api.clear())} />
          </div>
        ) : (
          <div role="toolbar" aria-label="Whiteboard tools" className="sr-board-row">
            {TOOLS.map((t) => (
              <BarButton
                key={t.id}
                picture={t.picture}
                word={t.word}
                hint={t.hint}
                pressed={tool === t.id}
                onClick={() => api.useTool(t.id)}
              />
            ))}
            <span className="sr-board-gap" aria-hidden />
            <BarButton picture="↩️" word="Undo" onClick={() => api.undo()} disabled={!api.canUndo()} />
            <BarButton picture="↪️" word="Redo" onClick={() => api.redo()} disabled={!api.canRedo()} />
            <BarButton picture="🔍" word="Show all" hint="Fit everything on the board into view" onClick={() => api.showEverything()} />
          </div>
        )}
        {swatches}
      </div>

      {menu && (
        <div
          role="menu"
          aria-label={things.length ? `${named(things)}` : 'The whiteboard'}
          className="sr-board-menu"
          style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          data-board-own
          data-board-menu
        >
          {things.length ? (
            <>
              <p className="sr-board-menu-title">{named(things)}</p>
              {things.length === 1 && things[0].canEditWords && (
                <MenuItem picture="✍️" word="Write on it" onClick={edit} disabled={!editable} />
              )}
              {colourable && <MenuItem picture="🎨" word="Colour" onClick={() => setColours(true)} />}
              {swatches}
              <MenuItem picture="📄" word="Copy" onClick={copy} />
              <MenuItem picture="⬆️" word="Bring to front" onClick={act(() => api.order('front'))} />
              <MenuItem picture="⬇️" word="Send to back" onClick={act(() => api.order('back'))} />
              <MenuItem picture="🗑️" word="Delete" onClick={remove} danger disabled={!deletable} />
            </>
          ) : (
            <>
              <p className="sr-board-menu-title">The whiteboard</p>
              <MenuItem picture="↩️" word="Undo" onClick={act(() => api.undo())} disabled={!api.canUndo()} />
              <MenuItem picture="↪️" word="Redo" onClick={act(() => api.redo())} disabled={!api.canRedo()} />
              <MenuItem picture="☑️" word="Select everything" onClick={act(() => api.selectAll())} />
              <MenuItem picture="🔍" word="Show everything" onClick={act(() => api.showEverything())} />
            </>
          )}
        </div>
      )}

      {said && (
        <p role="status" className="sr-board-said" data-board-own data-board-said>
          <span>{said.text}</span>
          {said.undo && (
            <button type="button" className="tap-sm sr-board-undo" onClick={() => { api.undo(); setSaid(null); }}>
              Undo
            </button>
          )}
        </p>
      )}
    </>
  );
}

/**
 * A press on the room's own buttons leaves the keyboard where it was. Without
 * this, choosing a tool here moved focus off the canvas and AFFiNE's own keys
 * (S for a shape, Delete, Ctrl+Z) stopped answering until the board was
 * clicked again; found by tests/e2e/the-affine-features-actually-work.js.
 * Tab and Enter still reach and press every button.
 */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function BarButton({ picture, word, hint, onClick, pressed, disabled, danger }: {
  picture: string; word: string; hint?: string; onClick: () => void;
  pressed?: boolean; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={keepFocus}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={hint && hint !== word ? `${word}: ${hint}` : word}
      title={hint ?? word}
      className={`sr-board-btn tap-sm ${danger ? 'sr-board-btn--danger' : ''}`}
    >
      <span aria-hidden className="sr-board-pic">{picture}</span>
      <span className="sr-board-word">{word}</span>
    </button>
  );
}

function MenuItem({ picture, word, onClick, disabled, danger }: {
  picture: string; word: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseDown={keepFocus}
      disabled={disabled}
      className={`sr-board-item tap-sm ${danger ? 'sr-board-btn--danger' : ''}`}
    >
      <span aria-hidden className="sr-board-pic">{picture}</span>
      {word}
    </button>
  );
}

export default StudyBoardTools;
