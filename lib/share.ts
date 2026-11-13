'use client';

// Sharing via the device's own share sheet (Web Share API). The file goes
// straight from the user's device to whatever they pick — WhatsApp, Messenger,
// Telegram, or another device nearby (AirDrop / Nearby Share / Bluetooth). No
// server, no hosting: Beacon is a bridge. Falls back to copying a link where the
// Web Share API isn't available (most desktops).

export type ShareResult = 'shared' | 'copied' | 'download' | 'cancelled' | 'unsupported';

/**
 * Copy text to the clipboard, and say whether it worked.
 *
 * WHY THIS IS NOT JUST `navigator.clipboard.writeText`.
 *
 *   * `navigator.clipboard` is UNDEFINED in a non-secure context. Open the app
 *     over plain http on an office LAN -- which is how a church tries it first
 *     -- and the property access itself throws a TypeError.
 *   * Safari rejects the write when the document is not focused, and it is
 *     stricter than Chrome about the write happening inside the user gesture.
 *
 * Both failures were silent here. Four call sites did
 * `void navigator.clipboard?.writeText(x)`: the `void` discards the promise, so
 * a rejection became an unhandled rejection nobody saw, and the person who
 * pressed Copy got no clipboard and no message. From their side the button does
 * nothing, which is indistinguishable from the button being broken.
 *
 * So this returns a boolean the caller can show, and falls back to the old
 * execCommand path where the modern API is unavailable. The fallback builds a
 * textarea and sets `.value`, never innerHTML, so no caller can inject markup
 * through the text being copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through and try the old way rather than giving up.
  }

  // Pre-secure-context fallback. Deprecated, still the only thing that works
  // over plain http, and harmless where it is not needed.
  try {
    const area = document.createElement('textarea');
    area.value = text; // .value, never innerHTML
    area.setAttribute('readonly', '');
    // Off-screen rather than display:none, which some browsers refuse to select.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const worked = document.execCommand('copy');
    document.body.removeChild(area);
    return worked;
  } catch {
    return false;
  }
}

export function blobToFile(blob: Blob, name: string, mime?: string): File {
  return new File([blob], name, { type: mime || blob.type || 'application/octet-stream' });
}

// True when this browser can share actual files (mobile Safari/Chrome, etc.).
export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
  if (!n.share) return false;
  if (file) return !!n.canShare && n.canShare({ files: [file] });
  return true;
}

export async function shareItem(opts: {
  title: string;
  text?: string;
  file?: File;
  url?: string;
}): Promise<ShareResult> {
  const n =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { canShare?: (d?: ShareData) => boolean })
      : undefined;

  // 1) Share the actual file through the OS share sheet, if supported.
  if (n?.share && opts.file && n.canShare?.({ files: [opts.file] })) {
    try {
      await n.share({ files: [opts.file], title: opts.title, text: opts.text });
      return 'shared';
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }

  // 2) Share a link/text (e.g. for link items, or where file share is absent).
  if (n?.share && (opts.url || opts.text)) {
    try {
      await n.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }

  // 3) Fallback: copy a link to the clipboard so the user can paste it anywhere.
  if (opts.url) {
    return (await copyText(opts.url)) ? 'copied' : 'unsupported';
  }

  // 4) No file-share and no link → the caller should offer Download instead.
  return 'download';
}
