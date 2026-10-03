'use client';

// Playlists, and a player that keeps going.
//
// PORTED FROM OPEN MORBITAL (github.com/Klydo131/open_morbital_official),
// used under AGPL-3.0 as part of this work; see NOTICES.md and lib/playlists.ts.
// Morbital's shape is kept: a named, ordered list of track ids, with a queue
// that has shuffle and repeat over it.
//
// WHAT THIS ADDS THAT MediaPlayer DOES NOT. MediaPlayer plays ONE item, chosen
// by tapping it, and stops at the end. That is right for a Guide opening a
// study video somebody shared. It is not a music player: there is no next
// track, so listening to eight songs means going back to the list eight times.
//
// The browser is still doing the playing — one <audio>/<video> element with
// `controls`, exactly as MediaPlayer does. What is added is only the part the
// browser cannot know: which file comes after this one.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { getBlob, humanSize, type MediaMeta } from '@/lib/localMedia';
import { usePlaylists, presentTracks, type Playlist } from '@/lib/playlists';
import { NextGlyph, PlayGlyph, PreviousGlyph } from '@/components/Glyph';

type RepeatMode = 'off' | 'all' | 'one';

export function Playlists({ items, onRefresh }: { items: MediaMeta[]; onRefresh?: () => void }) {
  const { playlists, create, rename, remove, addTrack, removeTrack, moveTrack } = usePlaylists();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Only playable things belong in a playlist. A PDF in a queue is a track that
  // silently ends the run, because there is nothing for the player to do with it.
  const playable = useMemo(
    () => items.filter((m) => m.type === 'audio' || m.type === 'video'),
    [items],
  );
  const byId = useMemo(() => new Map(playable.map((m) => [m.id, m])), [playable]);
  const have = useMemo(() => new Set(playable.map((m) => m.id)), [playable]);

  const open = playlists.find((p) => p.id === openId) ?? null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">🎵 Playlists</h2>
          <p className="text-sm text-gray-500">
            Put your saved music and video in an order and let it run.
          </p>
        </div>
        {!adding && (
          <Button variant="ghost" onClick={() => setAdding(true)}>+ New playlist</Button>
        )}
      </div>

      {adding && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const made = create(newName);
            setNewName('');
            setAdding(false);
            setOpenId(made.id);
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Sunday morning"
            className="tap min-w-0 flex-1 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
          />
          <Button variant="gold" type="submit">Create</Button>
          <Button variant="ghost" type="button" onClick={() => { setAdding(false); setNewName(''); }}>
            Cancel
          </Button>
        </form>
      )}

      {playlists.length === 0 && !adding && (
        <p className="mt-4 text-gray-500">
          No playlists yet. Save some music to your library, then make one.
        </p>
      )}

      {playlists.length > 0 && (
        <ul className="mt-4 space-y-2">
          {playlists.map((p) => {
            const live = presentTracks(p.trackIds, have);
            const missing = p.trackIds.length - live.length;
            return (
              <li key={p.id} className="rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === p.id ? null : p.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-semibold text-navy">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {live.length} {live.length === 1 ? 'track' : 'tracks'}
                      {/* Say it plainly rather than quietly showing a shorter
                          list. A playlist that lost a song to a library delete
                          is not the same as one that never had it. */}
                      {missing > 0 && ` · ${missing} no longer on this device`}
                    </span>
                  </button>
                  <Button variant="ghost" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                    {openId === p.id ? 'Close' : 'Open'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <PlaylistDetail
          playlist={open}
          byId={byId}
          have={have}
          playable={playable}
          onRename={(name) => rename(open.id, name)}
          onDelete={() => { remove(open.id); setOpenId(null); onRefresh?.(); }}
          onAdd={(trackId) => addTrack(open.id, trackId)}
          onRemove={(trackId) => removeTrack(open.id, trackId)}
          onMove={(trackId, d) => moveTrack(open.id, trackId, d)}
        />
      )}
    </Card>
  );
}

function PlaylistDetail({
  playlist, byId, have, playable, onRename, onDelete, onAdd, onRemove, onMove,
}: {
  playlist: Playlist;
  byId: Map<string, MediaMeta>;
  have: Set<string>;
  playable: MediaMeta[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (trackId: string) => void;
  onRemove: (trackId: string) => void;
  onMove: (trackId: string, delta: -1 | 1) => void;
}) {
  const tracks = presentTracks(playlist.trackIds, have);
  const [name, setName] = useState(playlist.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [shuffle, setShuffle] = useState(false);

  useEffect(() => { setName(playlist.name); }, [playlist.name, playlist.id]);
  // Opening a different playlist must not leave the previous one's position
  // behind, or track 5 of a 3-track list plays nothing and looks broken.
  useEffect(() => { setIndex(null); }, [playlist.id]);

  const notInPlaylist = playable.filter((m) => !playlist.trackIds.includes(m.id));

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/10">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== playlist.name && onRename(name)}
          aria-label="Playlist name"
          className="tap min-w-0 flex-1 rounded-xl bg-gray-100 px-3 font-bold text-navy outline-none focus:ring-2 focus:ring-gold"
        />
        {!confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
        ) : (
          <>
            <Button variant="danger" onClick={onDelete}>Really delete</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
          </>
        )}
      </div>

      {tracks.length === 0 ? (
        <p className="mt-4 text-gray-500">Nothing in this playlist yet. Add something below.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="gold" onClick={() => setIndex(0)}><PlayGlyph size={16} className="mr-1.5" />Play all</Button>
            <Button
              variant="ghost"
              onClick={() => setShuffle((v) => !v)}
              aria-pressed={shuffle}
            >
              {shuffle ? '🔀 Shuffle on' : '🔀 Shuffle off'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))}
            >
              {repeat === 'off' ? '🔁 Repeat off' : repeat === 'all' ? '🔁 Repeat all' : '🔂 Repeat one'}
            </Button>
          </div>

          <ol className="mt-4 space-y-1">
            {tracks.map((id, i) => {
              const meta = byId.get(id);
              if (!meta) return null;
              return (
                <li
                  key={id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
                    index === i ? 'bg-gold/20 ring-1 ring-gold' : 'bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-semibold text-navy">
                      {index === i && <PlayGlyph size={14} className="mr-1" />}
                      {meta.title}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {meta.type} · {humanSize(meta.size)}
                    </span>
                  </button>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button" aria-label="Move up" title="Move up"
                      onClick={() => onMove(id, -1)} disabled={i === 0}
                      className="rounded-lg px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-30"
                    >↑</button>
                    <button
                      type="button" aria-label="Move down" title="Move down"
                      onClick={() => onMove(id, 1)} disabled={i === tracks.length - 1}
                      className="rounded-lg px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-30"
                    >↓</button>
                    <button
                      type="button" aria-label="Remove from playlist" title="Remove from playlist"
                      onClick={() => onRemove(id)}
                      className="rounded-lg px-2 py-1 text-sm hover:bg-black/5"
                    >✕</button>
                  </span>
                </li>
              );
            })}
          </ol>

          {index !== null && tracks[index] && byId.get(tracks[index]) && (
            <QueuePlayer
              track={byId.get(tracks[index])!}
              position={index}
              total={tracks.length}
              repeat={repeat}
              shuffle={shuffle}
              onIndex={setIndex}
              onStop={() => setIndex(null)}
            />
          )}
        </>
      )}

      {notInPlaylist.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-navy underline">
            Add from your library ({notInPlaylist.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {notInPlaylist.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-navy">{m.title}</span>
                  <span className="block text-xs text-gray-500">{m.type} · {humanSize(m.size)}</span>
                </span>
                <Button variant="ghost" onClick={() => onAdd(m.id)}>Add</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * One element, playing the current track, that knows what comes next.
 *
 * The blob URL is revoked when the track changes. Without that, a long listening
 * session pins every file it has played in memory — which on a phone, with the
 * 500 MB files this library accepts, is how a browser tab gets killed mid-song.
 */
function QueuePlayer({
  track, position, total, repeat, shuffle, onIndex, onStop,
}: {
  track: MediaMeta;
  position: number;
  total: number;
  repeat: RepeatMode;
  shuffle: boolean;
  onIndex: (i: number) => void;
  onStop: () => void;
}) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made = '';
    setUrl('');
    setMissing(false);
    getBlob(track.id).then((blob) => {
      if (cancelled) return;
      if (!blob) { setMissing(true); return; }
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [track.id]);

  const next = useCallback(() => {
    if (repeat === 'one') {
      const el = mediaRef.current;
      if (el) { el.currentTime = 0; void el.play(); }
      return;
    }
    if (shuffle && total > 1) {
      // Any track but this one. Landing on the same song and calling it random
      // is how shuffle gets a reputation for being broken.
      let pick = position;
      while (pick === position) pick = Math.floor(Math.random() * total);
      onIndex(pick);
      return;
    }
    if (position + 1 < total) { onIndex(position + 1); return; }
    if (repeat === 'all') { onIndex(0); return; }
    onStop();
  }, [repeat, shuffle, total, position, onIndex, onStop]);

  const previous = () => onIndex(position > 0 ? position - 1 : total - 1);

  if (missing) {
    return (
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-300">
        “{track.title}” is not on this device any more. Remove it from the playlist, or add the file again.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-navy p-4 text-white">
      <p className="truncate font-bold">{track.title}</p>
      <p className="text-xs text-white/60">Track {position + 1} of {total}</p>

      {url ? (
        track.type === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={url} controls autoPlay onEnded={next} playsInline
            className="mt-3 max-h-[60vh] w-full rounded-xl bg-black [max-height:60dvh]"
          />
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={url} controls autoPlay onEnded={next}
            className="mt-3 w-full"
          />
        )
      ) : (
        <p className="mt-3 text-sm text-white/70">Opening…</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button" onClick={previous} disabled={total < 2}
          className="tap-sm rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20 disabled:opacity-40"
        ><PreviousGlyph size={16} className="mr-1.5" />Previous</button>
        <button
          type="button" onClick={next}
          className="tap-sm rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20"
        >Next<NextGlyph size={16} className="ml-1.5" /></button>
        <button
          type="button" onClick={onStop}
          className="tap-sm rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20"
        >Stop</button>
      </div>
    </div>
  );
}
