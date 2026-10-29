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
// A FINGER (29 October 2026: "pretty bad and clunky for mobile and pad ... so
// hard to delete objects, customize, and use the tools when we are trying to
// tap or double tap"). AFFiNE's bar and its ⋯ were drawn for a mouse: buttons
// 24px wide, choices 30px high. `fitForFingers` makes every one of them 44px
// where the screen is touched, and nowhere else. And AFFiNE's dock needs about
// 460px for its four big tools; a phone's board has 340, so a phone saw one
// tool at a time behind 20px arrows. On a narrow board the room lays out the
// same AFFiNE tools as one row of buttons (`useTool`), and AFFiNE's own dock
// is a button away for the rest.
//
// LOADED WITH THE WHITEBOARD, NOT WITH THE ROOM. StudyRoomEditor imports it
// with `await import(...)` when a page is turned into a whiteboard
// (tests/the-study-room-is-paid-for-on-arrival.mjs).
// ---------------------------------------------------------------------------

import { DefaultTool } from '@blocksuite/affine/blocks/surface';
import { BrushTool, EraserTool } from '@blocksuite/affine/gfx/brush';
import { NoteTool } from '@blocksuite/affine/gfx/note';
import { PanTool } from '@blocksuite/affine/gfx/pointer';
import { ShapeTool } from '@blocksuite/affine/gfx/shape';
import { TextTool } from '@blocksuite/affine/gfx/text';
import { ShapeType } from '@blocksuite/affine/model';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { GfxBlockElementModel, GfxControllerIdentifier, type GfxController, type GfxModel } from '@blocksuite/affine/std/gfx';

/** AFFiNE's tools, by what a person calls them. */
export type BoardTool = 'select' | 'hand' | 'pen' | 'eraser' | 'shape' | 'note' | 'text';

/** The name AFFiNE gives each of them. */
const AFFINE_NAME: Record<BoardTool, string> = {
  select: 'default',
  hand: 'pan',
  pen: 'brush',
  eraser: 'eraser',
  shape: 'shape',
  note: 'affine:note',
  text: 'text',
};

/**
 * A finger's size for AFFiNE's bar over a selection and the ⋯ list under it,
 * on a screen that is touched. Both live inside the bar's own shadow root
 * (affine-toolbar-widget), where no stylesheet of the room's can reach, so
 * this one is handed to it. Seven buttons a finger wide only fit a phone
 * without AFFiNE's dividers and the 8px between them, so those go too.
 */
const FINGERS = `
@media (pointer: coarse) {
  editor-toolbar { height: 44px; gap: 0 !important; padding-inline: 4px !important; }
  editor-toolbar > editor-toolbar-separator { display: none !important; }
  editor-toolbar > *,
  editor-toolbar editor-icon-button,
  editor-toolbar editor-menu-button {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  editor-toolbar editor-menu-action {
    min-height: 44px;
    font-size: 15px;
  }
  /* Ten choices a finger high are taller than a small phone has room for
     under the bar: the list scrolls rather than running off the screen. */
  editor-toolbar editor-menu-button > div[data-orientation='vertical'] {
    max-height: calc(100dvh - 220px);
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
  }
}`;

export interface BoardApi {
  /** Called whenever the selection, the history or the tool changes. Returns a way to stop. */
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
  /** The tool in use, by its everyday name; null for one the room does not name. */
  tool(): BoardTool | null;
  /** Takes up one of AFFiNE's tools, as its own dock would. */
  useTool(tool: BoardTool): void;
  /**
   * Gives AFFiNE's bar and ⋯ list a finger's size on a touched screen. Safe to
   * call often: returns false until the bar exists, true once it is done.
   */
  fitForFingers(): boolean;
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
      // A signal: its subscribe hands back the way to stop, not a subscription.
      const stopTool = gfx.tool.currentToolName$.subscribe(() => run());
      return () => {
        selection.unsubscribe();
        history.unsubscribe();
        stopTool();
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

    tool() {
      const name = gfx.tool.currentToolName$.peek();
      const found = (Object.keys(AFFINE_NAME) as BoardTool[]).find((t) => AFFINE_NAME[t] === name);
      return found ?? (name ? null : 'select');
    },

    useTool(tool) {
      switch (tool) {
        case 'select': gfx.tool.setTool(DefaultTool); break;
        case 'hand': gfx.tool.setTool(PanTool); break;
        case 'pen': gfx.tool.setTool(BrushTool); break;
        case 'eraser': gfx.tool.setTool(EraserTool); break;
        // AFFiNE's own defaults for these, as its dock starts them.
        case 'shape': gfx.tool.setTool(ShapeTool, { shapeName: ShapeType.Rect }); break;
        case 'note': gfx.tool.setTool(NoteTool, { childFlavour: 'affine:paragraph', childType: 'text', tip: 'Text' }); break;
        case 'text': gfx.tool.setTool(TextTool); break;
      }
    },

    fitForFingers() {
      const root = std.host.querySelector('affine-toolbar-widget')?.shadowRoot;
      if (!root) return false;
      if (root.querySelector('style[data-fingers]')) return true;
      const style = document.createElement('style');
      style.dataset.fingers = '';
      style.textContent = FINGERS;
      root.append(style);
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
