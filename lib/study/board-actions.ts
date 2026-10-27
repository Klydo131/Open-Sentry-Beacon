// What a person can do to the things on a whiteboard, in words.
//
// ---------------------------------------------------------------------------
// REPORTED on 27 October 2026, with a photograph of a selected triangle and
// nothing around it: "if I right click on it there are no option for me to
// delete objects, options to modify, or edit it." AFFiNE's own bar for a
// selected thing (`affine-toolbar-widget`) is in the room but never draws
// anything here, and its canvas has no right-click menu at all, so the only
// ways to delete were the Delete key and the eraser, and nothing said either.
//
// So the room draws its own, from this file (components/study/StudyBoardTools.tsx):
// a bar along the top of the board that says what is selected and what can be
// done to it, and the same choices on a right-click or a long press. Every
// action here is AFFiNE's own (its delete, its duplicate, its ordering, its
// palette, its text editors); this file only gives them names a person can read.
//
// LOADED WITH THE WHITEBOARD, NOT WITH THE ROOM. It reaches into AFFiNE's
// canvas packages, which the shelf must not pay for (tests/the-study-room-is-
// paid-for-on-arrival.mjs); StudyRoomEditor imports it with `await import(...)`
// the moment a page is turned into a whiteboard.
// ---------------------------------------------------------------------------

import type { BlockStdScope } from '@blocksuite/affine/std';
import { GfxBlockElementModel, GfxControllerIdentifier, type GfxController, type GfxModel } from '@blocksuite/affine/std/gfx';
import { ConnectorMode, DefaultTheme } from '@blocksuite/affine/model';
import { duplicate } from '@blocksuite/affine/blocks/root';
import { mountShapeTextEditor } from '@blocksuite/affine/gfx/shape';
import { mountTextElementEditor } from '@blocksuite/affine/gfx/text';

/** The colours offered: the six every kind of thing on a board has a shade of. */
export const BOARD_COLOURS = ['Yellow', 'Orange', 'Red', 'Green', 'Blue', 'Purple'] as const;
export type BoardColour = (typeof BOARD_COLOURS)[number];

/** The tools named in the room's own bar; AFFiNE's bar at the bottom has the rest. */
export const BOARD_TOOLS = ['default', 'brush', 'shape', 'affine:note', 'text', 'connector', 'eraser'] as const;
export type BoardTool = (typeof BOARD_TOOLS)[number];

/** One selected thing, described for a person. */
export interface BoardThing {
  id: string;
  /** "shape", "drawing", "sticky note"... */
  kind: string;
  canEditWords: boolean;
  canColour: boolean;
  /** The note that holds the page's own writing: shown here, never deleted here. */
  isPageWriting: boolean;
}

export interface BoardApi {
  selected(): BoardThing[];
  /** Called whenever the selection, the tool or the history changes. Returns a way to stop. */
  watch(run: () => void): () => void;
  /**
   * Select whatever is under this point of the screen. False if nothing is,
   * and then nothing stays selected: a right-click on empty board is about the
   * board, not about whatever was picked a moment ago.
   */
  pickAt(clientX: number, clientY: number): boolean;
  editWords(): boolean;
  colour(name: BoardColour): void;
  copy(): Promise<void>;
  order(direction: 'front' | 'back'): void;
  /** Deletes what is selected, except the page's own writing. Returns how many were deleted. */
  remove(): number;
  clear(): void;
  selectAll(): void;
  showEverything(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  tool(): string;
  useTool(name: BoardTool): void;
  /** CSS colour for a swatch. */
  swatch(name: BoardColour): string;
}

const shade = (c: unknown): string => (typeof c === 'string' ? c : (c as { light?: string; normal?: string })?.light
  ?? (c as { normal?: string })?.normal ?? '#888');

function describe(el: GfxModel): BoardThing {
  const flavour = (el as { flavour?: string }).flavour;
  const type = (el as { type?: string }).type;
  if (flavour === 'affine:note') {
    const mode = (el as unknown as { props?: { displayMode?: string } }).props?.displayMode;
    const page = mode !== 'edgeless';
    return { id: el.id, kind: page ? 'your page’s writing' : 'sticky note', canEditWords: true, canColour: true, isPageWriting: page };
  }
  if (flavour === 'affine:edgeless-text') return { id: el.id, kind: 'words', canEditWords: true, canColour: false, isPageWriting: false };
  if (flavour === 'affine:image') return { id: el.id, kind: 'picture', canEditWords: false, canColour: false, isPageWriting: false };
  if (flavour === 'affine:frame') return { id: el.id, kind: 'frame', canEditWords: false, canColour: false, isPageWriting: false };
  if (flavour) return { id: el.id, kind: 'card', canEditWords: false, canColour: false, isPageWriting: false };
  switch (type) {
    case 'shape': return { id: el.id, kind: 'shape', canEditWords: true, canColour: true, isPageWriting: false };
    case 'text': return { id: el.id, kind: 'words', canEditWords: true, canColour: true, isPageWriting: false };
    case 'brush': return { id: el.id, kind: 'drawing', canEditWords: false, canColour: true, isPageWriting: false };
    case 'highlighter': return { id: el.id, kind: 'highlight', canEditWords: false, canColour: false, isPageWriting: false };
    case 'connector': return { id: el.id, kind: 'arrow', canEditWords: false, canColour: true, isPageWriting: false };
    case 'group': return { id: el.id, kind: 'group', canEditWords: false, canColour: false, isPageWriting: false };
    case 'mindmap': return { id: el.id, kind: 'mind map', canEditWords: false, canColour: false, isPageWriting: false };
    default: return { id: el.id, kind: 'thing', canEditWords: false, canColour: false, isPageWriting: false };
  }
}

export function boardApi(std: BlockStdScope): BoardApi | null {
  let gfx: GfxController;
  try {
    gfx = std.get(GfxControllerIdentifier);
  } catch {
    return null;
  }
  const store = std.store;
  const edgeless = () => (store.root ? std.view.getBlock(store.root.id) : null);
  const elements = () => gfx.selection.selectedElements;

  const api: BoardApi = {
    selected: () => elements().map(describe),

    watch(run) {
      const subs = [
        gfx.selection.slots.updated.subscribe(() => run()),
        gfx.viewport.viewportUpdated.subscribe(() => run()),
      ];
      // The tool is a signal; the undo history says when Undo or Redo changes.
      const stopTool = gfx.tool.currentToolName$.subscribe(() => run());
      const history = store.history.onUpdated.subscribe(() => run());
      return () => {
        subs.forEach((s) => s.unsubscribe());
        stopTool();
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

    editWords() {
      const el = elements()[0];
      const host = edgeless();
      if (!el || !host) return false;
      const thing = describe(el);
      if (!thing.canEditWords) return false;
      const type = (el as { type?: string }).type;
      if (type === 'shape') { mountShapeTextEditor(el as never, host); return true; }
      if (type === 'text') { mountTextElementEditor(el as never, host); return true; }
      // A sticky note or a block of words: the same as a double tap on it.
      gfx.selection.set({ elements: [el.id], editing: true });
      requestAnimationFrame(() => {
        const editable = std.view.getBlock(el.id)?.querySelector<HTMLElement>('[contenteditable="true"]');
        editable?.focus();
      });
      return true;
    },

    colour(name) {
      const t = DefaultTheme;
      store.captureSync();
      store.transact(() => {
        for (const el of elements()) {
          const flavour = (el as { flavour?: string }).flavour;
          const type = (el as { type?: string }).type;
          if (flavour === 'affine:note') gfx.updateElement(el, { background: t.NoteBackgroundColorMap[name] });
          else if (type === 'shape') gfx.updateElement(el, { fillColor: t.FillColorShortMap[name], strokeColor: t.StrokeColorShortMap[name] });
          else if (type === 'brush' || type === 'text') gfx.updateElement(el, { color: t.StrokeColorShortMap[name] });
          else if (type === 'connector') gfx.updateElement(el, { stroke: t.StrokeColorShortMap[name] });
        }
      });
    },

    async copy() {
      const host = edgeless();
      const chosen = elements();
      if (!host || !chosen.length) return;
      await duplicate(host, chosen, true);
    },

    order(direction) {
      store.captureSync();
      for (const el of elements()) {
        const index = gfx.layer.getReorderedIndex(el, direction);
        if (el instanceof GfxBlockElementModel) store.transact(() => { el.index = index; });
        else el.index = index;
      }
    },

    remove() {
      const doomed = elements().filter((el) => !describe(el).isPageWriting);
      if (!doomed.length) return 0;
      store.captureSync();
      store.transact(() => { for (const el of doomed) gfx.deleteElement(el); });
      gfx.selection.clear();
      return doomed.length;
    },

    clear: () => gfx.selection.clear(),

    selectAll() {
      gfx.selection.set({ elements: gfx.gfxElements.map((el) => el.id) });
    },

    showEverything: () => gfx.fitToScreen({ smooth: true }),

    undo: () => { if (store.canUndo) store.undo(); },
    redo: () => { if (store.canRedo) store.redo(); },
    canUndo: () => store.canUndo,
    canRedo: () => store.canRedo,

    tool: () => gfx.tool.currentToolName$.peek(),
    useTool(name) {
      // setTool reads only the tool's name (std/gfx tool-controller), so the
      // room need not import each tool's class to choose it. THREE NEED THEIR
      // OPTIONS, the ones AFFiNE's own bar passes: a shape tool with no shape
      // throws on the first drag ("reading 'strokeColor'"), found by the walk.
      const options: Partial<Record<BoardTool, Record<string, unknown>>> = {
        shape: { shapeName: 'rect' },
        'affine:note': { childFlavour: 'affine:paragraph', childType: 'text', tip: 'Text' },
        connector: { mode: ConnectorMode.Curve },
      };
      gfx.tool.setTool({ toolName: name } as never, options[name] as never);
    },

    swatch: (name) => shade(DefaultTheme.FillColorShortMap[name]),
  };
  return api;
}
