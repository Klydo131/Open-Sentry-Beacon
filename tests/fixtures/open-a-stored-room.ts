// Open a study page of the shape already sitting in the database.
//
// ---------------------------------------------------------------------------
// Run by tests/a-room-that-already-exists-still-opens.mjs, which bundles this
// with esbuild and runs it in Node. It is a fixture rather than part of the app
// and nothing in app/, components/ or lib/ imports it.
//
// WHY IT BUILDS THE PAGE BY HAND. Every browser walk this repo has opens a
// BRAND NEW room, because that is what the tutorial gives you. A new room is
// the one case that cannot go wrong: it is written by the same code that reads
// it. The rooms that break are the ones already stored, written months or
// versions earlier, and there was no test that opened one of those at all.
//
// So this constructs the Yjs document an older build wrote -- a page with a
// surface block in it, a note and a paragraph -- and opens it with today's
// extension set. No bytes from anybody's real room are used or needed; the
// shape is the thing under test.
// ---------------------------------------------------------------------------

import * as Y from 'yjs';

import { studyStoreManager } from '@/lib/study/extensions';
import { StudyWorkspace } from '@/lib/study/workspace';
import type { DocSource } from '@blocksuite/sync';

const WORKSPACE = 'study-room';
const PAGE = 'page-1';

/**
 * A page as the first shipped version of the study room wrote it: an
 * `affine:page` root holding an `affine:surface` -- the infinite canvas, which
 * this room no longer draws -- beside a note with one paragraph in it.
 */
function storedPage(): Uint8Array {
  const doc = new Y.Doc({ guid: PAGE });
  const blocks = doc.getMap('blocks');
  const put = (
    id: string,
    flavour: string,
    version: number,
    children: string[],
    props: Record<string, unknown> = {},
  ) => {
    const block = new Y.Map<unknown>();
    block.set('sys:id', id);
    block.set('sys:flavour', flavour);
    block.set('sys:version', version);
    const kids = new Y.Array<string>();
    kids.push(children);
    block.set('sys:children', kids);
    for (const [key, value] of Object.entries(props)) block.set(key, value);
    blocks.set(id, block);
  };

  put('root-1', 'affine:page', 2, ['surface-1', 'note-1'], { 'prop:title': new Y.Text() });
  put('surface-1', 'affine:surface', 5, [], { 'prop:elements': new Y.Map() });
  put('note-1', 'affine:note', 1, ['para-1'], {
    'prop:xywh': '[0,0,498,92]',
    'prop:index': 'a0',
    'prop:displayMode': 'both',
  });
  put('para-1', 'affine:paragraph', 1, [], {
    'prop:type': 'text',
    'prop:text': new Y.Text('what was written before'),
  });

  return Y.encodeStateAsUpdate(doc);
}

/** The workspace meta a room that already has one page carries. */
function storedMeta(): Uint8Array {
  const doc = new Y.Doc({ guid: WORKSPACE });
  const meta = doc.getMap('meta');
  const docs = new Y.Array<Y.Map<unknown>>();
  const entry = new Y.Map<unknown>();
  entry.set('id', PAGE);
  entry.set('title', '');
  entry.set('createDate', Date.now());
  entry.set('tags', new Y.Array());
  docs.push([entry]);
  meta.set('docs', docs);
  meta.set('workspaceVersion', 2);
  meta.set('pageVersion', 2);
  meta.set('blockVersions', new Y.Map());
  doc.getMap('spaces').set(PAGE, new Y.Doc({ guid: PAGE }));
  return Y.encodeStateAsUpdate(doc);
}

const page = storedPage();
const meta = storedMeta();
const pushed: string[] = [];

const source: DocSource = {
  name: 'already-stored',
  pull: async (docId) => {
    if (docId === PAGE) return { data: page };
    if (docId === WORKSPACE) return { data: meta };
    return null;
  },
  push: async (docId) => {
    pushed.push(docId);
  },
  subscribe: () => () => {},
};

(async () => {
  const workspace = new StudyWorkspace({ id: WORKSPACE, docSource: source });
  workspace.storeExtensions = studyStoreManager().get('store');
  workspace.start();
  workspace.meta.initialize();
  await Promise.race([
    workspace.waitForSynced(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);

  const doc = workspace.getDoc(PAGE) ?? workspace.createDoc(PAGE);
  doc.load();
  const store = doc.getStore();

  const flavours = store
    .getBlocksByFlavour(['affine:page', 'affine:surface', 'affine:note', 'affine:paragraph'])
    .map((block) => block.flavour)
    .sort();

  const paragraph = store.getBlocksByFlavour('affine:paragraph')[0];

  console.log(
    JSON.stringify({
      root: store.root?.flavour ?? null,
      flavours,
      text: String((paragraph?.model as { text?: unknown })?.text ?? ''),
    }),
  );

  workspace.forceStop();
  workspace.dispose();
  process.exit(0);
})().catch((cause) => {
  console.log(JSON.stringify({ threw: String(cause).slice(0, 300) }));
  process.exit(0);
});
