'use client';

import { useCallback, useState } from 'react';
import { NAVY, GOLD } from '@/lib/brand';
import { shareItem, blobToFile, canShareFiles, copyText } from '@/lib/share';

// Sharing outward: to Messenger, WhatsApp, Telegram, email, or anywhere else
// the person already talks to people.
//
// The important decision here is to prefer the DEVICE's own share sheet rather
// than a row of hand-made buttons. navigator.share opens the same sheet the
// phone shows for every other app, which means it already lists whatever the
// person actually has installed, in their own language, including apps this code
// has never heard of. A hand-written list of five services is guaranteed to be
// missing the one somebody needs.
//
// It is not available everywhere though: desktop Firefox and Safari do not have
// it, and file sharing is narrower still. So there is a real fallback, not a
// dead end. Every path ends with something that works, down to copying the link.
//
// Honest limit, stated where it matters rather than buried: media a person
// uploaded to Beacon lives only on their own device. There is no server holding
// it, so there is no link to it that anyone else could open. The file itself can
// be shared through the device sheet; a link to it cannot exist.

export interface SharePayload {
  title: string;
  text?: string;
  /** A real, publicly reachable address. Omit for device-only files. */
  url?: string;
  /** The actual bytes, for media that has no address. */
  file?: { blob: Blob; name: string; type?: string };
}

// The device sheet is the preferred path, and lib/share.ts already implements
// it. This component adds the part that was missing: something to LOOK at when
// the device has no sheet. Previously that case quietly copied a link to the
// clipboard and said nothing, so on a desktop the button appeared to do nothing
// at all.

// Hand-built targets, used only when the device sheet is unavailable. Every one
// of these is a plain https link, so they work on a desktop browser that has no
// apps installed at all.
function targets(text: string, url: string) {
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  const both = encodeURIComponent(url ? `${text} ${url}` : text);
  return [
    { label: 'WhatsApp', icon: '🟢', href: `https://wa.me/?text=${both}` },
    { label: 'Messenger', icon: '💬', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: 'Telegram', icon: '✈️', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { label: 'X', icon: '✖️', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { label: 'Email', icon: '✉️', href: `mailto:?subject=${t}&body=${both}` },
    { label: 'Text message', icon: '📱', href: `sms:?&body=${both}` },
  ];
}

export function ShareButton({
  payload,
  className = '',
  label = 'Share',
  compact = false,
}: {
  payload: SharePayload;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const go = useCallback(async () => {
    const file = payload.file
      ? blobToFile(payload.file.blob, payload.file.name, payload.file.type)
      : undefined;

    // No device sheet at all (most desktops): go straight to the chooser rather
    // than calling share and silently copying. A button that appears to do
    // nothing is the whole reason this exists.
    if (!canShareFiles(file)) {
      setOpen(true);
      return;
    }

    const res = await shareItem({
      title: payload.title,
      text: payload.text,
      url: payload.url,
      file,
    });
    // 'shared' is done and 'cancelled' was their decision; neither deserves a
    // second dialog. Everything else means it did not actually go anywhere.
    if (res !== 'shared' && res !== 'cancelled') setOpen(true);
  }, [payload]);

  return (
    <>
      <button
        onClick={go}
        aria-label={`${label}: ${payload.title}`}
        className={`tap-sm rounded-xl bg-white px-3 font-semibold text-navy ring-1 ring-navy/20 ${className}`}
      >
        <span aria-hidden>↗</span>
        {!compact && <span className="ml-1.5">{label}</span>}
      </button>
      {open && <ShareFallback payload={payload} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareFallback({
  payload,
  onClose,
}: {
  payload: SharePayload;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = payload.url ?? '';
  const text = payload.text ? `${payload.title}: ${payload.text}` : payload.title;

  const copy = async () => {
    // copyText, not navigator.clipboard directly: the latter is undefined over
    // plain http on a LAN, so the property access itself threw, and it has no
    // fallback for the browsers that refuse the modern API.
    if (await copyText(url ? `${text}\n${url}` : text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopied(false);
    }
  };

  // No address and no device sheet: the only honest option left is to save the
  // file, which the person can then attach wherever they like.
  const download = () => {
    if (!payload.file) return;
    const href = URL.createObjectURL(payload.file.blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = payload.file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${payload.title}`}
      onClick={onClose}
    >
      <div
        className="animate-drop overlay-sheet w-full max-w-md overflow-y-auto rounded-t-2xl solid-panel bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-5 py-4 text-white"
          style={{ backgroundColor: NAVY }}
        >
          <span className="text-2xl" aria-hidden>
            ↗
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">Share</p>
            <p className="truncate text-xs text-white/60">{payload.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-sm shrink-0 rounded-lg bg-white/10 px-3 text-lg"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {url ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {targets(text, url).map((t) => (
                  <a
                    key={t.label}
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="flex flex-col items-center gap-1 rounded-xl bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-navy hover:bg-gray-100"
                  >
                    <span className="text-2xl" aria-hidden>
                      {t.icon}
                    </span>
                    {t.label}
                  </a>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-gray-50 p-2">
                <span className="min-w-0 flex-1 truncate px-2 text-sm text-gray-500">
                  {url}
                </span>
                <button
                  onClick={copy}
                  className="tap-sm shrink-0 rounded-lg px-4 text-sm font-bold text-navy"
                  style={{ backgroundColor: GOLD }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="font-bold text-amber-800">This one lives on your device</p>
              <p className="mt-1 text-sm leading-snug text-amber-700">
                You uploaded this yourself, so it is stored here and nowhere else.
                That means there is no web address for it to send. Save it, then
                attach it in Messenger or wherever you want it to go.
              </p>
              {payload.file && (
                <button
                  onClick={() => {
                    download();
                    onClose();
                  }}
                  className="tap mt-3 w-full rounded-xl font-bold text-navy"
                  style={{ backgroundColor: GOLD }}
                >
                  Save the file
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
