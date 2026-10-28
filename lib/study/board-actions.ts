// The few things the room itself does on a whiteboard; AFFiNE does the rest.
//
// ---------------------------------------------------------------------------
// WHAT AFFiNE DOES. Tap or click something on the board and AFFiNE's own bar
// for it floats above it: colour, style, Lock, and ⋯ More, with Frame and
// Group, Bring to Front / Forward, Send Backward / to Back, Copy, Duplicate
// and Delete. Its tools are the bar along the bottom. That is the pattern of
// every whiteboard people already know (Miro, FigJam, Apple Freeform,
// Obsidian Canvas), and since 28 October 2026 it draws here; before that the
// room never told AFFiNE it was a whiteboard (lib/study/view-extensions.ts),
// so the bar stayed shut and the room drew a bar of its own in words.
//
// WHAT THE ROOM DOES, from this file and components/study/StudyBoardTools.tsx:
//   * Undo and Redo as two buttons, because a phone has no Ctrl+Z;
//   * a right-click, or a long press with a finger, on a thing opens that same
//     ⋯ menu; on empty board, a short menu for the board itself;
//   * the card with the page's own writing is LOCKED on the board. AFFiNE's
//     Delete would take the page's writing with it (tried on 28 October 2026:
//     the page came back empty), and a locked thing is what every one of those
//     whiteboards offers for "this must not move or go": it cannot be moved or
//     deleted until somebody chooses Unlock. The writing is changed on Write.
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
