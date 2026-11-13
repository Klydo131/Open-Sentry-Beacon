// Where the tutorial's study room keeps its pages: nowhere.
//
// ---------------------------------------------------------------------------
// WHY THE TUTORIAL NEEDS ITS OWN. The real study room writes to `study_docs`
// through SupabaseDocSource, which needs a signed-in person and their own row.
// The tutorial has neither: it runs on sample data with no session at all, and
// `db()` throws there rather than returning a client. So somebody walking
// through the demo would meet the one room that errors instead of opening.
//
// AND WHY IT FORGETS ON PURPOSE. The obvious alternative is IndexedDB, which
// BlockSuite already ships a source for, and it would make the demo feel more
// real by remembering what somebody typed. It would also leave a database on
// the machine of a person who was only looking -- and this project has a check,
// tutorial-leaves-nothing-behind, for exactly that habit. A walkthrough should
// not install anything.
//
// So: a Map that lives as long as the page does. Type in the demo and it
// behaves like the real editor; leave, and nothing of yours stayed.
// ---------------------------------------------------------------------------

import { mergeUpdates, diffUpdate, encodeStateVectorFromUpdate } from 'yjs';
import type { DocSource } from '@blocksuite/sync';

export class MemoryDocSource implements DocSource {
  name = 'memory';

  private readonly pages = new Map<string, Uint8Array>();

  pull(docId: string, state: Uint8Array) {
    const update = this.pages.get(docId);
    if (!update) return null;
    // The same diffing the real source does, so the tutorial exercises the same
    // path rather than a simplified one that hides a bug.
    const data = state.length ? diffUpdate(update, state) : update;
    return { data, state: encodeStateVectorFromUpdate(update) };
  }

  push(docId: string, data: Uint8Array) {
    const existing = this.pages.get(docId);
    this.pages.set(docId, existing ? mergeUpdates([existing, data]) : data);
  }

  /** Nothing else is writing, so there is nothing to hear. */
  subscribe(): () => void {
    return () => {};
  }
}
