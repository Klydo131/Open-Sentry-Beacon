'use client';

// One attachment in a conversation, drawn the same way on both halves.
//
// ---------------------------------------------------------------------------
// A PICTURE LOOKS LIKE A PICTURE, A VOICE MESSAGE PLAYS, A FILE IS A CARD.
// Decided by the mime type both halves already store:
//
//   image  -> the picture itself, rounded, with no bubble around it; a tap
//             opens it full screen inside the app (ImageViewer), not in a
//             new browser tab that leaves the conversation behind
//   audio  -> a player: play, a bar to move through it, the length. A voice
//             message (lib/talk/voice.ts) says "Voice message"; an audio file
//             somebody chose says its name
//   video  -> the sample app only (the live store refuses video); plays inline
//   other  -> a card with the file's name and size, which opens it
//
// WHERE THE BYTES COME FROM IS THE CALLER'S BUSINESS. The live half signs a
// short-lived URL for a private file; the sample half makes a URL from bytes
// kept on this device. Both arrive here as `load()`, and `release()` lets the
// sample half free its URL when the picture leaves the screen.
//
// LAZY, AND THAT IS NOT A DETAIL. A private file is paid for in egress every
// time it is fetched. A picture loads when it is drawn (`loading="lazy"`), and
// a recording loads nothing until play is pressed (`preload="none"`).
//
// ANYTHING THAT FAILS TO SHOW FALLS BACK TO THE CARD. Apple's HEIC draws in
// Safari and not in Chrome; an older iPhone cannot play a webm recording; a
// signed URL can expire while a tab sits open. In every case the person still
// gets the file, by name, with a way to open it.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseGlyph, DocGlyph, DownloadGlyph, MicGlyph, PauseGlyph, PlayGlyph } from '@/components/Glyph';
import { clockDuration, readableSize } from '@/lib/talk/thread';
import { isVoiceTitle } from '@/lib/talk/voice';

export interface ChatFile {
  kind: 'file';
  id: string;
  at: string;
  who: string;
  title: string;
  mime: string;
  size: number;
  /** A URL the browser can show this with, made when it is needed. */
  load: () => Promise<string>;
  /** Called with that URL once it is no longer shown. */
  release?: (url: string) => void;
}

export type FileShape = 'image' | 'voice' | 'audio' | 'video' | 'file';

export function shapeOf(file: Pick<ChatFile, 'mime' | 'title'>): FileShape {
  if (/^image\//i.test(file.mime)) return 'image';
  if (/^audio\//i.test(file.mime)) return isVoiceTitle(file.title) ? 'voice' : 'audio';
  if (/^video\//i.test(file.mime)) return 'video';
  return 'file';
}

/** The URL for a file, fetched once it is drawn and freed when it goes. */
function useFileUrl(file: ChatFile, wanted: boolean) {
  const [url, setUrl] = useState('');
  const [broken, setBroken] = useState(false);
  const loader = useRef(file.load);
  const releaser = useRef(file.release);
  loader.current = file.load;
  releaser.current = file.release;

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let made = '';
    loader.current()
      .then((u) => {
        made = u;
        if (alive) setUrl(u); else releaser.current?.(u);
      })
      .catch(() => { if (alive) setBroken(true); });
    return () => {
      alive = false;
      if (made) releaser.current?.(made);
    };
  }, [file.id, wanted]);

  return { url, broken, setBroken };
}

/** Open a file the way the browser would, in a new tab, never sharing who opened it. */
async function openFile(file: ChatFile): Promise<void> {
  const fresh = await file.load();
  window.open(fresh, '_blank', 'noopener,noreferrer');
}

export function ChatAttachment({
  file,
  mine,
  meta,
  onViewImage,
}: {
  file: ChatFile;
  mine: boolean;
  /** The time and receipt, drawn on the picture or inside the bubble. */
  meta?: React.ReactNode;
  onViewImage: (src: string, title: string) => void;
}) {
  const shape = shapeOf(file);
  const { url, broken, setBroken } = useFileUrl(file, shape === 'image' || shape === 'video');

  if (shape === 'image' && !broken) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => { if (url) onViewImage(url, file.title); }}
          className="block overflow-hidden rounded-[18px] bg-black/5 ring-1 ring-black/5"
          aria-label={`Open the picture ${file.title}`}
          data-chat-image
        >
          {url ? (
            <img
              src={url}
              alt={file.title}
              loading="lazy"
              onError={() => setBroken(true)}
              className="block max-h-80 w-auto max-w-full object-cover"
            />
          ) : (
            <span className="block h-40 w-56 max-w-full motion-safe:animate-pulse bg-black/10" />
          )}
        </button>
        {meta && (
          <span className="pointer-events-none absolute bottom-2 right-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[0.722rem] font-semibold leading-tight text-white">
            {meta}
          </span>
        )}
      </div>
    );
  }

  if (shape === 'video' && !broken) {
    return (
      <div className={`overflow-hidden rounded-[18px] ${mine ? 'bg-[#E4F0F5]' : 'bg-[#FCEEDF]'}`}>
        {url ? (
          // playsInline: without it iOS pulls the video out of the conversation
          // and plays it over everything.
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
            className="block max-h-80 max-w-full"
          />
        ) : (
          <span className="block h-40 w-56 max-w-full motion-safe:animate-pulse bg-black/10" />
        )}
        {meta && <p className="px-3 py-1.5 text-right text-[0.722rem] text-slate-600">{meta}</p>}
      </div>
    );
  }

  if ((shape === 'voice' || shape === 'audio') && !broken) {
    return (
      <div className={`rounded-[20px] px-3 py-2.5 ${mine ? 'bg-[#E4F0F5]' : 'bg-[#FCEEDF]'}`}>
        <VoicePlayer file={file} onBroken={() => setBroken(true)} />
        {meta && <p className="mt-1 text-right text-[0.722rem] leading-none text-slate-600">{meta}</p>}
      </div>
    );
  }

  return <FileCard file={file} mine={mine} meta={meta} missing={broken && shape !== 'file'} />;
}

/** A file that is not a picture or a recording: its name, its size, and a way to open it. */
function FileCard({ file, mine, meta, missing }: { file: ChatFile; mine: boolean; meta?: React.ReactNode; missing: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  return (
    <div className={`rounded-[20px] px-3 py-2.5 ${mine ? 'bg-[#E4F0F5]' : 'bg-[#FCEEDF]'}`}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed('');
          try { await openFile(file); } catch { setFailed('That file could not be opened.'); }
          finally { setBusy(false); }
        }}
        className="flex w-full min-w-0 items-center gap-3 text-left"
        aria-label={`Open ${file.title}`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/80 text-navy ring-1 ring-black/5">
          <DocGlyph size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block break-words text-[0.778rem] font-semibold text-navy">{file.title}</span>
          <span className="block text-[0.722rem] text-slate-600">
            {busy ? 'Opening…' : missing ? 'Tap to open' : readableSize(file.size)}
          </span>
        </span>
        <DownloadGlyph size={18} className="shrink-0 text-slate-500" />
      </button>
      {failed && <p className="mt-1 text-[0.722rem] text-red-700">{failed}</p>}
      {meta && <p className="mt-1 text-right text-[0.722rem] leading-none text-slate-600">{meta}</p>}
    </div>
  );
}

/**
 * Play, a bar to move through it, and how long it runs.
 *
 * NOTHING IS FETCHED UNTIL PLAY IS PRESSED. The URL is made on the first press,
 * and the length appears once the browser has read it, which is the price of
 * not paying to download every recording in a thread just to say how long each
 * one is.
 */
function VoicePlayer({ file, onBroken }: { file: ChatFile; onBroken: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const [loading, setLoading] = useState(false);
  const voice = shapeOf(file) === 'voice';
  const made = useRef('');
  const releaser = useRef(file.release);
  releaser.current = file.release;

  useEffect(() => () => { if (made.current) releaser.current?.(made.current); }, []);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (playing) { el.pause(); return; }
    if (!src) {
      setLoading(true);
      try {
        const u = await file.load();
        made.current = u;
        setSrc(u);
        el.src = u;
      } catch {
        setLoading(false);
        onBroken();
        return;
      }
    }
    try {
      await el.play();
    } catch {
      setLoading(false);
      onBroken();
    }
  };

  return (
    <div className="flex min-w-[13rem] max-w-full items-center gap-2.5">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? `Pause ${voice ? 'the voice message' : file.title}` : `Play ${voice ? 'the voice message' : file.title}`}
        className="grid h-11 min-h-0 w-11 shrink-0 place-items-center rounded-full bg-[#1F7A8C] text-white shadow-sm"
        data-voice-play
      >
        {playing ? <PauseGlyph size={18} /> : <PlayGlyph size={18} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-[0.722rem] font-semibold text-slate-600">
          {voice && <MicGlyph size={13} className="text-[#1F7A8C]" />}
          {voice ? 'Voice message' : file.title}
        </p>
        <input
          type="range"
          min={0}
          max={length || 1}
          step={0.1}
          value={Math.min(at, length || 1)}
          disabled={!length}
          onChange={(event) => {
            const el = audio.current;
            if (el) el.currentTime = Number(event.target.value);
          }}
          aria-label="Position in the recording"
          className="block h-11 w-full accent-[#1F7A8C]"
        />
        <p className="text-[0.722rem] tabular-nums text-slate-600">
          {loading ? 'Loading…' : length ? `${clockDuration(at)} / ${clockDuration(length)}` : readableSize(file.size)}
        </p>
      </div>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => { setPlaying(true); setLoading(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAt(0); }}
        onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration;
          // A recording straight from MediaRecorder can report Infinity until
          // it has been played through once; say nothing rather than nonsense.
          if (Number.isFinite(d)) setLength(d);
        }}
        onDurationChange={(event) => {
          const d = event.currentTarget.duration;
          if (Number.isFinite(d)) setLength(d);
        }}
        onError={() => { if (src) onBroken(); }}
        className="hidden"
      />
    </div>
  );
}

/**
 * A picture, full screen, inside the app.
 *
 * Over everything, on black, with a way out at the top that a thumb reaches,
 * Escape on a keyboard, and a tap anywhere outside the picture. "Save" hands
 * the same file to the browser's own download, so nothing is uploaded or
 * shared by keeping a copy.
 */
export function ImageViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    // Caught first and stopped, so Escape closes the picture and not the
    // conversation behind it (see MessageMenu).
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Picture: ${title}`}
      data-image-viewer
      className="viewer-in fixed inset-0 z-[80] flex flex-col bg-black/95"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] text-white">
        <p className="min-w-0 truncate text-sm font-semibold text-white/80">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          {/* A NEW TAB, as well as `download`: a browser ignores `download`
              for a file on another address (the live store's signed link) and
              would otherwise open it IN PLACE of the app. */}
          <a
            href={src}
            download={title}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-sm flex items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white hover:bg-white/10"
          >
            <DownloadGlyph size={18} /> Save
          </a>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close the picture"
            className="tap-sm grid w-11 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <CloseGlyph size={22} />
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        <img src={src} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    </div>,
    document.body,
  );
}
