// The study room's four promises, held against the real engine.
//
// ---------------------------------------------------------------------------
// Run by tests/a-study-room-keeps-its-promises.mjs. Each promise here was
// broken in the room until 20 October 2026 and is checked as the engine runs
// it: the real StudyWorkspace and DocEngine, the real SupabaseDocSource
// talking to a stand-in for the study_docs table, and a stand-in for this
// device's copy (IndexedDB is not in Node; lib/study/local-source.ts keeps
// the same contract, and the browser walks use the real one).
//
//   1. Deleted for good is gone: from the list, the device and the database,
//      and a new first page does not bring the old writing back.
//   2. Writing done with no connection is kept on the device and reaches the
//      database when the connection comes back.
//   3. A device that has never held the room gets each page as it is asked
//      for, the one being opened first, instead of all or nothing.
//   4. A picture leaves with the last page that shows it, and not before.
// ---------------------------------------------------------------------------

import * as Y from 'yjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlobSource, DocSource } from '@blocksuite/sync';
import { Text } from '@blocksuite/store';

import { studyStoreManager } from '@/lib/study/extensions';
import { StudyWorkspace, picturesIn } from '@/lib/study/workspace';
import { STUDY_ROOM, SupabaseDocSource } from '@/lib/study/doc-source';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(test: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(50);
  }
  return test();
}

// --------------------------------------------------- the database, stood in ----
type Row = { owner_id: string; workspace_id: string; doc_id: string; state: string; version: number };

class Table {
  rows: Row[] = [];
  offline = false;
  delayMs = 0;
  reads: string[] = [];
}

/** Just enough of supabase-js's query builder for SupabaseDocSource. */
function clientFor(table: Table): SupabaseClient {
  const from = () => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let values: Partial<Row> = {};
    const filters: Array<[keyof Row, unknown]> = [];
    const match = () => table.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = async () => {
      if (table.delayMs) await sleep(table.delayMs);
      if (table.offline) return { data: null, error: { message: 'Failed to fetch' } };
      if (op === 'insert') {
        const row = values as Row;
        if (table.rows.some((r) => r.owner_id === row.owner_id && r.workspace_id === row.workspace_id && r.doc_id === row.doc_id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        table.rows.push({ ...row, version: 1 });
        return { data: null, error: null };
      }
      if (op === 'update') {
        const hit = match();
        for (const r of hit) Object.assign(r, values);
        return { data: hit.map((r) => ({ doc_id: r.doc_id })), error: null };
      }
      if (op === 'delete') {
        const hit = new Set(match());
        table.rows = table.rows.filter((r) => !hit.has(r));
        return { data: null, error: null };
      }
      const docId = filters.find(([k]) => k === 'doc_id')?.[1] as string;
      table.reads.push(docId);
      const row = match()[0];
      return { data: row ? { state: row.state, version: row.version } : null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: keyof Row, v: unknown) => { filters.push([k, v]); return chain; },
      maybeSingle: run,
      insert: (v: Partial<Row>) => { op = 'insert'; values = v; return run(); },
      update: (v: Partial<Row>) => { op = 'update'; values = v; return chain; },
      delete: () => { op = 'delete'; return chain; },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

// ----------------------------------------------- this device, stood in ----
/** The contract of LocalDocSource, in memory: merged state per page, and forget. */
class DeviceCopy implements DocSource {
  name = 'device';
  readonly pages = new Map<string, Uint8Array>();
  private readonly forgotten = new Set<string>();
  async pull(docId: string, state: Uint8Array) {
    const stored = this.pages.get(docId);
    if (!stored) return null;
    return { data: state.length ? Y.diffUpdate(stored, state) : stored, state: Y.encodeStateVectorFromUpdate(stored) };
  }
  async push(docId: string, data: Uint8Array) {
    if (this.forgotten.has(docId)) return;
    const before = this.pages.get(docId);
    this.pages.set(docId, before ? Y.mergeUpdates([before, data]) : data);
  }
  subscribe() { return () => {}; }
  async forget(docId: string) { this.forgotten.add(docId); this.pages.delete(docId); }
}

class Pictures implements BlobSource {
  name = 'pictures';
  readonly = false;
  readonly kept = new Map<string, Blob>();
  async get(key: string) { return this.kept.get(key) ?? null; }
  async set(key: string, value: Blob) { this.kept.set(key, value); return key; }
  async delete(key: string) { this.kept.delete(key); }
  async list() { return [...this.kept.keys()]; }
}

/** The words written on a page, read back from its blocks. */
function wordsOn(spaceDoc: Y.Doc): string {
  const out: string[] = [];
  (spaceDoc.getMap('blocks') as Y.Map<Y.Map<unknown>>).forEach((b) => {
    const t = b.get?.('prop:text');
    if (t instanceof Y.Text) out.push(t.toString());
  });
  return out.join(' ');
}

const decode = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
function rowText(table: Table, docId: string): string {
  const row = table.rows.find((r) => r.doc_id === docId);
  if (!row) return '';
  const d = new Y.Doc();
  Y.applyUpdate(d, decode(row.state));
  return wordsOn(d);
}

function openRoom(table: Table, device: DeviceCopy, blobs?: { device: Pictures; db: Pictures }) {
  const remote = new SupabaseDocSource(clientFor(table), 'owner-1', STUDY_ROOM);
  const room = new StudyWorkspace({
    id: STUDY_ROOM,
    docSource: device,
    shadowSources: [remote],
    blobSource: blobs?.device,
    shadowBlobs: blobs ? [blobs.db] : [],
  });
  room.storeExtensions = studyStoreManager().get('store');
  room.start();
  return { room, remote };
}

function write(room: StudyWorkspace, words: string, picture?: string) {
  const doc = room.createDoc();
  doc.load();
  const store = doc.getStore();
  const rootId = store.addBlock('affine:page', {});
  store.addBlock('affine:surface', {}, rootId);
  const noteId = store.addBlock('affine:note', {}, rootId);
  store.addBlock('affine:paragraph', { text: new Text(words) }, noteId);
  if (picture) store.addBlock('affine:image', { sourceId: picture }, noteId);
  return doc.id;
}

(async () => {
  const result: Record<string, unknown> = {};

  // 1 ---------------------------------------------------- deleted is gone ----
  {
    const table = new Table();
    const device = new DeviceCopy();
    const { room } = openRoom(table, device);
    await room.waitForMain();
    room.meta.initialize();
    const id = write(room, 'a private prayer');
    await until(() => rowText(table, id).includes('a private prayer'), 5000);
    result.writtenReachesDatabase = rowText(table, id).includes('a private prayer');
    result.writtenOnDevice = device.pages.has(id);

    const missed = await room.deleteForever(id);
    await sleep(300);
    result.deleteReportsNothingMissed = missed.length === 0;
    result.deletedFromList = !room.meta.getDocMeta(id);
    result.deletedFromDevice = !device.pages.has(id);
    result.deletedFromDatabase = !table.rows.some((r) => r.doc_id === id);

    // A second device, opened afterwards, never sees the words again.
    const second = openRoom(table, new DeviceCopy());
    await second.room.waitForRemoteList();
    await sleep(500);
    second.room.meta.initialize();
    const anywhere = [...second.room.docs.values()].map((d) => { d.load(); return wordsOn(d.spaceDoc); }).join(' ');
    result.neverComesBack = !anywhere.includes('a private prayer') && !table.rows.some((r) => rowText(table, r.doc_id).includes('a private prayer'));
    room.forceStop();
    second.room.forceStop();
  }

  // 2 ------------------------------------------- kept with no connection ----
  {
    const table = new Table();
    table.offline = true;
    const device = new DeviceCopy();
    const { room } = openRoom(table, device);
    await room.waitForMain();
    room.meta.initialize();
    const id = write(room, 'written on the bus');
    await sleep(400);
    result.offlineKeptOnDevice = (() => {
      const d = new Y.Doc();
      const stored = device.pages.get(id);
      if (stored) Y.applyUpdate(d, stored);
      return wordsOn(d).includes('written on the bus');
    })();
    result.offlineSaysWaiting = room.saveState() === 'waiting' || room.saveState() === 'saving';
    result.offlineNothingInDatabase = !table.rows.some((r) => r.doc_id === id);
    table.offline = false;
    // The engine tries the database again on its own (every few seconds).
    result.reachesDatabaseWhenBack = await until(() => rowText(table, id).includes('written on the bus'), 15000);
    result.saysSavedWhenBack = await until(() => room.saveState() === 'saved', 5000);
    room.forceStop();
  }

  // 3 ------------------------------------ one page first, the rest behind ----
  {
    const table = new Table();
    const first = openRoom(table, new DeviceCopy());
    await first.room.waitForMain();
    first.room.meta.initialize();
    const ids: string[] = [];
    for (let i = 0; i < 40; i += 1) ids.push(write(first.room, `page number ${i}`));
    await until(() => ids.every((id) => rowText(table, id).includes('page number')), 20000);
    first.room.forceStop();

    table.delayMs = 120;
    table.reads = [];
    const fresh = openRoom(table, new DeviceCopy());
    await fresh.room.waitForRemoteList();
    fresh.room.meta.initialize();
    result.freshDeviceSeesTheList = fresh.room.meta.docMetas.length === 40;
    const wanted = ids[29];
    fresh.room.putFirst(wanted);
    const started = Date.now();
    const page = fresh.room.getDoc(wanted);
    page?.load();
    const arrived = await until(() => !!page && wordsOn(page.spaceDoc).includes('page number 29'), 10000);
    result.askedForPageArrives = arrived;
    result.askedForPageArrivesBeforeMost = arrived && fresh.remote.answered.size < 30;
    result.askedForPageMs = Date.now() - started;
    result.answeredMarksThePage = fresh.remote.answered.has(wanted);
    fresh.room.forceStop();
  }

  // 4 ------------------------------------------------------------ pictures ----
  {
    const table = new Table();
    const blobs = { device: new Pictures(), db: new Pictures() };
    const { room } = openRoom(table, new DeviceCopy(), blobs);
    await room.waitForMain();
    room.meta.initialize();
    for (const key of ['shared-key', 'only-key']) {
      await blobs.device.set(key, new Blob(['x']));
      await blobs.db.set(key, new Blob(['x']));
    }
    const a = write(room, 'page with two pictures', 'only-key');
    const docA = room.getDoc(a);
    const storeA = docA?.getStore();
    const noteA = storeA?.getBlocksByFlavour('affine:note')[0];
    if (storeA && noteA) storeA.addBlock('affine:image', { sourceId: 'shared-key' }, noteA.id);
    write(room, 'page sharing a picture', 'shared-key');
    result.picturesAreFound = docA ? picturesIn(docA.spaceDoc).sort().join(',') === 'only-key,shared-key' : false;
    await until(() => room.everythingLoaded(), 5000);
    await room.deleteForever(a);
    result.onlyPictureGoes = !blobs.device.kept.has('only-key') && !blobs.db.kept.has('only-key');
    result.sharedPictureStays = blobs.device.kept.has('shared-key') && blobs.db.kept.has('shared-key');
    room.forceStop();
  }

  console.log(JSON.stringify(result));
  process.exit(0);
})().catch((cause) => {
  console.log(JSON.stringify({ threw: String(cause?.stack || cause).slice(0, 600) }));
  process.exit(0);
});
