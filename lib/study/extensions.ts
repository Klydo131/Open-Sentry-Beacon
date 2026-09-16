// What a study room is made of, and everything it is not.
//
// ---------------------------------------------------------------------------
// WHY THIS LIST EXISTS. BlockSuite offers `getInternalStoreExtensions()` and
// `getInternalViewExtensions()`, which load every block it has. That is right
// for AFFiNE, which is a whiteboard and a database and a document editor at
// once. It is wrong for a room whose whole job is somewhere to write while you
// read, and the cost is not theoretical: the editor chunk measured 4.6 MB and
// took upwards of ten seconds to arrive, which was reported as the room being
// broken before anybody got as far as it being slow.
//
// Counted in that chunk: 556 references to embeds, 233 to database blocks, 164
// to edgeless -- the infinite canvas -- and 107 to data-view, plus frames,
// bookmarks and attachments. An Explorer writing notes about a study needs none
// of them.
//
// WHAT IS KEPT, AND WHY EACH ONE. Paragraphs and lists because that is what
// writing is. Dividers because people separate one thought from the next.
// Tables and callouts because a study is often a comparison or a point worth
// setting apart. Note and Root because a page cannot exist without them.
// Foundation because everything else assumes it.
//
// THE CODE BLOCK WAS DROPPED FOR A REASON WORTH WRITING DOWN, because it looks
// harmless. Its syntax highlighter is shiki, and shiki matches with oniguruma,
// which is a 466 kB WebAssembly module inlined as base64 -- 225 kB gzipped, a
// seventh of everything this page fetched. This app's own Content Security
// Policy is `script-src 'self' 'unsafe-inline'`, with no `unsafe-eval` and no
// `wasm-unsafe-eval`, so the browser refuses to compile it. The console said so
// in as many words. The highlighting could never have worked; the download
// always did. Paying a seventh of the page for a feature the policy forbids is
// the sort of thing that survives only because nobody looks.
//
// Two ways back if somebody ever wants it: widen the policy, or accept plain
// unhighlighted code. Neither is worth it for a room where people write about
// what they read.
//
// THE INLINE SET IS NOT A MENU. DefaultInlineManager declares all twelve of its
// specs as dependencies -- bold, italic, code, colour, latex, reference, link,
// footnote, mention -- and leaving any one of them out does not disable that
// one feature. The manager fails to construct, so no rich text renders at all.
// That is not a guess: dropping latex and mention as obviously-unwanted gave a
// page with an <affine-paragraph> in it that was zero pixels tall, no visible
// error, and one line in the console -- `Missing dependency
// [AffineInlineSpec](latex)`. Text is all-or-nothing here. Blocks are not, and
// that is where the weight was.
//
// WHAT IS DROPPED IS A PRODUCT DECISION, NOT A TECHNICAL ONE. No infinite
// canvas, no databases, no embedded documents, no attachments. If somebody
// later wants a whiteboard in here, that is a conversation about what a study
// room is for, and it is answered by adding a line to this file rather than by
// discovering the bundle grew.
//
// THE SCHEMA IS NOT THE VIEW. `affine:surface` is the infinite canvas, which
// this room does not draw, so the view extension is gone and the canvas code
// with it. But the rooms already in the database were written by a version that
// put a surface block in every page, and loading one without its schema raises
// `schema for flavour: affine:surface not found`.
//
// What that actually costs, measured rather than assumed: BlockSuite catches
// the error, logs it, skips the block and carries on. The page opens, the note
// and the paragraph are there, the writing is intact. So this is not an outage
// -- it is an error on every open of every room that already exists, and one
// block the app holds in the store but cannot see in the model.
//
// SurfaceStoreExtension therefore stays, because it is the schema and the
// schema has to be able to read what is already stored. Dropping a block from
// the view costs that block's feature, which is a decision. Dropping it from
// the schema costs everybody who already has one, which is a bug. Anything this
// room has ever written stays readable even after it stops being drawn.
// ---------------------------------------------------------------------------

import { StoreExtensionManager, ViewExtensionManager } from '@blocksuite/affine/ext-loader';

import { FoundationStoreExtension } from '@blocksuite/affine-foundation/store';
import { RootStoreExtension } from '@blocksuite/affine-block-root/store';
import { NoteStoreExtension } from '@blocksuite/affine-block-note/store';
import { ParagraphStoreExtension } from '@blocksuite/affine-block-paragraph/store';
import { ListStoreExtension } from '@blocksuite/affine-block-list/store';
import { DividerStoreExtension } from '@blocksuite/affine-block-divider/store';
import { TableStoreExtension } from '@blocksuite/affine-block-table/store';
import { CalloutStoreExtension } from '@blocksuite/affine-block-callout/store';
import { SurfaceStoreExtension } from '@blocksuite/affine-block-surface/store';

import { FoundationViewExtension } from '@blocksuite/affine-foundation/view';
import { RootViewExtension } from '@blocksuite/affine-block-root/view';
import { NoteViewExtension } from '@blocksuite/affine-block-note/view';
import { ParagraphViewExtension } from '@blocksuite/affine-block-paragraph/view';
import { ListViewExtension } from '@blocksuite/affine-block-list/view';
import { DividerViewExtension } from '@blocksuite/affine-block-divider/view';
import { TableViewExtension } from '@blocksuite/affine-block-table/view';
import { CalloutViewExtension } from '@blocksuite/affine-block-callout/view';
import { InlinePresetViewExtension } from '@blocksuite/affine-inline-preset/view';
import { LinkViewExtension } from '@blocksuite/affine-inline-link/view';
import { ReferenceViewExtension } from '@blocksuite/affine-inline-reference/view';
import { FootnoteViewExtension } from '@blocksuite/affine-inline-footnote/view';
import { MentionViewExtension } from '@blocksuite/affine-inline-mention/view';
import { LatexViewExtension } from '@blocksuite/affine-inline-latex/view';
import { DragHandleViewExtension } from '@blocksuite/affine-widget-drag-handle/view';

/** The blocks a study page may contain. */
export function studyStoreManager() {
  return new StoreExtensionManager([
    FoundationStoreExtension,
    RootStoreExtension,
    NoteStoreExtension,
    ParagraphStoreExtension,
    ListStoreExtension,
    DividerStoreExtension,
    TableStoreExtension,
    CalloutStoreExtension,
    SurfaceStoreExtension,
  ]);
}

/**
 * WHAT AN EMPTY ROOM SAYS. BlockSuite's own placeholder is `Type '/' for
 * commands`, which would be a lie here: the slash menu is one of the widgets
 * this room does not carry. And a placeholder only appears once the caret is in
 * the block, which is why an untouched room is a white rectangle and was
 * reported as not working twice before anybody typed in it.
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

/** How those blocks are drawn and edited. */
export function studyViewManager() {
  const manager = new ViewExtensionManager([
    FoundationViewExtension,
    RootViewExtension,
    NoteViewExtension,
    ParagraphViewExtension,
    ListViewExtension,
    DividerViewExtension,
    TableViewExtension,
    CalloutViewExtension,
    InlinePresetViewExtension,
    LinkViewExtension,
    ReferenceViewExtension,
    FootnoteViewExtension,
    MentionViewExtension,
    LatexViewExtension,
    DragHandleViewExtension,
  ]);

  manager.configure(ParagraphViewExtension, {
    getPlaceholder: (model) => PLACEHOLDERS[model.props.type] ?? '',
  });

  return manager;
}
