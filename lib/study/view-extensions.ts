// How a study page is drawn, kept apart from what a study page IS.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SEPARATE FILE FROM extensions.ts, and it is the only reason:
// the browser must be able to open the room without downloading it.
//
// Taking AFFiNE's whole feature set is most of a megabyte of JavaScript, gzipped
// -- the canvas, the databases, the embeds, the highlighter's WebAssembly. That
// is the right price for an editor and the wrong price for a LIST OF PAGES,
// which is the first thing anybody sees and which needs none of it. Before this
// split, opening the room downloaded the entire editor before it could draw a
// single page title, on a phone, on Philippine mobile data, and the room was
// reported as broken when it was only loading.
//
// So: the store side (what a page may contain, the schema) is small and loads
// with the room. This file and `effects.ts` are imported with `await import(...)`
// at the moment somebody opens a page, which is the moment they are asking for
// an editor. See components/study/StudyRoomEditor.tsx.
//
// Nothing else may import this at the top of a file. tests/the-study-room-is-
// paid-for-on-arrival.mjs fails if anything does.
// ---------------------------------------------------------------------------

import { ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import type { DocMode } from '@blocksuite/affine/model';
import {
  ActionPlacement,
  DocModeExtension,
  type DocModeProvider,
  type ToolbarAction,
  type ToolbarActions,
  type ToolbarContext,
  ToolbarFlag,
  ToolbarModuleExtension,
  ToolbarRegistryIdentifier,
} from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier, type BlockStdScope } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { ParagraphViewExtension } from '@blocksuite/affine-block-paragraph/view';
import { html } from 'lit';

/**
 * WHAT AN EMPTY ROOM SAYS. BlockSuite's own placeholder is `Type '/' for
 * commands`, which is true again now the slash menu is here, and still not what
 * somebody opening a study room needs to read first. A placeholder only appears
 * once the caret is in the block, which is why an untouched room looked like a
 * white rectangle and was reported as not working twice before anybody typed.
 */
const PLACEHOLDERS: Record<string, string> = {
  text: 'Write what you noticed today.',
  quote: '',
  h1: 'Heading',
  h2: 'Heading',
  h3: 'Heading',
  h4: 'Heading',
  h5: 'Heading',
  h6: 'Heading',
};

/** How those blocks are drawn and edited: AFFiNE's own set, entire. */
export function studyViewManager() {
  const manager = new ViewExtensionManager(getInternalViewExtensions());

  manager.configure(ParagraphViewExtension, {
    getPlaceholder: (model) => PLACEHOLDERS[model.props.type] ?? '',
  });

  return manager;
}

/**
 * WHICH MODE THE EDITOR IS IN, said to AFFiNE. Its own bar for a selected
 * thing on the whiteboard (`affine-toolbar-widget`: the colours, the text
 * style and the ⋯ menu with Duplicate, Lock, Arrange and Delete) asks the doc
 * mode service whether the editor is a page or a whiteboard, and AFFiNE's
 * default service answers "no mode", which it reads as "page". So, from the
 * first whiteboard here until 28 October 2026, selecting a shape made the bar
 * reset itself and stay closed, and the room drew a bar of its own in its
 * place. Saying the real mode is all AFFiNE's app does to make it open.
 */
function fixedMode(mode: DocMode): DocModeProvider {
  return {
    getEditorMode: () => mode,
    setEditorMode: () => {},
    // A page's PRIMARY mode is about other pages (how a linked page's card is
    // drawn); every page here opens as writing, as AFFiNE's default says.
    getPrimaryMode: () => 'page',
    setPrimaryMode: () => {},
    togglePrimaryMode: () => 'page',
    // Nothing here ever changes mode while the editor is open: a page and a
    // whiteboard are separate editors (StudyRoomEditor builds a new one).
    onPrimaryModeChange: () => ({ unsubscribe() {} }) as unknown as ReturnType<DocModeProvider['onPrimaryModeChange']>,
  };
}

/**
 * DELETE ON THE BAR ITSELF (29 October 2026: on a phone or a tablet "it's so
 * hard to delete objects"). AFFiNE keeps Delete at the foot of ⋯, ten choices
 * down: three exact taps for the commonest thing anybody does to a mistake. So
 * the bar over a selected thing gains a bin, after Lock, the way the bars on
 * phone whiteboards have one. It is AFFiNE's own Delete, found in AFFiNE's own
 * list and run as it is, so a line attached to a shape still goes with it and
 * Undo still brings both back. A locked thing has no bin, as it has no ⋯; the
 * card with the page's writing is locked (lib/study/board-actions.ts).
 */
const BIN = html`<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></svg>`;

/** AFFiNE's own Delete for things on a whiteboard, wherever in its ⋯ it is kept. */
function affinesDelete(ctx: ToolbarContext): ToolbarAction | null {
  const find = (actions: ToolbarActions): ToolbarAction | null => {
    for (const action of actions) {
      if ('actions' in action && Array.isArray(action.actions)) {
        const inner = find(action.actions as ToolbarActions);
        if (inner) return inner;
      } else if (action.id === 'e.delete' && 'run' in action) {
        return action as ToolbarAction;
      }
    }
    return null;
  };
  return find(ctx.toolbarRegistry.getModuleBy('affine:surface:*')?.actions ?? []);
}

const DeleteOnTheBar = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('custom:affine:surface:*'),
  config: {
    actions: [{
      placement: ActionPlacement.End,
      id: 'c.delete',
      label: 'Delete',
      tooltip: 'Delete',
      icon: BIN,
      run: (ctx) => affinesDelete(ctx)?.run?.(ctx),
    }],
    when(ctx) {
      const models = ctx.getSurfaceModels();
      return models.length > 0 && !models.some((model) => model.isLocked());
    },
  },
});

/** Everything a page or a whiteboard is drawn with, for that mode. */
export function studyViewExtensions(mode: DocMode): ExtensionType[] {
  return [
    ...studyViewManager().get(mode),
    DocModeExtension(fixedMode(mode)),
    ...(mode === 'edgeless' ? [DeleteOnTheBar] : []),
  ];
}

/**
 * Tells `run` whenever AFFiNE's bar for a selection opens or closes: the bar
 * over selected words on a page (Bold, Italic, Link, ⋮) and over a selected
 * thing on a whiteboard. Returns a way to stop.
 *
 * WHY THE ROOM NEEDS TO KNOW. AFFiNE keeps its editor in a layer of its own
 * (`isolation: isolate` on editor-host), so its bar, however high its
 * z-index, can never rise above something outside that layer, and the room's
 * insert bar is outside it, stuck to the top while the writing scrolls under
 * it. Selecting a word on the first lines opened the bar underneath the
 * insert bar, where nobody could see it (found 28 October 2026). While the bar
 * is open, the insert bar steps back (study-shell.css, `data-affine-bar`).
 */
export function whenAffineBarShows(std: BlockStdScope, run: (open: boolean) => void): () => void {
  const flags = std.get(ToolbarRegistryIdentifier).flags;
  return flags.value$.subscribe((value) => {
    run(value !== ToolbarFlag.None && (value & ToolbarFlag.Hiding) === 0);
  });
}
