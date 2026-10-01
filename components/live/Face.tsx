'use client';

// Faces on the live app: the photo a person chose, wherever somebody who may
// see it sees their name.
//
// Asked for on 30 September 2026: "I still can't see anyway to see the
// Explorers profile or their image display for Guides and higher up accounts."
// Every list a Guide or a Director reads drew initials, even for somebody who
// had uploaded a photo. The storage rule already allowed it (anybody signed in
// may read a face; nobody but its owner may write one), so nothing about who
// can see what has changed -- only that it is now shown.

import { useEffect, useState } from 'react';
import * as live from '@/lib/live/data';

/** Links are signed for an hour (avatarUrls); this is comfortably inside it. */
const RESIGN_MS = 50 * 60 * 1000;

/**
 * Signed URLs for every photo path given, in one request, refreshed when the
 * set of paths changes. A URL that will not sign is left out, and the Avatar
 * falls back to the person's initials, as it always did.
 */
export function useFaces(paths: (string | null | undefined)[]): Record<string, string> {
  const [faces, setFaces] = useState<Record<string, string>>({});
  const key = [...new Set(paths.filter(Boolean))].sort().join('|');
  useEffect(() => {
    if (!key) { setFaces({}); return; }
    let alive = true;
    const sign = () => {
      void live.avatarUrls(key.split('|'))
        .then((urls) => { if (alive) setFaces(urls); })
        .catch(() => { /* initials stay; a face is never worth an error banner */ });
    };
    sign();
    // A SIGNED LINK LASTS AN HOUR, and a Guide's list can stay open all
    // afternoon. Signed again before they run out, so faces do not turn into
    // broken pictures on a page nobody reloaded.
    const again = window.setInterval(sign, RESIGN_MS);
    return () => { alive = false; window.clearInterval(again); };
  }, [key]);
  return faces;
}

/** The face for one path, or undefined for the initials. */
export function faceOf(faces: Record<string, string>, path?: string | null): string | undefined {
  return path ? faces[path] : undefined;
}
