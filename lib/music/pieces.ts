'use client';

// The Music room's pieces, kept on this device: clean pages made by the
// scanner, and score files. A store of its own (IndexedDB "beacon-music"),
// apart from My Files, so a choir's pages do not fill somebody's media list
// and My Files stays exactly as it was. Nothing here is uploaded.
//
// THE BYTES ARE STORED, NOT THE BLOB. WebKit will not put a Blob into
// IndexedDB at all, and says so with a null error: lib/localMedia.ts found
// that the hard way and tests/e2e/webkit-idb-probe.js proves it. This store
// first went out storing Blobs, and on Safari no score or page could be kept
// (the Safari walk of 4 October 2026). So: an ArrayBuffer and its type, put
// back together as a Blob on the way out.

import { uuid } from '@/lib/uuid';

const DB_NAME = 'beacon-music';
const META = 'pieces';
const BLOBS = 'blobs';
const VERSION = 1;

export type PieceKind = 'page' | 'score';

export interface Piece {
  id: string;
  kind: PieceKind;
  title: string;
  /** image/png for a page; text/xml for a score (kept as its MusicXML text). */
  mime: string;
  size: number;
  created_at: string;
}

/** A clean page is a few hundred KB; a score's text a few hundred. */
export const MAX_PIECE_BYTES = 12 * 1024 * 1024;
/** Enough for a choir's whole folder, few enough that a runaway loop cannot fill a phone. */
export const MAX_PIECES = 500;

export class PieceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PieceError';
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredBytes {
  bytes: ArrayBuffer;
  mime: string;
}

/** One transaction over both stores; resolves when it has committed. */
function run<T>(mode: IDBTransactionMode, work: (meta: IDBObjectStore, blobs: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction([META, BLOBS], mode);
    const req = work(t.objectStore(META), t.objectStore(BLOBS));
    let result: T | undefined;
    if (req) req.onsuccess = () => { result = req.result; };
    // WebKit aborts with a null error: always reject with a sentence.
    const why = () => t.error ?? new PieceError('This phone would not keep it.');
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(why()); };
    t.onabort = () => { db.close(); reject(why()); };
  }));
}

export async function listPieces(): Promise<Piece[]> {
  const all = (await run<Piece[]>('readonly', (meta) => meta.getAll())) ?? [];
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function savePiece(kind: PieceKind, title: string, blob: Blob): Promise<Piece> {
  if (blob.size > MAX_PIECE_BYTES) throw new PieceError('This is larger than the room keeps on a phone.');
  if ((await listPieces()).length >= MAX_PIECES) throw new PieceError(`The room already keeps ${MAX_PIECES} pieces on this phone. Delete some first.`);
  const piece: Piece = {
    id: uuid(),
    kind,
    title: title.replace(/\s+/g, ' ').trim().slice(0, 80) || (kind === 'page' ? 'Scanned page' : 'Untitled piece'),
    mime: blob.type || (kind === 'page' ? 'image/png' : 'text/xml'),
    size: blob.size,
    created_at: new Date().toISOString(),
  };
  // Read before the transaction opens: one idle await inside it and it closes.
  const stored: StoredBytes = { bytes: await blob.arrayBuffer(), mime: piece.mime };
  await run('readwrite', (meta, blobs) => { meta.put(piece); blobs.put(stored, piece.id); });
  return piece;
}

export async function pieceBlob(id: string): Promise<Blob | undefined> {
  const stored = await run<StoredBytes | Blob>('readonly', (_meta, blobs) => blobs.get(id));
  if (!stored) return undefined;
  if (stored instanceof Blob) return stored;
  return stored.bytes ? new Blob([stored.bytes], { type: stored.mime || '' }) : undefined;
}

export async function deletePiece(id: string): Promise<void> {
  await run('readwrite', (meta, blobs) => { meta.delete(id); blobs.delete(id); });
}
