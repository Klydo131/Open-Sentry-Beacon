'use client';

// Photos and a short clip on a post, kept on the device.
//
// ASKED FOR (7 October 2026): "writing blog post should be easy with added
// features like photos and videos", and then: "Samples should really feel like
// they are using the app, like they can see the photos and videos, can share".
// The sample church has no server, so a post's photos and clip live in this
// browser, in a store of their own (not the music player's, which lists every
// file it holds), and a post refers to each by `device:<id>`.
//
// THE SAME RULES AS A REAL CHURCH'S UPLOAD, so the sample teaches the real
// thing: a photo is shrunk to about 1600 pixels and loses its location before
// it is kept (lib/live/shrink-image.ts, the path every photo in the app takes);
// a clip is one per post, at most 50 MB and about a minute and a quarter.

import { shrinkImage } from '@/lib/live/shrink-image';
import { uuid } from '@/lib/uuid';
import { useEffect, useState } from 'react';

const DB_NAME = 'beacon-post-media';
const STORE = 'files';

/** Ten files on one post, one of them a clip. The database keeps the same. */
export const POST_FILES_MOST = 10;
export const CLIP_MOST_BYTES = 50 * 1024 * 1024;
export const CLIP_MOST_SECONDS = 75;

const DEVICE = 'device:';
export const isDeviceSrc = (src: string) => src.startsWith(DEVICE);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}


/** Keep a file on this device; returns what the post stores. */
export async function keepPostFile(file: Blob): Promise<string> {
  const id = uuid();
  await run('readwrite', (store) => store.put(file, id));
  return `${DEVICE}${id}`;
}

export async function readPostFile(src: string): Promise<Blob | undefined> {
  if (!isDeviceSrc(src)) return undefined;
  return run<Blob | undefined>('readonly', (store) => store.get(src.slice(DEVICE.length)) as IDBRequest<Blob | undefined>);
}

export async function forgetPostFile(src: string): Promise<void> {
  if (!isDeviceSrc(src)) return;
  await run('readwrite', (store) => store.delete(src.slice(DEVICE.length)));
}

/**
 * Something an <img> or a <video> can show: a kept file becomes an object URL
 * for as long as the component that asked is on screen; anything else is
 * returned as it is. Null while a kept file is still being read.
 */
export function usePostMediaUrl(src: string): string | null {
  const [url, setUrl] = useState<string | null>(isDeviceSrc(src) ? null : src);
  useEffect(() => {
    if (!isDeviceSrc(src)) { setUrl(src); return; }
    let made: string | null = null;
    let alive = true;
    void readPostFile(src).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    }).catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return url;
}

/** A photo made ready to keep: about 1600 pixels across, with no location in it. */
export async function readyPhoto(file: File): Promise<File> {
  return shrinkImage(file);
}

/** How long a clip runs, in seconds; Infinity when the browser cannot tell. */
export function clipSeconds(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (seconds: number) => { URL.revokeObjectURL(url); resolve(seconds); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : Infinity);
    video.onerror = () => done(Infinity);
    video.src = url;
  });
}

/** Why a clip cannot go on a post, in words for the person who chose it, or '' when it can. */
export async function clipProblem(file: File): Promise<string> {
  if (!file.type.startsWith('video/')) return 'That is not a video.';
  if (file.size > CLIP_MOST_BYTES) {
    return `That video is ${Math.round(file.size / 1024 / 1024)} MB. A post takes a short clip of up to 50 MB; for anything longer, share a YouTube or Facebook link in the post instead.`;
  }
  const seconds = await clipSeconds(file);
  if (seconds > CLIP_MOST_SECONDS && Number.isFinite(seconds)) {
    return `That video runs ${Math.round(seconds)} seconds. A post takes a clip of about a minute; for anything longer, share a YouTube or Facebook link in the post instead.`;
  }
  return '';
}
