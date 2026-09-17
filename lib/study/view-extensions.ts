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
import { ParagraphViewExtension } from '@blocksuite/affine-block-paragraph/view';

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
