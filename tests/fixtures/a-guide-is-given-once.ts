// The Getting Started page is given once, and not put back after it is deleted.
//
// ---------------------------------------------------------------------------
// Run by tests/a-guide-is-given-once.mjs, which bundles this with esbuild and
// runs it in Node.
//
// WHY IT CANNOT BE A BROWSER WALK. The only study room a walk can reach is the
// walkthrough's, and the walkthrough keeps its pages in memory: reload and the
// whole room is new. So a walk that deletes the guide, reloads, and finds the
// guide back has proved nothing -- it would pass on the bug and fail on the
// fix. The question "does a room that REMEMBERS put it back" can only be asked
// against a room that remembers, which is this.
//
// Three rooms are opened here: one that has never been guided, one that has,
// and one whose database has not answered yet.
// ---------------------------------------------------------------------------

import * as Y from 'yjs';

import { studyStoreManager } from '@/lib/study/extensions';
import { StudyWorkspace } from '@/lib/study/workspace';
import { GUIDE_PAGE, giveTheGuideOnce } from '@/lib/study/getting-started';
import type { DocSource } from '@blocksuite/sync';

const WORKSPACE = 'study-room';

/** A room's stored meta: a page list, and whether it has had its guide. */
function storedMeta(guided: boolean): Uint8Array {
  const doc = new Y.Doc({ guid: WORKSPACE });
  const meta = doc.getMap('meta');
  const pages = new Y.Array<Y.Map<unknown>>();
  const entry = new Y.Map<unknown>();
  entry.set('id', 'page-1');
  entry.set('title', 'Romans');
  entry.set('createDate', Date.now());
  entry.set('tags', new Y.Array());
  pages.push([entry]);
  meta.set('pages', pages);
  // THE FLAG, WRITTEN THE WAY THE APP WRITES IT. If this key ever stops
  // matching what StudyMeta reads, this fixture is a green test with no
  // subject, which is a mistake this repo has already made once.
  if (guided) meta.set('guided', true);
  meta.set('workspaceVersion', 2);
  meta.set('pageVersion', 2);
  meta.set('blockVersions', new Y.Map());
  doc.getMap('spaces').set('page-1', new Y.Doc({ guid: 'page-1' }));
  return Y.encodeStateAsUpdate(doc);
}

function sourceFor(bytes: Uint8Array | null): DocSource {
  return {
    name: 'a-room-that-remembers',
    pull: async (docId) => (docId === WORKSPACE && bytes ? { data: bytes } : null),
    push: async () => {},
    subscribe: () => () => {},
  };
}

async function openIt(guided: boolean, arrived: boolean) {
  const workspace = new StudyWorkspace({
    id: WORKSPACE,
    docSource: sourceFor(storedMeta(guided)),
  });
  workspace.storeExtensions = studyStoreManager().get('store');
  workspace.start();
  await Promise.race([
    workspace.waitForSynced(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  workspace.meta.initialize();

  const wrote = giveTheGuideOnce(workspace, arrived);
  const ids = workspace.meta.docMetas.map((m) => m.id);
  const guide = workspace.getDoc(GUIDE_PAGE);
  let blocks = 0;
  if (guide) {
    guide.load();
    blocks = guide.getStore().getBlocksByFlavour(
      ['affine:paragraph', 'affine:list', 'affine:divider'],
    ).length;
  }

  const answer = {
    wrote,
    guidedAfter: workspace.meta.guided,
    hasGuidePage: ids.includes(GUIDE_PAGE),
    pages: ids.length,
    blocks,
  };
  workspace.forceStop();
  workspace.dispose();
  return answer;
}

(async () => {
  const fresh = await openIt(false, true);
  const already = await openIt(true, true);
  const waiting = await openIt(false, false);

  // AND TWICE IN ONE SESSION, which is the case a reload cannot reach: the
  // room is already open and something calls it again.
  const workspace = new StudyWorkspace({
    id: WORKSPACE, docSource: sourceFor(storedMeta(false)),
  });
  workspace.storeExtensions = studyStoreManager().get('store');
  workspace.start();
  await Promise.race([
    workspace.waitForSynced(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  workspace.meta.initialize();
  const first = giveTheGuideOnce(workspace, true);
  const second = giveTheGuideOnce(workspace, true);
  const pagesAfterTwo = workspace.meta.docMetas.length;
  workspace.forceStop();
  workspace.dispose();

  console.log(JSON.stringify({
    fresh, already, waiting,
    twice: { first, second, pagesAfterTwo },
  }));
  process.exit(0);
})().catch((cause) => {
  console.log(JSON.stringify({ threw: String(cause).slice(0, 300) }));
  process.exit(0);
});
