// The study room's copy on this device.
//
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS FOR. The room used to keep nothing on the device: every
// page came from the church's database, one request at a time, on every visit.
// So writing done without a signal was held only in the tab, and lost when the
// tab closed; a room could not be opened at all without a connection; and a
// room of forty pages took longer than its eight-second wait to arrive, after
// which opening a page that had not arrived said "Your study room did not
// answer" about a room that was simply still loading.
//
// THE SHAPE AFFiNE ITSELF USES. BlockSuite's sync engine has one MAIN source
// and any number of SHADOW sources. The main one is loaded first and decides
// when the room is ready; the shadows are kept in step behind it, both ways.
// So this is the main source, and the church's database is the shadow: the room
// opens from the device at once, works with no signal, and everything written
// reaches the database whenever there is a connection, in either order.
//
// ONE DATABASE PER PERSON AND ROOM, and every one of them is deleted when that
// person signs out of this device (forgetEveryLocalRoom, called by
// lib/live/kept.ts). A shared tablet must not keep somebody's study notes.
//
// PLAIN INDEXEDDB, not a wrapper library: two object stores and five
// operations do not need one (Ponytail: the platform before a dependency).
// ---------------------------------------------------------------------------

import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';
import type { BlobSource, DocSource } from '@blocksuite/sync';
import { prepareStudyFile } from '@/lib/study/blob-source';

import { localRoomName, rememberLocalRoom } from '@/lib/study/local-names';

const DOCS = 'docs';
const BLOBS = 'blobs';

export { localRoomName };

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This device would not keep the study room.'));
  });
}

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DOCS);
      req.result.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This device would not open its copy of the study room.'));
    // Another tab holds an older version open; it will close, and this waits.
    req.onblocked = () => undefined;
  });
}

/**
 * Whether this browser will keep a copy at all. Some private windows refuse
 * IndexedDB outright; the room then works from the database alone, as it
 * always did, rather than not opening.
 */
export async function canKeepOnThisDevice(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const probe = localRoomName('probe', 'probe');
    const db = await open(probe);
    db.close();
    indexedDB.deleteDatabase(probe);
    return true;
  } catch {
    return false;
  }
}

class LocalRoom {
  private db: Promise<IDBDatabase> | null = null;

  constructor(readonly name: string) {}

  get(): Promise<IDBDatabase> {
    if (!this.db) {
      rememberLocalRoom(this.name);
      this.db = open(this.name);
    }
    return this.db;
  }
}

const rooms = new Map<string, LocalRoom>();
function roomFor(name: string): LocalRoom {
  let room = rooms.get(name);
  if (!room) {
    room = new LocalRoom(name);
    rooms.set(name, room);
  }
  return room;
}

/** Pages on this device: one merged Yjs state per page, as the database keeps them. */
export class LocalDocSource implements DocSource {
  name = 'device';
  private readonly room: LocalRoom;
  private readonly channel: BroadcastChannel | null;

  constructor(ownerId: string, workspaceId: string) {
    this.room = roomFor(localRoomName(ownerId, workspaceId));
    // Two tabs of the same room see each other's writing as it happens.
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(this.room.name);
  }

  async pull(docId: string, state: Uint8Array) {
    const db = await this.room.get();
    const stored = await request(db.transaction(DOCS, 'readonly').objectStore(DOCS).get(docId)) as Uint8Array | undefined;
    if (!stored) return null;
    const diff = state.length ? diffUpdate(stored, state) : stored;
    return { data: diff, state: encodeStateVectorFromUpdate(stored) };
  }

  async push(docId: string, data: Uint8Array): Promise<void> {
    // A last queued change to a page deleted for good would bring it back.
    if (this.forgotten.has(docId)) return;
    const db = await this.room.get();
    await new Promise<void>((resolve, reject) => {
      // Read, merge and write inside ONE transaction, so two pushes in a row
      // cannot each read the old state and the second overwrite the first.
      const tx = db.transaction(DOCS, 'readwrite');
      const store = tx.objectStore(DOCS);
      const read = store.get(docId);
      read.onsuccess = () => {
        const before = read.result as Uint8Array | undefined;
        store.put(before ? mergeUpdates([before, data]) : data, docId);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('This device would not keep that writing.'));
      tx.onabort = () => reject(tx.error ?? new Error('This device would not keep that writing.'));
    });
    this.channel?.postMessage({ docId, update: data });
  }

  subscribe(cb: (docId: string, data: Uint8Array) => void): () => void {
    if (!this.channel) return () => {};
    const onMessage = (event: MessageEvent<{ docId?: string; update?: Uint8Array }>) => {
      if (typeof event.data?.docId === 'string' && event.data.update) cb(event.data.docId, event.data.update);
    };
    this.channel.addEventListener('message', onMessage);
    return () => this.channel?.removeEventListener('message', onMessage);
  }

  private readonly forgotten = new Set<string>();

  /** A page deleted for good leaves nothing on the device. */
  async forget(docId: string): Promise<void> {
    this.forgotten.add(docId);
    const db = await this.room.get();
    await request(db.transaction(DOCS, 'readwrite').objectStore(DOCS).delete(docId));
  }
}

/** Pictures and files on this device, by the same keys the database uses. */
export class LocalBlobSource implements BlobSource {
  name = 'device';
  readonly = false;
  private readonly room: LocalRoom;

  constructor(ownerId: string, workspaceId: string) {
    this.room = roomFor(localRoomName(ownerId, workspaceId));
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.room.get();
    const row = await request(db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(key)) as
      { bytes: ArrayBuffer; mime: string } | undefined;
    return row ? new Blob([row.bytes], { type: row.mime }) : null;
  }

  async set(key: string, value: Blob): Promise<string> {
    // THE SAME PREPARATION AS THE DATABASE'S, HERE FIRST. The engine waits for
    // this source and sends to the database afterwards in the background, where
    // a refusal is never shown. So a photo is made small, loses where it was
    // taken, and a file too large is refused HERE, where the person sees why.
    const ready = await prepareStudyFile(value);
    const db = await this.room.get();
    await request(db.transaction(BLOBS, 'readwrite').objectStore(BLOBS)
      .put({ bytes: await ready.arrayBuffer(), mime: ready.type || 'application/octet-stream' }, key));
    return key;
  }

  async delete(key: string): Promise<void> {
    const db = await this.room.get();
    await request(db.transaction(BLOBS, 'readwrite').objectStore(BLOBS).delete(key));
  }

  async list(): Promise<string[]> {
    const db = await this.room.get();
    const keys = await request(db.transaction(BLOBS, 'readonly').objectStore(BLOBS).getAllKeys());
    return keys.map(String);
  }
}

// --------------------------------------------------------------------------
// A deletion the database missed. "Delete forever" while offline removes the
// page here at once; the database is told the next time the room opens with a
// connection, so the promise holds on every device.
// --------------------------------------------------------------------------
const toForgetKey = (ownerId: string) => `beacon.study-forget:${ownerId}`;

export function rememberToForget(ownerId: string, docId: string) {
  try {
    const list = JSON.parse(localStorage.getItem(toForgetKey(ownerId)) || '[]') as string[];
    if (!list.includes(docId)) localStorage.setItem(toForgetKey(ownerId), JSON.stringify([...list, docId]));
  } catch { /* nowhere to remember it: the page is already gone from the list */ }
}

export async function forgetWhatWasMissed(ownerId: string, remote: { forget: (docId: string) => Promise<void> }) {
  let list: string[] = [];
  try { list = JSON.parse(localStorage.getItem(toForgetKey(ownerId)) || '[]') as string[]; } catch { return; }
  const left: string[] = [];
  for (const docId of list) {
    try { await remote.forget(docId); } catch { left.push(docId); }
  }
  try {
    if (left.length) localStorage.setItem(toForgetKey(ownerId), JSON.stringify(left));
    else localStorage.removeItem(toForgetKey(ownerId));
  } catch { /* tried again next time */ }
}
