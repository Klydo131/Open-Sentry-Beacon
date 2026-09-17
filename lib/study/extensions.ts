// What a study room is made of: everything AFFiNE has.
//
// ---------------------------------------------------------------------------
// ASKED FOR, WITH FOUR SCREENSHOTS OF AFFiNE'S OWN APP AND A LINK TO THEIR
// REPOSITORY: "Did you even scan the whole affine on how the whole notion
// works? The whole point is to look to have a Notion feel in the study room.
// I want the whole feature please."
//
// The answer to the question is: not properly, and this file was the evidence.
// It used to name nine blocks by hand and leave out roughly thirty, and the
// reasoning for each omission was sound on its own terms and wrong as a whole.
// A hand-picked list is a running argument with a person who has said three
// times what they want.
//
// SO THE LIST IS AFFiNE'S OWN. `getInternalStoreExtensions()` and
// `getInternalViewExtensions()` are the exact sets AFFiNE ships to its own
// users, and taking them whole is what makes the room's features the same
// features rather than a subset somebody has to discover the edges of. What
// arrives with them, none of which this room had:
//
//   * DATABASES -- table view and kanban board, the "Kanban for Todos" in the
//     screenshot, with typed columns and grouping.
//   * CODE BLOCKS, LATEX, images, attachments, bookmarks, and the embeds:
//     YouTube, Figma, GitHub, Loom, and a whole document embedded in another.
//   * THE WHITEBOARD -- the infinite canvas, with shapes, connectors, brush,
//     mindmaps, frames, templates and its own toolbars.
//   * `@` FOR LINKING AND MENTIONING, which is the linked-doc widget: one page
//     referring to another, and the back-links that gives.
//   * The outline, the frame panel, the adapter panel, remote selection, and
//     every widget AFFiNE's own editor mounts.
//
// WHAT IT COSTS, SAID PLAINLY RATHER THAN HIDDEN IN A COMMENT. This is most of
// a megabyte more JavaScript than the trimmed set, and the room is opened by
// people on Philippine mobile data. Two things carry that, and both are real
// rather than reassurance:
//
//   1. The shelf no longer waits for the editor. This file -- the schema, which
//      is small -- loads with the room; the drawing half is in
//      lib/study/view-extensions.ts and lib/study/effects.ts, both fetched at
//      the moment a page is opened. Measured before and after, in the report.
//   2. Nothing else in the app imports any of this. One route, loaded on
//      demand, and tests/the-study-room-is-paid-for-on-arrival.mjs fails if a
//      second importer ever appears.
//
// TWO THINGS STILL DO NOT WORK, and neither is a decision:
//
//   THE CODE BLOCK RENDERS WITHOUT COLOURS. Its highlighter is shiki, which
//   matches with oniguruma -- a WebAssembly module -- and this app's Content
//   Security Policy has no `wasm-unsafe-eval`, so the browser refuses to
//   compile it. The block works, takes code, keeps it and copies it; the words
//   are all one colour. Widening the policy is the fix and it is a security
//   change, not a styling one, so it is the owner's call.
//
//   IMAGES AND ATTACHMENTS NEED SOMEWHERE FOR THE BYTES. The blocks are here
//   and the workspace keeps blobs in the church's own database now
//   (lib/study/blob-source.ts), so a picture survives a reload. What it does
//   not do is share: a blob belongs to the person whose room it is, like every
//   other row in that room.
//
// THE SCHEMA IS NOT THE VIEW, and that distinction is why the store list is
// also AFFiNE's own. Dropping a block from the view costs that block's feature.
// Dropping it from the SCHEMA costs everybody who has already written one:
// loading their page raises `schema for flavour: <whatever> not found`,
// BlockSuite skips the block, and the writing in it is in the database with
// nothing able to draw it. Taking the full store set means no page this room
// has ever written, or ever will, can become unreadable by a later trim.
// ---------------------------------------------------------------------------

import { StoreExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';

/** The blocks a study page may contain. */
export function studyStoreManager() {
  return new StoreExtensionManager(getInternalStoreExtensions());
}
