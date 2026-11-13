'use client';

// On-device media storage. Files never leave the browser.

import type { MaterialType } from './types';
import { uuid } from './uuid';

const DB_NAME = 'beacon-media';
const META = 'meta';
const BLOBS = 'blobs';
const VERSION = 1;

export type MediaType = MaterialType;
export type PlayableMediaType = 'audio' | 'video';

export interface MediaMeta {
  id: string;
  title: string;
  type: MediaType;
  note?: string;
  external_url?: string;
  mime?: string;
  size: number;
  created_at: string;
  width?: number;
  height?: number;
  duration?: number;
}

export class LocalMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalMediaError';
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

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        let result!: T;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => { db.close(); resolve(result); };
        transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      }),
  );
}

export function typeFromMime(mime: string): MediaType {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'pdf';
}

export function newMediaId(): string {
  // Not crypto.randomUUID() directly: that is a secure-context API and is
  // undefined over plain http on a LAN address, so attaching a file threw
  // rather than degraded. The fallback used to be Math.random(), which worked
  // but produced something that only looked like an id. See lib/uuid.ts.
  return uuid();
}

export function resolutionLabel(width?: number, height?: number): string {
  if (!width || !height) return '';
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const tier = long >= 3840 && short >= 2160
    ? '4K'
    : long >= 1920 && short >= 1080
      ? '1080p'
      : long >= 1280 && short >= 720
        ? 'HD'
        : '';
  return `${tier ? `${tier} · ` : ''}${width}×${height}`;
}

export async function prepareMediaStorage(bytes: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage) return;
  try { await navigator.storage.persist?.(); } catch {}
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (
      typeof quota === 'number' &&
      typeof usage === 'number' &&
      bytes > Math.max(0, quota - usage - 1024 * 1024)
    ) {
      throw new LocalMediaError(
        'Not enough device storage. Free some space or choose a smaller file.',
      );
    }
  } catch (error) {
    if (error instanceof LocalMediaError) throw error;
    // Estimates are optional; the atomic IndexedDB write is authoritative.
  }
}

export function inspectPlayableMedia(
  file: File,
  expected: PlayableMediaType,
): Promise<Pick<MediaMeta, 'width' | 'height' | 'duration'>> {
  return new Promise((resolve, reject) => {
    const media = document.createElement('video');
    const url = URL.createObjectURL(file);
    let metadata: Pick<MediaMeta, 'width' | 'height' | 'duration'> = {};
    let settled = false;
    const message = expected === 'video'
      ? 'This video cannot play here. Try an MP4 with H.264 video and AAC audio.'
      : 'This audio cannot play here. Try MP3, M4A, or WAV.';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      media.onloadedmetadata = null;
      media.oncanplay = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(metadata);
    };
    const timer = setTimeout(() => finish(new LocalMediaError(message)), 20_000);
    media.preload = 'auto';
    media.muted = true;
    media.onloadedmetadata = () => {
      if (expected === 'video' && (!media.videoWidth || !media.videoHeight)) {
        finish(new LocalMediaError(message));
        return;
      }
      metadata = {
        ...(media.videoWidth && media.videoHeight
          ? { width: media.videoWidth, height: media.videoHeight }
          : {}),
        ...(Number.isFinite(media.duration) && media.duration > 0
          ? { duration: media.duration }
          : {}),
      };
    };
    media.oncanplay = () => finish();
    media.onerror = () => finish(new LocalMediaError(message));
    media.src = url;
    media.load();
  });
}

// Metadata and bytes commit together, so a quota failure cannot leave a ghost.
/**
 * What actually goes into the blobs store.
 *
 * NOT A BLOB, AND THIS IS THE WHOLE FIX. WebKit will not put a Blob or a File
 * into IndexedDB at all. Not one backed by a file on disk, not one built in
 * memory, not a plain `new Blob([bytes])`. The transaction errors, and it
 * errors with `transaction.error === null`, so the only thing the app could
 * report was "could not be saved: null".
 *
 * That is what broke attachments on Safari and iOS completely: chat-order,
 * media-and-realtime and mobile-devices were the only three suites that failed
 * on WebKit and passed on Chromium, and every one of them was this.
 *
 * It took an instrument to find, because the obvious fix is wrong. Converting
 * the File to a Blob first looks like the answer and changes nothing, since
 * WebKit refuses that too. tests/e2e/webkit-idb-probe.js asks the engine
 * directly which shapes survive: ArrayBuffer and Uint8Array do, everything
 * Blob-shaped does not.
 *
 * So the bytes are stored raw with their type beside them, and getBlob() puts
 * the Blob back together on the way out. Every caller still receives a Blob and
 * none of them changed.
 *
 * HONEST SCOPE. This was proven against Playwright's WebKit, which is the
 * engine behind Safari but not Safari itself; a current Safari may well store
 * Blobs happily. It does not matter. An ArrayBuffer is stored correctly by
 * every engine there is, so this is the portable shape either way, and it also
 * covers the older Safari versions that had their own Blob-in-IndexedDB bugs.
 */
interface StoredBytes {
  bytes: ArrayBuffer;
  mime: string;
}

/** Bytes handed to putMedia that are not in the store yet. See putMedia. */
const pending = new Map<string, Blob>();

export async function putMedia(meta: MediaMeta, blob?: Blob): Promise<void> {
  // FIRST STATEMENT, BEFORE ANY await, AND THAT ORDERING IS THE POINT.
  //
  // attachMedia adds the row optimistically and THEN calls this. <Attachment>
  // mounts on that row and asks for the bytes straight away, so the read races
  // the write -- and it is a race the reader can only lose, because the effect
  // runs once per id and latches "file not on this device" for ever when it
  // comes back empty.
  //
  // The race was always there and was won by luck, because the write used to be
  // quick. Reading the bytes out first added an await and the reader started
  // winning, which is what turned a WebKit-only bug into a Chromium one as well.
  //
  // Registering here, synchronously, means the entry exists before React can
  // run a single effect. An earlier attempt at this registered AFTER the
  // arrayBuffer await, which left the exact window it was meant to close.
  if (blob) pending.set(meta.id, blob);

  try {
  // Read the bytes out before opening the transaction. An IndexedDB
  // transaction closes itself the moment it goes idle, and awaiting anything
  // inside one is how it ends up aborting for reasons that have nothing to do
  // with the data.
  const stored: StoredBytes | undefined = blob
    ? { bytes: await blob.arrayBuffer(), mime: blob.type || 'application/octet-stream' }
    : undefined;

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(stored ? [META, BLOBS] : [META], 'readwrite');
    transaction.objectStore(META).put(meta);
    if (stored) transaction.objectStore(BLOBS).put(stored, meta.id);
    // WebKit sets `transaction.error` to null when it aborts, so rejecting with
    // it alone produced the useless "could not be saved: null" that cost a CI
    // run to interpret. Always reject with something readable.
    const why = (stage: string) =>
      transaction.error ?? new Error(`IndexedDB ${stage} while saving ${meta.id}`);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(why('errored')); };
    transaction.onabort = () => { db.close(); reject(why('aborted')); };
  });
  } finally {
    // Written: the store is authoritative. Failed: the caller rolls the row
    // back. Either way nothing should go on holding these bytes in memory.
    pending.delete(meta.id);
  }
}

export async function listMedia(): Promise<MediaMeta[]> {
  const all = await tx<MediaMeta[]>(META, 'readonly', (store) => store.getAll());
  return (all ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  // Still on its way to the store? Answer from memory. Without this the
  // optimistic row that attachMedia just added reads back empty and latches.
  const inflight = pending.get(id);
  if (inflight) return inflight;

  const stored = await tx<StoredBytes | Blob | undefined>(
    BLOBS, 'readonly', (store) => store.get(id),
  );
  if (!stored) return undefined;

  // Written by a version that stored Blobs directly. Anyone who already has
  // attachments on their device has these, and they must keep working: a fix
  // that silently emptied the media library would be worse than the bug.
  // File extends Blob, so this covers both.
  if (stored instanceof Blob) return stored;

  if (stored.bytes) return new Blob([stored.bytes], { type: stored.mime || '' });
  return undefined;
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META, BLOBS], 'readwrite');
    transaction.objectStore(META).delete(id);
    transaction.objectStore(BLOBS).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export function humanSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
