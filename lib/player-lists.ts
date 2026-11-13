'use client';

// Playlists for the player, kept on the device.
//
// A PLAYLIST IS NAMES AND IDS, NEVER TRACKS. The same reasoning as the
// library's own playlists: a track stored inside a playlist is a track stored
// twice, and the same piece in five playlists is five copies. Ids cost a few
// short strings, and localStorage is exactly the right size of place for a few
// kilobytes of ordering.
//
// ON THE DEVICE, NOT IN THE CHURCH'S DATABASE. What somebody listens to while
// they read is nobody else's business, and a church database is a place other
// people can see. Nothing here is uploaded and nothing reaches a server.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'hb-player-lists-v1';

export interface PlayerList {
  id: string;
  name: string;
  /** Track ids, in order. */
  trackIds: string[];
}

function read(): PlayerList[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PlayerList[]) : [];
    // A corrupted or hand-edited entry must not take the whole feature down.
    return Array.isArray(parsed)
      ? parsed.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.trackIds))
      : [];
  } catch {
    return [];
  }
}

function write(lists: PlayerList[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(lists)); }
  catch { /* private mode, or full. Losing a playlist is not worth an error. */ }
}

export function usePlayerLists() {
  const [lists, setLists] = useState<PlayerList[]>([]);
  // Read after mount: localStorage does not exist while this renders on the
  // server, and a value that differs between the two is a hydration mismatch.
  useEffect(() => { setLists(read()); }, []);

  const save = useCallback((next: PlayerList[]) => { setLists(next); write(next); }, []);

  const create = useCallback((name: string, trackIds: string[] = []) => {
    const list: PlayerList = {
      id: `pl-${Date.now().toString(36)}`,
      name: name.trim().slice(0, 60) || 'Untitled',
      trackIds,
    };
    save([...read(), list]);
    return list.id;
  }, [save]);

  const addTo = useCallback((listId: string, trackId: string) => {
    save(read().map((l) => (
      // Silently ignoring a duplicate rather than refusing: pressing Add twice
      // is a slip, not a request for two copies.
      l.id === listId && !l.trackIds.includes(trackId)
        ? { ...l, trackIds: [...l.trackIds, trackId] }
        : l
    )));
  }, [save]);

  const removeFrom = useCallback((listId: string, trackId: string) => {
    save(read().map((l) => (
      l.id === listId ? { ...l, trackIds: l.trackIds.filter((t) => t !== trackId) } : l
    )));
  }, [save]);

  const remove = useCallback((listId: string) => {
    save(read().filter((l) => l.id !== listId));
  }, [save]);

  const rename = useCallback((listId: string, name: string) => {
    save(read().map((l) => (l.id === listId ? { ...l, name: name.trim().slice(0, 60) || l.name } : l)));
  }, [save]);

  return { lists, create, addTo, removeFrom, remove, rename };
}
