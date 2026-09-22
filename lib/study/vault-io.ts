// Turning a page into Markdown, and Markdown into a page.
//
// ---------------------------------------------------------------------------
// THE HALF THAT NEEDS A LIVE EDITOR. lib/study/obsidian.ts decides what a file
// is called, what its front matter says and how a folder of them becomes a
// zip -- all of it testable in Node. This is the other half: blocks in, blocks
// out, which only BlockSuite can do and only with a store in front of it.
//
// AFFiNE'S OWN ADAPTERS, NOT A CONVERTER OF OURS. Every block package in
// @blocksuite ships `src/adapters/markdown.ts`, and the factory that assembles
// them is what AFFiNE's own import and export panel uses. Writing a second
// converter here would start correct for paragraphs and headings and then
// quietly fall behind on tables, callouts, code fences and footnotes -- the
// blocks somebody would most notice losing.
// ---------------------------------------------------------------------------

import { MarkdownAdapterFactoryIdentifier } from '@blocksuite/affine-shared/adapters';
import type { Store } from '@blocksuite/store';

/** The page as Markdown, using the same path AFFiNE's own export uses. */
export async function markdownFromPage(store: Store): Promise<string> {
  const job = store.getTransformer([]);
  const factory = store.get(MarkdownAdapterFactoryIdentifier);
  const adapter = factory.get(job);
  const result = await adapter.fromDoc(store);
  return String(result?.file ?? '');
}

/**
 * Markdown into an already-made, empty page.
 *
 * INTO A PAGE WE MADE, rather than letting the snapshot make its own. The room
 * has to put the page on the shelf, give it a folder and its tags, and open
 * it; all of that hangs off an id, and a doc that arrives with an id of its
 * own choosing is a page the shelf does not know about.
 */
export async function markdownIntoPage(store: Store, markdown: string): Promise<void> {
  const job = store.getTransformer([]);
  const factory = store.get(MarkdownAdapterFactoryIdentifier);
  const adapter = factory.get(job);
  const snapshot = await adapter.toDocSnapshot({
    file: markdown,
    assets: job.assetsManager,
  });

  // A PAGE MADE A MOMENT AGO HAS NOTHING IN IT, not even a root, and the
  // adapters will not fill one in. The three blocks below are what every page
  // in this room starts with -- the same order lib/study/getting-started.ts
  // uses, including the surface, because a page with no surface cannot be
  // looked at as a whiteboard and cannot be turned back into a snapshot.
  const rootId = store.root?.id ?? store.addBlock('affine:page', {});
  if (!store.getBlocksByFlavour('affine:surface').length) {
    try { store.addBlock('affine:surface', {}, rootId); } catch { /* already there */ }
  }
  const noteId = store.getBlocksByFlavour('affine:note')[0]?.id
    ?? store.addBlock('affine:note', {}, rootId);

  // WHAT A DOC SNAPSHOT LOOKS LIKE, because assuming cost an hour. Its root is
  // an `affine:page` with TWO children -- an `affine:surface` (the whiteboard
  // layer, which every page carries whether or not anybody has drawn on it)
  // and an `affine:note` holding the writing. The words are the note's
  // children, one level further down than they look.
  //
  // Handing the note and the surface themselves to a note is refused by the
  // schema, correctly: "Block cannot have parent: affine:note". The first
  // version of this did exactly that and the import failed in silence, because
  // BlockSuite logs a schema refusal and carries on.
  const children = snapshot.blocks?.children ?? [];
  const note = children.find((child) => child.flavour === 'affine:note');
  const content = note?.children
    ?? children.filter((child) => child.flavour !== 'affine:surface');

  let index = 0;
  for (const block of content) {
    await job.snapshotToBlock(block, store, noteId, index);
    index += 1;
  }
}
