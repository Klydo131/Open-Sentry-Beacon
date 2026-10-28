// The few things the room itself does on a whiteboard; AFFiNE does the rest.
//
// ---------------------------------------------------------------------------
// WHAT AFFiNE DOES. Its tools are a dock along the bottom of the board, and a
// selected thing gets a bar floating over it: colour, style, Lock, and ⋯ More,
// with Frame and Group, Bring to Front / Forward, Send Backward / to Back,
// Copy, Duplicate and Delete. The room uses AFFiNE's own tools rather than
// drawing its own, so what somebody learns here is what AFFiNE itself does
// (28 October 2026: "You can just copy the Affine ... when it comes to tools").
//
// WHEN THEY SHOW. Since 28 October 2026 the board starts clean: "tools will
// only appear when you double tap an object or the board (or right click in
// desktop). I want the board to be clean as possible."
// components/study/StudyBoardTools.tsx decides when; this file answers the
// questions it has to ask: is anything under this point, what is selected,
// and is the Select tool the one in use (a double-tap with a pen is drawing).
//
// WHAT THE ROOM DOES, from this file and components/study/StudyBoardTools.tsx:
//   * Undo and Redo as two buttons beside the dock, because a phone has no
//     Ctrl+Z;
//   * a right-click, or a long press with a finger, on a thing opens AFFiNE's
//     ⋯ menu for it; on empty board, a short menu for the board itself;
//   * the card with the page's own writing is LOCKED on the board. AFFiNE's
//     Delete would take the page's writing with it (tried on 28 October 2026:
//     the page came back empty), so it cannot be moved or deleted until
//     somebody chooses Unlock. The writing is changed on Write.
//
// LOADED WITH THE WHITEBOARD, NOT WITH THE ROOM. StudyRoomEditor imports it
// with `await import(...)` when a page is turned into a whiteboard
// (tests/the-study-room-is-paid-for-on-arrival.mjs).
// ---------------------------------------------------------------------------

import type { BlockStdScope } from '@blocksuite/affine/std';
import { GfxBlockElementModel, GfxControllerIdentifier, type GfxController, type GfxModel } from '@blocksuite/affine/std/gfx';

export interface BoardApi {
  /** Called whenever the selection or the history changes. Returns a way to stop. */
  watch(run: () => void): () => void;
  /**
   * Select whatever is under this point of the screen. False if nothing is,
   * and then nothing stays selected: a right-click on empty board is about the
   * board, not about whatever was picked a moment ago.
   */
  pickAt(clientX: number, clientY: number): boolean;
  /** Whether anything is under this point of the screen. Selects nothing. */
  hitAt(clientX: number, clientY: number): boolean;
  /** What is selected now, by id. */
  selectedIds(): string[];
  /** Whether Select is the tool in use, rather than a pen, a shape or the hand. */
  selecting(): boolean;
  selectAll(): void;
  showEverything(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /**
   * Locks the card holding the page's own writing, outside the undo history
   * so Undo never unlocks it. Returns how many were locked just now.
   */
  protectPageWriting(): number;
}

/** A note shown in both views is the page's writing; a sticky note is board-only. */
const isPageWriting = (el: GfxModel): el is GfxBlockElementModel =>
  el instanceof GfxBlockElementModel
  && (el as { flavour?: string }).flavour === 'affine:note'
  && (el as unknown as { props?: { displayMode?: string } }).props?.displayMode !== 'edgeless';

export function boardApi(std: BlockStdScope): BoardApi | null {
  let gfx: GfxController;
  try {
    gfx = std.get(GfxControllerIdentifier);
  } catch {
    return null;
  }
  const store = std.store;

  return {
    watch(run) {
      const selection = gfx.selection.slots.updated.subscribe(() => run());
      const history = store.history.onUpdated.subscribe(() => run());
      return () => {
        selection.unsubscribe();
        history.unsubscribe();
      };
    },

    pickAt(clientX, clientY) {
      const [x, y] = gfx.viewport.toModelCoordFromClientCoord([clientX, clientY]);
      const hit = gfx.getElementByPoint(x, y, { all: false }) as GfxModel | null;
      if (!hit) { gfx.selection.clear(); return false; }
      if (!gfx.selection.has(hit.id)) gfx.selection.set({ elements: [hit.id] });
      return true;
    },

    hitAt(clientX, clientY) {
      const [x, y] = gfx.viewport.toModelCoordFromClientCoord([clientX, clientY]);
      return !!gfx.getElementByPoint(x, y, { all: false });
    },

    selectedIds: () => [...gfx.selection.selectedIds],

    selecting() {
      // `tool` is added to the controller at run time by AFFiNE's tool
      // controller, so it is not in the controller's own type. The name is on
      // the tool itself; the options object beside it has none (read there
      // first, every tool looked like Select and a double-tap with the pen
      // opened the dock instead of drawing).
      const tool = (gfx as unknown as { tool?: { currentTool$?: { peek(): { toolName?: string } | undefined } } }).tool;
      const name = tool?.currentTool$?.peek()?.toolName;
      return !name || name === 'default';
    },

    selectAll() {
      gfx.selection.set({ elements: gfx.gfxElements.map((el) => el.id) });
    },

    showEverything: () => gfx.fitToScreen({ smooth: true }),

    undo: () => { if (store.canUndo) store.undo(); },
    redo: () => { if (store.canRedo) store.redo(); },
    canUndo: () => store.canUndo,
    canRedo: () => store.canRedo,

    protectPageWriting() {
      if (store.readonly) return 0;
      const open = gfx.gfxElements.filter((el) => isPageWriting(el) && !el.lockedBySelf) as GfxBlockElementModel[];
      if (!open.length) return 0;
      store.withoutTransact(() => {
        for (const note of open) note.lockedBySelf = true;
      });
      return open.length;
    },
  };
}
