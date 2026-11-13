'use client';

// Photos and a short clip on a post: choosing them, and showing them.
//
// Shared by every writing box and every place a post is read, so a photo looks
// the same on Home's billboard, in the open post and in the Blog folder. A
// `src` may be an ordinary address or a file kept on this device
// (`device:<id>`, lib/post-media.ts); these components show either.

import { useRef, useState } from 'react';
import type { PostMedia } from '@/lib/types';
import {
  POST_FILES_MOST,
  clipProblem,
  forgetPostFile,
  keepPostFile,
  readyPhoto,
  usePostMediaUrl,
} from '@/lib/post-media';

export function PostPhoto({ media, className = '', lazy = false }: { media: PostMedia; className?: string; lazy?: boolean }) {
  const url = usePostMediaUrl(media.src);
  if (!url) return <span className={`block animate-pulse bg-gray-100 ${className}`} aria-hidden />;
  return (
    // A plain <img>: the picture is the church's own or the device's, already
    // small, and next/image would need every storage address configured.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={media.alt ?? ''} loading={lazy ? 'lazy' : undefined} decoding="async" className={className} />
  );
}

export function PostClip({ media, className = '', still = false }: { media: PostMedia; className?: string; still?: boolean }) {
  const url = usePostMediaUrl(media.src);
  if (!url) return <span className={`block animate-pulse bg-gray-900 ${className}`} aria-hidden />;
  return still
    // The clip's first frame, silent, until the post is opened.
    ? <video src={url} muted playsInline preload="metadata" className={className} aria-hidden />
    : <video src={url} controls playsInline preload="metadata" className={className} />;
}

/** Every photo and the clip, in the order they were added, as an open post shows them. */
export function PostGallery({ media }: { media?: PostMedia[] }) {
  if (!media?.length) return null;
  return (
    <div className="space-y-3" data-post-gallery>
      {media.map((m, i) => (m.kind === 'image'
        ? <PostPhoto key={i} media={m} className="w-full rounded-xl object-cover" />
        : <PostClip key={i} media={m} className="w-full rounded-xl bg-black" />))}
    </div>
  );
}

/**
 * Add photos and a short clip to a post being written.
 *
 * Simple on purpose: two buttons, the pictures underneath, a cross on each.
 * Every photo is shrunk and has its location taken out before it is kept; a
 * clip over the limit is refused with what to do instead, never silently cut.
 */
export function PostMediaPicker({ media, onChange }: {
  media: PostMedia[];
  onChange: (next: PostMedia[]) => void;
}) {
  const photos = useRef<HTMLInputElement | null>(null);
  const clip = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const room = POST_FILES_MOST - media.length;
  const hasClip = media.some((m) => m.kind === 'video');

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setProblem('');
    const added: PostMedia[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        if (!file.type.startsWith('image/')) continue;
        const ready = await readyPhoto(file);
        added.push({ kind: 'image', src: await keepPostFile(ready), alt: '' });
      }
      if (files.length > room) setProblem(`A post holds ${POST_FILES_MOST} photos and videos; the first ${room} were added.`);
      onChange([...media, ...added]);
    } catch {
      setProblem('Those photos could not be kept on this device. Try fewer, or free some space.');
    } finally {
      setBusy(false);
      if (photos.current) photos.current.value = '';
    }
  };

  const addClip = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setProblem('');
    try {
      const why = await clipProblem(file);
      if (why) { setProblem(why); return; }
      onChange([...media, { kind: 'video', src: await keepPostFile(file) }]);
    } catch {
      setProblem('That video could not be kept on this device. Try a shorter one, or free some space.');
    } finally {
      setBusy(false);
      if (clip.current) clip.current.value = '';
    }
  };

  const remove = (index: number) => {
    const gone = media[index];
    onChange(media.filter((_, i) => i !== index));
    if (gone) void forgetPostFile(gone.src).catch(() => {});
  };

  return (
    <div className="space-y-2" data-post-media-picker>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || room <= 0}
          onClick={() => photos.current?.click()}
          className="tap-sm rounded-xl bg-white px-3 text-sm font-semibold text-navy ring-1 ring-navy/15 hover:bg-gray-50 disabled:opacity-50"
        >
          📷 Add photos
        </button>
        <button
          type="button"
          disabled={busy || room <= 0 || hasClip}
          onClick={() => clip.current?.click()}
          className="tap-sm rounded-xl bg-white px-3 text-sm font-semibold text-navy ring-1 ring-navy/15 hover:bg-gray-50 disabled:opacity-50"
          title={hasClip ? 'A post has one short video' : undefined}
        >
          🎬 Add a short video
        </button>
        {busy && <span className="self-center text-sm text-gray-600" role="status">Getting it ready…</span>}
      </div>
      <input ref={photos} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addPhotos(e.target.files)} data-post-photos />
      <input ref={clip} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => void addClip(e.target.files?.[0])} data-post-clip />
      {problem && <p className="text-sm font-semibold text-red-700" role="alert">{problem}</p>}
      {media.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <li key={m.src} className="relative h-20 w-20 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-navy/10">
              {m.kind === 'image'
                ? <PostPhoto media={m} className="h-full w-full object-cover" />
                : <PostClip media={m} still className="h-full w-full object-cover" />}
              {m.kind === 'video' && (
                <span aria-hidden className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-bold text-white">▶ Video</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={m.kind === 'image' ? 'Take this photo off' : 'Take this video off'}
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center"
              >
                {/* A full 44-pixel target for a finger, with a small mark in it. */}
                <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-sm font-bold leading-none text-white">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-600">
        Up to {POST_FILES_MOST} photos and one short video of about a minute. Photos are made smaller and lose where they were taken before they are kept.
      </p>
    </div>
  );
}
