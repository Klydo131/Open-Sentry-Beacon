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
import { getAssetName, type Store } from '@blocksuite/store';
import { sha } from '@blocksuite/global/utils';
import { ASSET_FOLDER } from './obsidian';

/** A picture a page is carrying, ready to be written into the vault. */
export type PageAsset = { name: string; bytes: Uint8Array };

/**
 * The page as Markdown, with the pictures it uses.
 *
 * THE ADAPTER FETCHES THE PICTURES ITSELF. Walking an image block, it calls
 * `assets.readFromBlob(sourceId)` -- which pulls the bytes out of the room's
 * blob store -- and writes `![](assets/<name>)` pointing at them. So the
 * transformer's assets manager is holding every picture the page uses by the
 * time `fromDoc` returns, and there is nothing to go and look up separately.
 */
export async function markdownFromPage(
  store: Store,
): Promise<{ markdown: string; assets: PageAsset[] }> {
  const job = store.getTransformer([]);
  const factory = store.get(MarkdownAdapterFactoryIdentifier);
  const adapter = factory.get(job);
  const result = await adapter.fromDoc(store);

  const held = job.assetsManager.getAssets();
  const assets: PageAsset[] = [];
  for (const [blobId, blob] of held) {
    try {
      assets.push({
        name: getAssetName(held, blobId),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    } catch {
      // A picture whose bytes have gone is not a reason to lose the writing
      // around it. The note still exports; the embed points at a file that is
      // not there, which is visible, rather than the export failing outright.
    }
  }
  return { markdown: String(result?.file ?? ''), assets };
}

/**
 * Markdown into an already-made, empty page.
 *
 * INTO A PAGE WE MADE, rather than letting the snapshot make its own. The room
 * has to put the page on the shelf, give it a folder and its tags, and open
 * it; all of that hangs off an id, and a doc that arrives with an id of its
 * own choosing is a page the shelf does not know about.
 */
export async function markdownIntoPage(
  store: Store,
  markdown: string,
  pictures: PageAsset[] = [],
): Promise<void> {
  const job = store.getTransformer([]);
  const factory = store.get(MarkdownAdapterFactoryIdentifier);
  const adapter = factory.get(job);

  // THE PICTURES HAVE TO BE IN THE MANIFEST BEFORE THE MARKDOWN IS READ. The
  // image adapter resolves `assets/x.png` through the assets manager's path
  // map, and a name it cannot find becomes a block with no picture in it --
  // quietly, because a missing image is not an error to a Markdown parser.
  //
  // Both spellings are registered because the lookup walks the path from the
  // left, shifting a segment off at a time: it asks for `assets/x.png` and
  // then for `x.png`, and a vault written by a person may say either.
  const assets = job.assetsManager;
  for (const picture of pictures) {
    const blobId = await sha(picture.bytes.slice().buffer as ArrayBuffer);
    const file = new File([picture.bytes.slice().buffer as ArrayBuffer], picture.name, {
      type: mimeFor(picture.name),
    });
    assets.getAssets().set(blobId, file);
    assets.getPathBlobIdMap().set(picture.name, blobId);
    assets.getPathBlobIdMap().set(`${ASSET_FOLDER}/${picture.name}`, blobId);
  }

  const snapshot = await adapter.toDocSnapshot({
    file: markdown,
    assets: job.assetsManager,
  });

  // Into the room's own blob store, so the picture is still there tomorrow
  // rather than only for as long as this import is running.
  for (const blobId of assets.getAssets().keys()) {
    try { await assets.writeToBlob(blobId); } catch { /* reported by the caller */ }
  }

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

/** What a file's name says it is, for the handful of pictures a page can hold. */
function mimeFor(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}
