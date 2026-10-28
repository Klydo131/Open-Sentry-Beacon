'use client';

// What the room adds to a whiteboard: Undo and Redo, and a menu on a
// right-click or a long press.
//
// ---------------------------------------------------------------------------
// 28 OCTOBER 2026, from a photograph of the bar this file used to draw across
// the top of the board, circled: "This is not the solution for replacing the
// '3 dots'... I want the 3 dots to be back once I click an object." And: "I
// really want the study room to be familiar with note taking pad like Notion,
// Obsidian, Notes."
//
// So the board works the way those apps and every whiteboard people know do
// (Miro, FigJam, Apple Freeform, Obsidian Canvas): the tools along the bottom,
// and a small bar floating over whatever is selected, with ⋯ for everything
// else. Both are AFFiNE's own (lib/study/board-actions.ts says why they were
// missing before). What is left for the room is in this file:
//
//   * UNDO AND REDO, two buttons in the board's corner, as Freeform and tldraw
//     have them, because a phone or a tablet has no Ctrl+Z;
//   * A RIGHT-CLICK, OR A LONG PRESS WITH A FINGER, on a thing selects it and
//     opens AFFiNE's own ⋯ menu for it: one set of choices, wherever you ask;
//   * on EMPTY BOARD, a short menu for the board: Undo, Redo, Select
//     everything, Show everything.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

import type { BoardApi } from '@/lib/study/board-actions';

/** AFFiNE's own ⋯ button for what is selected, if its bar is showing one. */
function moreButton(frame: HTMLElement): (HTMLElement & { show?: (force?: boolean) => void }) | null {
  const bar = frame.querySelector('affine-toolbar-widget')?.shadowRoot?.querySelector('editor-toolbar');
  return (bar?.querySelector('editor-menu-button[aria-label="More menu"]') as HTMLElement | null) ?? null;
}

export function StudyBoardTools({ api, frame }: {
  api: BoardApi | null;
  /** The board's frame: right-clicks and long presses on it open the menu. */
  frame: React.RefObject<HTMLDivElement | null>;
}) {
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Redraw when the history changes, so Undo and Redo say whether they can.
  useEffect(() => {
    if (!api) return;
    return api.watch(() => setTick((n) => n + 1));
  }, [api]);

  // The card with the page's own writing is locked on the board
  // (lib/study/board-actions.ts says why).
  useEffect(() => { api?.protectPageWriting(); }, [api]);

  // RIGHT-CLICK, AND A LONG PRESS FOR A FINGER. Only on the canvas itself: the
  // buttons and menus over it keep their ordinary behaviour.
  useEffect(() => {
    const el = frame.current;
    if (!api || !el) return;
    const ours = (target: EventTarget | null) => target instanceof Element && (
      target.closest('[data-board-own]')
      || target.closest('affine-toolbar-widget, edgeless-toolbar-widget, affine-edgeless-zoom-toolbar-widget')
    );
    const open = (clientX: number, clientY: number) => {
      setMenu(null);
      if (api.pickAt(clientX, clientY)) {
        // AFFiNE draws its bar for the new selection on the next frames; then
        // its ⋯ opens as if pressed. A locked thing has no ⋯, only Unlock.
        let tries = 0;
        const press = () => {
          const more = moreButton(el);
          if (more?.show) more.show(true);
          else if (tries++ < 10) requestAnimationFrame(press);
        };
        requestAnimationFrame(press);
        return;
      }
      const box = el.getBoundingClientRect();
      setMenu({ x: Math.min(clientX - box.left, box.width - 236), y: Math.min(clientY - box.top, box.height - 220) });
    };
    const onContext = (e: MouseEvent) => {
      if (ours(e.target)) return;
      e.preventDefault();
      open(e.clientX, e.clientY);
    };
    // A FINGER HELD STILL for 600ms, then lifted, opens the menu. It opens on
    // the lift, not at 600ms: opened while the finger was still down, the lift
    // reached the board as a tap and AFFiNE closed its menu at once (a long
    // press showed nothing, found 28 October 2026 by the whiteboard walk).
    let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number; held: boolean } | null = null;
    const cancel = () => { if (press) clearTimeout(press.timer); press = null; };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || ours(e.target)) return;
      cancel();
      const held = { x: e.clientX, y: e.clientY, held: false, timer: setTimeout(() => { held.held = true; }, 600) };
      press = held;
    };
    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancel();
    };
    const onUp = () => {
      const was = press;
      cancel();
      if (was?.held) requestAnimationFrame(() => open(was.x, was.y));
    };
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', cancel, true);
    return () => {
      cancel();
      el.removeEventListener('contextmenu', onContext, true);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerup', onUp, true);
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

  const act = (run: () => void) => () => { setMenu(null); run(); };

  return (
    <>
      <div role="toolbar" aria-label="Undo and redo" className="sr-board-history" data-board-own>
        <IconButton label="Undo" keys="Ctrl+Z, or Cmd+Z on a Mac" onClick={() => api.undo()} disabled={!api.canUndo()}>
          <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </IconButton>
        <IconButton label="Redo" keys="Ctrl+Shift+Z, or Cmd+Shift+Z on a Mac" onClick={() => api.redo()} disabled={!api.canRedo()}>
          <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </IconButton>
      </div>

      {menu && (
        <div
          role="menu"
          aria-label="The whiteboard"
          className="sr-board-menu"
          style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          data-board-own
          data-board-menu
        >
          <MenuItem word="Undo" onClick={act(() => api.undo())} disabled={!api.canUndo()} />
          <MenuItem word="Redo" onClick={act(() => api.redo())} disabled={!api.canRedo()} />
          <MenuItem word="Select everything" onClick={act(() => api.selectAll())} />
          <MenuItem word="Show everything" onClick={act(() => api.showEverything())} />
        </div>
      )}
    </>
  );
}

/**
 * A press on the room's own buttons leaves the keyboard where it was. Without
 * this, pressing Undo here moved focus off the canvas and AFFiNE's own keys
 * (S for a shape, Delete, Ctrl+Z) stopped answering until the board was
 * clicked again; found by tests/e2e/the-affine-features-actually-work.js.
 * Tab and Enter still reach and press every button.
 */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function IconButton({ label, keys, onClick, disabled, children }: {
  label: string; keys: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={keepFocus}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${keys})`}
      className="sr-board-icon tap-sm"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function MenuItem({ word, onClick, disabled }: { word: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseDown={keepFocus}
      disabled={disabled}
      className="sr-board-item tap-sm"
    >
      {word}
    </button>
  );
}

export default StudyBoardTools;
