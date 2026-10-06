'use client';

import { useEffect, useState } from 'react';
import {
  getBlob,
  resolutionLabel,
  type MediaMeta,
} from '@/lib/localMedia';
import { videoEmbed } from '@/lib/video';
import type { RoomTheme } from '@/lib/room-theme';

// Plays one library item.
//
// ponytail: the browser already ships a complete media player — <audio controls>
// and <video controls> give transport, scrubbing, volume, speed, picture-in-
// picture and AirPlay for free. There is no player library here and there does
// not need to be. Online video is the same idea: YouTube and Facebook each
// expose a plain iframe endpoint, so an embed is one element, no SDK.
export function MediaPlayer({ item, theme }: { item: MediaMeta; theme: RoomTheme }) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);
  const [consented, setConsented] = useState(false);
  const [resolution, setResolution] = useState('');
  const [playbackError, setPlaybackError] = useState('');

  const embed = videoEmbed(item.external_url);

  useEffect(() => {
    if (item.type === 'link') return;
    let cancelled = false;
    let made = '';
    setMissing(false);
    setResolution('');
    setPlaybackError('');
    getBlob(item.id).then((b) => {
      if (cancelled) return;
      if (!b) {
        setMissing(true);
        return;
      }
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      // Free the blob URL, or the file stays pinned in memory for the session.
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.id, item.type]);

  if (embed) {
    // Click-to-load. The iframe is not created until the person asks for it, so
    // simply having the item in a list never contacts YouTube or Facebook and
    // never lets them set anything on the device.
    if (!consented) {
      return (
        <button
          onClick={() => setConsented(true)}
          className="flex w-full items-center gap-3 rounded-xl bg-navy/5 p-4 text-left ring-1 ring-black/5 hover:bg-navy/10"
        >
          <span className="text-2xl" aria-hidden>
            ▶️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy">
              Play here ({embed.label})
            </span>
            <span className="block text-sm text-gray-500">
              Loads the player from {embed.label}. Needs a signal.
            </span>
          </span>
        </button>
      );
    }
    return (
      <div className="overflow-hidden rounded-xl bg-black">
        <iframe
          src={embed.src}
          title={item.title}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    );
  }

  if (missing) {
    // WHY THIS MESSAGE CHANGED. It used to read "This file is no longer saved
    // on this device", which is true for the person who added the file and
    // deleted it, and false for everybody else. An Explorer opening something
    // their Guide shared never had the file: it is in the Guide's browser, and
    // "no longer" told them something had broken when nothing had.
    //
    // The library is on-device by design — see the first line of
    // lib/localMedia.ts, "files never leave the browser". That is a real
    // privacy property and worth keeping. What it cannot do is move a file
    // between two people, and the app was letting somebody share one anyway,
    // then blaming the recipient's device for the result.
    //
    // So: say where the file actually is, and say the thing that does work. A
    // link travels; a blob in IndexedDB does not.
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
        <p className="font-semibold text-amber-900">This file is not on this device.</p>
        <p className="mt-1 text-amber-800">
          Items added to the library are kept in the browser that added them, so
          they never travel on their own. If someone shared this with you, ask
          them to send a link instead, because a link opens anywhere. If you added it
          yourself, it was removed from this browser, or added on another one.
        </p>
      </div>
    );
  }

  if (!url) {
    return <p className="text-sm text-gray-500">Opening…</p>;
  }

  if (item.type === 'video') {
    return (
      <div
        className="relative overflow-hidden rounded-2xl bg-black"
        style={{ boxShadow: `0 0 0 2px ${theme.accent}, 0 12px 30px ${theme.accent}22` }}
      >
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black object-contain"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setResolution(resolutionLabel(video.videoWidth, video.videoHeight));
            setPlaybackError('');
          }}
          onCanPlay={() => setPlaybackError('')}
          onError={() =>
            setPlaybackError(
              'This file cannot play on this device. Try an MP4 with H.264 video and AAC audio.',
            )
          }
        />
        {resolution && (
          <span
            aria-label={`Video resolution ${resolution}`}
            className="pointer-events-none absolute right-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow"
            style={{ backgroundColor: `${theme.accent}E6` }}
          >
            {resolution}
          </span>
        )}
        {playbackError && (
          <p
            role="alert"
            className="m-3 rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800"
          >
            {playbackError}
          </p>
        )}
      </div>
    );
  }

  if (item.type === 'audio') {
    return <audio src={url} controls preload="metadata" className="w-full" />;
  }

  if (item.type === 'image') {
    return <img src={url} alt={item.title} className="w-full rounded-xl" />;
  }

  // PDFs and anything else: the browser's own viewer, in a new tab.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-xl bg-navy px-5 py-3 font-semibold text-white"
    >
      Open {item.type.toUpperCase()}
    </a>
  );
}
