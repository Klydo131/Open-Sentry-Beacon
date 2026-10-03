'use client';

// Playlists for the library player.
//
// PORTED FROM OPEN MORBITAL, the owner's local-first music player
// (github.com/Klydo131/open_morbital_official), AGPL-3.0 upstream, and used
// here under its terms as part of this AGPL-3.0 work. See NOTICES.md. The data model below is Morbital's `StoredPlaylist`; the code
// is written against this app's own storage rather than copied, because
// Morbital is Vite/zustand/dexie and this is Next.js.
//
// WHY A PLAYLIST IS ONLY NAMES AND IDS. The media itself is already in
// IndexedDB (lib/localMedia.ts) and can be hundreds of megabytes a file. A
// playlist that stored tracks would store them AGAIN, so putting one song in
// five playlists would cost five copies of the song. Storing ids costs five
// short strings, and localStorage — which is small, synchronous and perfect for
// a few kilobytes of ordering — is exactly the right place for them.
//
// Everything here is on the device. Nothing is uploaded, and a playlist cannot
// reach a church's database any more than the files it points at can.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'hb-playlists-v1';

export interface Playlist {
  id: string;
  name: string;
  /** Ordered. The order IS the playlist — index is meaning, not decoration. */
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

const newId = () =>
  `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function read(): Playlist[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than crashing the screen. This
    // storage survives app upgrades and a half-written entry from an older
    // shape must not take the library down with it.
    return parsed.filter(
      (p): p is Playlist =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.trackIds),
    );
  } catch {
    return [];
  }
}

function write(all: Playlist[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // A full or disabled store is not worth an exception here: the playlist
    // stays in memory for this session and the music keeps playing.
  }
}

/**
 * The playlists on this device.
 *
 * Re-reads on the `storage` event so two tabs of the same app agree — making a
 * playlist in one and finding it absent in the other is the kind of small lie
 * that makes people stop trusting a feature.
 */
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const refresh = useCallback(() => setPlaylists(read()), []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const commit = useCallback((next: Playlist[]) => {
    write(next);
    setPlaylists(next);
  }, []);

  const create = useCallback(
    (name: string) => {
      const now = new Date().toISOString();
      const playlist: Playlist = {
        id: newId(),
        name: name.trim() || 'Untitled playlist',
        trackIds: [],
        createdAt: now,
        updatedAt: now,
      };
      commit([...read(), playlist]);
      return playlist;
    },
    [commit],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      commit(
        read().map((p) =>
          p.id === id
            ? { ...p, name: name.trim() || p.name, updatedAt: new Date().toISOString() }
            : p,
        ),
      );
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => commit(read().filter((p) => p.id !== id)),
    [commit],
  );

  const addTrack = useCallback(
    (id: string, trackId: string) => {
      commit(
        read().map((p) =>
          p.id === id && !p.trackIds.includes(trackId)
            ? { ...p, trackIds: [...p.trackIds, trackId], updatedAt: new Date().toISOString() }
            : p,
        ),
      );
    },
    [commit],
  );

  const removeTrack = useCallback(
    (id: string, trackId: string) => {
      commit(
        read().map((p) =>
          p.id === id
            ? {
                ...p,
                trackIds: p.trackIds.filter((t) => t !== trackId),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
    },
    [commit],
  );

  /** Move a track one place up or down. The order is the whole point. */
  const moveTrack = useCallback(
    (id: string, trackId: string, delta: -1 | 1) => {
      commit(
        read().map((p) => {
          if (p.id !== id) return p;
          const from = p.trackIds.indexOf(trackId);
          const to = from + delta;
          if (from === -1 || to < 0 || to >= p.trackIds.length) return p;
          const trackIds = [...p.trackIds];
          [trackIds[from], trackIds[to]] = [trackIds[to], trackIds[from]];
          return { ...p, trackIds, updatedAt: new Date().toISOString() };
        }),
      );
    },
    [commit],
  );

  return { playlists, create, rename, remove, addTrack, removeTrack, moveTrack, refresh };
}

/**
 * Drop ids whose file is no longer on the device.
 *
 * A playlist points at media by id, and the media can be deleted from the
 * library independently. Without this the player hits a missing blob mid-run
 * and stops, which reads as the playlist being broken rather than one song
 * having been removed.
 */
export function presentTracks(trackIds: string[], have: Set<string>): string[] {
  return trackIds.filter((id) => have.has(id));
}
