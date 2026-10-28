'use client';

// When a whiteboard's tools show, and what the room adds to them.
//
// ---------------------------------------------------------------------------
// A CLEAN BOARD (28 October 2026): "we want the board to have less tools
// setup, tools will only appear when you double tap an object or the board
// (or right click in desktop). I want the board to be clean as possible." And
// the tools themselves are AFFiNE's own, so nothing here has to be learned
// twice ("You can just copy the Affine ... when it comes to tools").
//
// So the board opens with nothing over it, and:
//
//   * DOUBLE-TAP OR DOUBLE-CLICK EMPTY BOARD: AFFiNE's dock of tools along the
//     bottom, with the room's Undo, Redo and Hide tools beside it (a phone has
//     no Ctrl+Z). The same again, Escape, or Hide tools puts them away. AFFiNE
//     itself makes a text box on a double-click there; the room takes that
//     gesture for the tools instead, and text is the T in the dock.
//   * DOUBLE-TAP OR DOUBLE-CLICK A THING: AFFiNE's bar over it (colour, Lock,
//     and ⋮ for the rest). A single tap only selects: handles to move and
//     resize it, and no bar. AFFiNE would start typing on a double-click, and
//     that closes its bar, so the room keeps that gesture for the bar; writing
//     is still AFFiNE's own way in: tap a selected sticky note or text again,
//     or Add text on a shape's bar.
//   * RIGHT-CLICK, OR A LONG PRESS WITH A FINGER, on a thing: its bar with ⋮
//     already open. On empty board: the dock, and a short menu for the board
//     (Undo, Redo, Select everything, Show everything).
//
// What shows is said on the board's frame (data-board-dock, data-board-bar)
// and study-shell.css hides the rest. Until somebody has opened the tools once
// on this device, one quiet line says how.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import type { BoardApi } from '@/lib/study/board-actions';

/** AFFiNE's own ⋯ button for what is selected, if its bar is showing one. */
function moreButton(frame: HTMLElement): (HTMLElement & { show?: (force?: boolean) => void }) | null {
  const bar = frame.querySelector('affine-toolbar-widget')?.shadowRoot?.querySelector('editor-toolbar');
  return (bar?.querySelector('editor-menu-button[aria-label="More menu"]') as HTMLElement | null) ?? null;
}

/** Two taps this close in time and place are a double-tap. */
const DOUBLE_MS = 400;
const DOUBLE_PX = 24;
/** Remembered on this device once the tools have been opened. */
const SEEN_KEY = 'beacon.board-tools-seen';

export function StudyBoardTools({ api, frame }: {
  api: BoardApi | null;
  /** The board's frame: taps, right-clicks and long presses on it are read here. */
  frame: React.RefObject<HTMLDivElement | null>;
}) {
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dock, setDock] = useState(false);
  // The ids the bar was opened for. Another selection puts the bar away.
  const [barFor, setBarFor] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === '1'); } catch { setSeen(false); }
  }, []);
  const opened = useCallback(() => {
    setSeen(true);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private window */ }
  }, []);
  const showDock = useCallback((on: boolean) => {
    setDock(on);
    if (on) opened();
  }, [opened]);

  // Redraw when the history or the selection changes: Undo and Redo say
  // whether they can, and a bar opened for one thing closes when another, or
  // nothing, is selected.
  const barRef = useRef(barFor);
  barRef.current = barFor;
  useEffect(() => {
    if (!api) return;
    return api.watch(() => {
      setTick((n) => n + 1);
      const wanted = barRef.current;
      if (wanted) {
        const now = api.selectedIds();
        if (!now.length || !now.some((id) => wanted.includes(id))) setBarFor(null);
      }
    });
  }, [api]);

  // The card with the page's own writing is locked on the board
  // (lib/study/board-actions.ts says why).
  useEffect(() => { api?.protectPageWriting(); }, [api]);

  // WHAT SHOWS, said on the frame for study-shell.css; cleared on the way out
  // so the page view never inherits a board's open tools.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (dock) el.dataset.boardDock = 'open'; else delete el.dataset.boardDock;
    if (barFor) el.dataset.boardBar = 'open'; else delete el.dataset.boardBar;
  }, [dock, barFor, frame]);
  useEffect(() => () => {
    const el = frame.current;
    if (el) { delete el.dataset.boardDock; delete el.dataset.boardBar; }
  }, [frame]);

  // TAPS, RIGHT-CLICKS AND LONG PRESSES, read before AFFiNE sees them. Only on
  // the canvas itself: the buttons and menus over it keep their own behaviour.
  useEffect(() => {
    const el = frame.current;
    if (!api || !el) return;
    const ours = (target: EventTarget | null) => target instanceof Element && (
      target.closest('[data-board-own]')
      || target.closest('affine-toolbar-widget, edgeless-toolbar-widget, affine-edgeless-zoom-toolbar-widget')
    );

    /** A thing's bar, with its ⋯ menu already open. */
    const openMore = () => {
      setBarFor(api.selectedIds());
      opened();
      // AFFiNE draws its bar for the new selection on the next frames; then
      // its ⋯ opens as if pressed. A locked thing has no ⋯, only Unlock.
      let tries = 0;
      const press = () => {
        const more = moreButton(el);
        if (more?.show) more.show(true);
        else if (tries++ < 10) requestAnimationFrame(press);
      };
      requestAnimationFrame(press);
    };
    const openMenu = (clientX: number, clientY: number) => {
      setMenu(null);
      if (api.pickAt(clientX, clientY)) { openMore(); return; }
      showDock(true);
      const box = el.getBoundingClientRect();
      setMenu({ x: Math.min(clientX - box.left, box.width - 236), y: Math.min(clientY - box.top, box.height - 220) });
    };

    const onContext = (e: MouseEvent) => {
      if (ours(e.target)) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY);
    };

    // THE LAST TAP, to tell a double-tap from two taps. A tap is a press and a
    // lift without moving: a drag that selects or draws is not one.
    let last: { t: number; x: number; y: number } | null = null;
    let down: { t: number; x: number; y: number; moved: boolean } | null = null;
    // The second press of a double-tap, and its lift, never reach AFFiNE: to
    // AFFiNE that pair is "make a text box here" on empty board, and "start
    // typing" on a thing, which closes the very bar that was asked for.
    let swallowing = false;
    let swallowUntil = 0;

    // A FINGER HELD STILL for 600ms, then lifted, opens the menu. It opens on
    // the lift, not at 600ms: opened while the finger was still down, the lift
    // reached the board as a tap and AFFiNE closed its menu at once.
    let hold: { timer: ReturnType<typeof setTimeout>; held: boolean } | null = null;
    const cancelHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };

    const isSecond = (e: PointerEvent) => !!last
      && e.timeStamp - last.t < DOUBLE_MS
      && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_PX;

    const onDown = (e: PointerEvent) => {
      if (ours(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isSecond(e) && api.selecting()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        swallowing = true;
        swallowUntil = e.timeStamp + 600;
        last = null;
        down = null;
        cancelHold();
        setMenu(null);
        if (api.hitAt(e.clientX, e.clientY)) {
          // The first tap selected it, as any tap does.
          const ids = api.selectedIds();
          if (ids.length) { setBarFor(ids); opened(); }
        } else {
          setDock((on) => { if (!on) opened(); return !on; });
        }
        return;
      }
      down = { t: e.timeStamp, x: e.clientX, y: e.clientY, moved: false };
      cancelHold();
      if (e.pointerType !== 'mouse') {
        const h = { held: false, timer: setTimeout(() => { h.held = true; }, 600) };
        hold = h;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) {
        down.moved = true;
        cancelHold();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (swallowing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        swallowing = false;
        return;
      }
      const was = down;
      const held = hold?.held;
      down = null;
      cancelHold();
      if (!was || was.moved) { last = null; return; }
      if (held) {
        last = null;
        requestAnimationFrame(() => openMenu(was.x, was.y));
        return;
      }
      last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    };
    // The browser's own click and dblclick for a swallowed double-tap.
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp < swallowUntil && !ours(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onCancel = () => { cancelHold(); down = null; swallowing = false; };

    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onCancel, true);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dblclick', onClick, true);
    return () => {
      cancelHold();
      el.removeEventListener('contextmenu', onContext, true);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerup', onUp, true);
      el.removeEventListener('pointercancel', onCancel, true);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dblclick', onClick, true);
    };
  }, [api, frame, opened, showDock]);

  // ESCAPE puts the menu away first, then the tools, once nothing is being
  // drawn or selected: before that, Escape is AFFiNE's, to finish a tool or
  // let go of a selection. Read before AFFiNE answers the key (the capture
  // phase), or the Escape that finishes a shape would find the board already
  // finished and put the tools away with it.
  useEffect(() => {
    if (!api) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) { setMenu(null); return; }
      if (dock && api.selecting() && api.selectedIds().length === 0) setDock(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [api, menu, dock]);

  // The menu closes on a press anywhere else.
  useEffect(() => {
    if (!menu) return;
    const onPress = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-board-menu]'))) setMenu(null);
    };
    window.addEventListener('pointerdown', onPress, true);
    return () => window.removeEventListener('pointerdown', onPress, true);
  }, [menu]);

  if (!api) return null;

  const act = (run: () => void) => () => { setMenu(null); run(); };

  return (
    <>
      {dock && (
        <div role="toolbar" aria-label="Undo, redo and hide tools" className="sr-board-history" data-board-own>
          <IconButton label="Undo" keys="Ctrl+Z, or Cmd+Z on a Mac" onClick={() => api.undo()} disabled={!api.canUndo()}>
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </IconButton>
          <IconButton label="Redo" keys="Ctrl+Shift+Z, or Cmd+Shift+Z on a Mac" onClick={() => api.redo()} disabled={!api.canRedo()}>
            <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </IconButton>
          <IconButton label="Hide tools" keys="Escape, or double-tap the board" onClick={() => { setDock(false); setMenu(null); }}>
            <path d="M6 6l12 12" /><path d="M18 6 6 18" />
          </IconButton>
        </div>
      )}

      {!seen && !dock && !barFor && (
        <p className="sr-board-hint" data-board-own data-board-hint aria-live="polite">
          <span className="sr-board-hint--touch">Double-tap the board for tools</span>
          <span className="sr-board-hint--mouse">Double-click or right-click the board for tools</span>
        </p>
      )}

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
