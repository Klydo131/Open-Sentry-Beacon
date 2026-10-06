'use client';

// The player, in two sizes.
//
// `PlayerStrip` is the right-rail version: what is playing, the transport and
// the volume. It is the one people see all day, so it is deliberately small.
//
// `PlayerPanel` is the library version: a picture when there is one, the full
// transport, and the things you choose from underneath it, in tabs.
//
// BOTH DRIVE THE SAME ELEMENT. See lib/player.tsx: it lives above both, in the
// root layout, so pressing play in the rail and then opening the library does
// not start a second copy, and leaving the library does not cut the sound off.
// A video's picture moves to whichever of them is showing it and its sound
// never stops.
//
// WHAT A PLAYER HAS TO HAVE, and this had none of it: a progress bar you can
// drag, the time so far and the time left, previous and next, and a mute. A
// play button and a volume slider is a toy.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AMBIENCE, AMBIENCE_GROUPS, clock, playerCredit, usePlayer, type Track } from '@/lib/player';
import { usePlayerLists } from '@/lib/player-lists';
import { deleteMedia, getBlob, humanSize, listMedia, type MediaMeta } from '@/lib/localMedia';
import { saveFilesFromInput, savedMessage } from '@/lib/save-media';

// Whether the rail's player is expanded. Per device, because it is a
// preference about this screen rather than anything about the account.
const STRIP_OPEN_KEY = 'beacon.player.rail-open';
import { Button, Card } from '@/components/ui';
import { inkOn, type RoomTheme } from '@/lib/room-theme';
import {
  BackGlyph, ForwardGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph, CloseGlyph,
  ChevronGlyph,
} from '@/components/Glyph';

function Credit({ className = '' }: { className?: string }) {
  const credit = playerCredit();
  // Nothing is printed when the deployment names nobody. A fork sees no
  // credit rather than somebody else's product name.
  if (!credit) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider opacity-60 ${className}`}>
      {credit}
    </span>
  );
}

/**
 * The vault: this device's own music and video, and the URLs to play them.
 *
 * Shared by both sizes of player so there is one list and one URL per file, not
 * one of each per component.
 *
 * BLOB URLS ARE MADE ON PRESS AND NEVER REVOKED, and that is deliberate rather
 * than an oversight. components/MediaPlayer revokes on unmount, which is right
 * there because the element it feeds dies with the component. This player
 * outlives the page — the provider sits in the root layout precisely so a track
 * keeps running while you walk between rooms — so revoking on unmount would cut
 * the sound off at the exact moment the design promises it will not. One URL
 * per file actually played, held for the session, is what that costs.
 */
function useVault(supplied?: MediaMeta[], onChanged?: () => void) {
  const [loaded, setLoaded] = useState<MediaMeta[]>([]);
  const [opening, setOpening] = useState('');
  const made = useRef(new Map<string, string>());
  const [opened, setOpened] = useState<Track[]>([]);

  // A caller that already has the list (the Library page) hands it over; the
  // rail has no list of its own and reads the device directly.
  const external = supplied !== undefined;
  const refresh = useCallback(async () => {
    if (external) return;
    setLoaded(await listMedia());
  }, [external]);
  useEffect(() => {
    if (external) return;
    let alive = true;
    void listMedia().then((rows) => { if (alive) setLoaded(rows); });
    return () => { alive = false; };
  }, [external]);

  const all = supplied ?? loaded;
  // Only audio and video. A PDF in a queue is a track that silently ends the
  // run, because there is nothing for the player to do with it.
  const playable = useMemo(
    () => all.filter((m) => m.type === 'audio' || m.type === 'video'),
    [all],
  );

  const trackFor = (m: MediaMeta, url?: string): Track => ({
    id: m.id,
    title: m.title,
    url,
    // The player needs to know there is a picture, so it can give the element
    // a stage rather than leaving a video playing into a hidden corner.
    video: m.type === 'video',
    icon: m.type === 'video' ? '🎬' : '🎵',
  });

  const open = async (m: MediaMeta, play: (t: Track, q?: Track[]) => void) => {
    let url = made.current.get(m.id);
    if (!url) {
      setOpening(m.id);
      try {
        const blob = await getBlob(m.id);
        if (!blob) return;
        url = URL.createObjectURL(blob);
        made.current.set(m.id, url);
      } finally {
        setOpening('');
      }
    }
    const track = trackFor(m, url);
    // The queue is everything opened so far this session, in the order the list
    // shows them, so "next" walks the vault instead of stopping dead.
    const queue = playable
      .filter((o) => o.id === m.id || made.current.has(o.id))
      .map((o) => (o.id === m.id ? track : trackFor(o, made.current.get(o.id))));
    setOpened(queue);
    play(track, queue);
  };

  /**
   * Take a file off this device.
   *
   * Stops it first if it is the thing playing. Deleting the file under a
   * playing element leaves the element pointing at a blob that no longer
   * exists, which on some browsers is silence and on others an error nobody
   * asked for.
   */
  const remove = async (m: MediaMeta, stopIfPlaying: () => void) => {
    stopIfPlaying();
    const url = made.current.get(m.id);
    if (url) { URL.revokeObjectURL(url); made.current.delete(m.id); }
    setOpened((q) => q.filter((t) => t.id !== m.id));
    await deleteMedia(m.id);
    // `refresh` re-reads the device, which is what the rail needs. When a page
    // supplied the list, that page owns it and refreshing here would do
    // nothing, so it gets told instead.
    await refresh();
    onChanged?.();
  };

  return { playable, opening, open, opened, refresh, remove };
}

/** The three tabs, in the order somebody actually wants them. */
/**
 * The progress bar.
 *
 * A real input[type=range] rather than a div somebody drags. It gets keyboard
 * seeking, a hit area the browser already sizes for touch, and the correct
 * behaviour for a screen reader, none of which a styled div has unless every
 * one of them is written by hand and then maintained.
 *
 * Generated ambience has no length and no position, so this draws a plain line
 * and says so instead of showing a bar pinned at zero that never moves.
 */
function Scrubber({ accent, compact = false }: { accent: string; compact?: boolean }) {
  const player = usePlayer();
  if (!player) return null;
  const { current, position, duration, seek } = player;

  if (current?.noise) {
    return (
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
        Made on your device as it plays. It does not end.
      </p>
    );
  }

  const max = duration > 0 ? duration : 0;
  return (
    <div>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={Math.min(position, max || 1)}
        disabled={max === 0}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Position in the track"
        className={`${compact ? 'h-1' : 'h-1.5'} w-full cursor-pointer disabled:cursor-default disabled:opacity-40`}
        style={{ accentColor: accent }}
      />
      <div className={`flex justify-between ${compact ? 'text-[10px]' : 'text-xs'} tabular-nums text-gray-500`}>
        <span>{clock(position)}</span>
        {/* THE TIME LEFT, not the total. "How much longer" is the question
            somebody actually has, and it is the one a total makes you do
            arithmetic for. The total is on the other side of the dash for
            anybody who wants it. */}
        <span>{max > 0 ? `-${clock(Math.max(0, max - position))}` : '--:--'}</span>
      </div>
    </div>
  );
}

/** Previous, play/pause, next, and the two skips. */
function Transport({ accent, compact = false }: { accent: string; compact?: boolean }) {
  const player = usePlayer();
  if (!player) return null;
  const { current, playing, loading, toggle, next, previous, nudge, queue } = player;

  const at = current ? queue.findIndex((t) => t.id === current.id) : -1;
  const hasNext = at >= 0 && at < queue.length - 1;
  // Previous is never disabled once something is playing: on the first press it
  // restarts the track, which is what it does in every player people already
  // use.
  const live = Boolean(current);
  const seekable = Boolean(current && !current.noise);

  const round = compact ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base';
  const big = compact ? 'h-11 w-11 text-lg' : 'h-14 w-14 text-xl';
  const ghost = 'grid place-items-center rounded-full bg-gray-100 text-navy hover:bg-gray-200 disabled:opacity-30';

  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <button
        type="button" disabled={!seekable} onClick={() => nudge(-10)}
        aria-label="Back ten seconds" title="Back 10 seconds"
        className={`${ghost} ${round}`}
      >
        <BackGlyph seconds={10} size={compact ? 18 : 20} />
      </button>
      <button
        type="button" disabled={!live} onClick={previous}
        aria-label="Previous track" title="Previous"
        className={`${ghost} ${round}`}
      >
        <PreviousGlyph size={compact ? 18 : 20} />
      </button>
      <button
        type="button"
        onClick={() => (current ? toggle() : player.play(AMBIENCE[0], AMBIENCE))}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`grid shrink-0 place-items-center rounded-full ${big}`}
        style={{ backgroundColor: accent, color: inkOn(accent) }}
      >
        {/* The spinner replaces the glyph rather than sitting beside it, so the
            button never changes size while a track is loading. */}
        {loading ? (
          <span aria-hidden className="beacon-spinner block h-5 w-5 rounded-full border-2 border-white/40"
            style={{ borderTopColor: '#fff' }} />
        ) : playing ? <PauseGlyph size={22} /> : <PlayGlyph size={22} />}
      </button>
      <button
        type="button" disabled={!hasNext} onClick={next}
        aria-label="Next track" title="Next"
        className={`${ghost} ${round}`}
      >
        <NextGlyph size={compact ? 18 : 20} />
      </button>
      <button
        type="button" disabled={!seekable} onClick={() => nudge(10)}
        aria-label="Forward ten seconds" title="Forward 10 seconds"
        className={`${ghost} ${round}`}
      >
        <ForwardGlyph seconds={10} size={compact ? 18 : 20} />
      </button>
    </div>
  );
}

/** Mute and the volume slider, which are one control in most people's heads. */
function Volume({ accent, compact = false }: { accent: string; compact?: boolean }) {
  const player = usePlayer();
  if (!player) return null;
  const { volume, muted, setVolume, toggleMute } = player;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        className="shrink-0 text-gray-500 hover:text-navy"
      >
        <span aria-hidden>{muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
      </button>
      <input
        type="range" min={0} max={1} step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
        className={`${compact ? 'h-1' : 'h-1.5'} w-full ${compact ? '' : 'max-w-[10rem]'} cursor-pointer`}
        style={{ accentColor: accent }}
      />
    </div>
  );
}

/**
 * Where a video's picture goes.
 *
 * The element is adopted on mount and handed back on unmount, so the sound
 * never stops when somebody leaves this screen. The box keeps its shape when
 * nothing is playing rather than appearing and shoving the page down.
 */
function VideoStage() {
  const player = usePlayer();
  const box = useRef<HTMLDivElement | null>(null);
  const attach = player?.attachVideo;
  const showing = Boolean(player?.hasVideo);

  useEffect(() => {
    if (!attach) return;
    if (showing) attach(box.current);
    return () => { attach(null); };
  }, [attach, showing]);

  if (!showing) return null;
  return (
    <div
      ref={box}
      className="mt-3 aspect-video w-full overflow-hidden rounded-2xl bg-black"
    />
  );
}

type Tab = 'vault' | 'playlists' | 'ambience';

const TAB_LABEL: Record<Tab, string> = {
  vault: 'Vault',
  playlists: 'Playlists',
  ambience: 'Ambience',
};

/**
 * The small player, in the right rail of every room.
 *
 * WHY IT COLLAPSES. This is the player people see all day, on a rail that also
 * carries the room, the study timer and the theme picker. Open, it is the
 * tallest thing there; shut, it is four lines that say what is playing. Neither
 * is right for everybody all the time, so it is a choice, and the choice is
 * remembered on the device.
 *
 * Shut is the default. Somebody who has never touched the player should not
 * have to scroll past its whole library to reach the timer.
 */
export function PlayerStrip({ theme }: { theme: RoomTheme }) {
  const player = usePlayer();
  const lists = usePlayerLists();
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('vault');
  const [find, setFind] = useState('');
  const [dropping, setDropping] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read once on mount rather than during render: the server has no
  // localStorage, and reading it inline is how a hydration mismatch starts.
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STRIP_OPEN_KEY) === '1');
    } catch { /* private mode, or storage switched off. Shut is fine. */ }
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(STRIP_OPEN_KEY, next ? '1' : '0'); } catch { /* fine */ }
  };

  if (!player) return null;
  const { current, playing, play } = player;

  const needle = find.trim().toLowerCase();
  const found = needle
    ? vault.playable.filter((m) => m.title.toLowerCase().includes(needle))
    : vault.playable;

  const everything = [...AMBIENCE, ...vault.opened];
  const byId = new Map(everything.map((t) => [t.id, t]));
  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBusy(true);
    const result = await saveFilesFromInput(e.target);
    setBusy(false);
    setNote(savedMessage(result));
    // Re-read the device, so a file just saved is playable without a reload.
    // Leaving this out is how the button appears to do nothing.
    if (result.saved > 0) {
      await vault.refresh();
      window.setTimeout(() => setNote(''), 2600);
    }
  };

  const rowStyle = (on: boolean) =>
    on ? { backgroundColor: theme.line } : undefined;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: theme.inkSoft }}
        >
          Player
        </p>
        <div className="flex items-center gap-2">
          <Credit />
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label={open ? 'Hide the player’s tracks' : 'Show the player’s tracks'}
            title={open ? 'Hide tracks' : 'Show tracks'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-sm leading-none"
            style={{ color: theme.inkSoft }}
          >
            {open ? <ChevronGlyph open size={16} /> : '⋯'}
          </button>
        </div>
      </div>

      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: theme.ink }}>
          {current ? `${current.icon ?? ''} ${current.title}`.trim() : 'Nothing playing'}
        </p>
        <p className="text-xs" style={{ color: theme.inkSoft }}>
          {current ? (playing ? 'Playing' : 'Paused') : 'Pick something below'}
        </p>
      </div>

      {/* A VIDEO KEEPS ITS PICTURE IN THE RAIL TOO. The rail is narrow, so this
          is small, but a video playing with no picture anywhere is a bug people
          report as "the sound is coming from nowhere". */}
      <VideoStage />

      <div className="mt-2"><Scrubber accent={theme.accent} compact /></div>
      <div className="mt-2 flex justify-center"><Transport accent={theme.accent} compact /></div>
      <div className="mt-2"><Volume accent={theme.accent} compact /></div>

      {open && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(['vault', 'playlists', 'ambience'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className="rounded-xl px-2 py-2 text-xs font-bold"
                style={
                  tab === t
                    ? { backgroundColor: theme.accent, color: inkOn(theme.accent) }
                    : { backgroundColor: theme.line, color: theme.ink }
                }
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {tab === 'vault' && (
            <div className="mt-2 space-y-2">
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Search your media…"
                aria-label="Search your media"
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{
                  backgroundColor: '#fff',
                  color: '#1E2A4A',
                  border: `1px solid ${theme.line}`,
                }}
              />

              {vault.playable.length === 0 ? (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  Your vault is empty. Save music or video below. It stays on
                  this device.
                </p>
              ) : found.length === 0 ? (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  Nothing matches “{find.trim()}”.
                </p>
              ) : (
                <ul className="space-y-1">
                  {found.map((m) => {
                    const on = current?.id === m.id;
                    return (
                      <li key={m.id}>
                        <div className="flex items-center gap-1 rounded-xl" style={rowStyle(on)}>
                          <button
                            type="button"
                            onClick={() => void vault.open(m, play)}
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                          >
                            <span aria-hidden>{m.type === 'video' ? '🎬' : '🎵'}</span>
                            <span
                              className="min-w-0 flex-1 truncate text-xs font-semibold"
                              style={{ color: theme.ink }}
                            >
                              {m.title}
                            </span>
                            {vault.opening === m.id && (
                              <span className="text-[10px]" style={{ color: theme.inkSoft }}>
                                Opening…
                              </span>
                            )}
                            {on && playing && (
                              <span
                                className="text-[10px] font-bold"
                                style={{ color: theme.accent }}
                              >
                                Playing
                              </span>
                            )}
                          </button>
                          {/* DELETING IS TWO TAPS AND THE SECOND ONE SAYS WHAT
                              IT DOES. The file is on this device and nowhere
                              else, so there is nothing to restore it from: no
                              copy on a server, no bin. A one-tap bin icon next
                              to a play button, on a phone, under the same
                              thumb, is how somebody loses a recording. */}
                          {dropping === m.id ? (
                            <button
                              type="button"
                              onClick={() => { setDropping(''); void vault.remove(m, player.stop); }}
                              className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-white"
                              style={{ backgroundColor: '#B42318' }}
                            >
                              Delete for good
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDropping(m.id)}
                              aria-label={`Remove ${m.title} from this device`}
                              className="shrink-0 px-2 py-1 text-xs"
                              style={{ color: theme.inkSoft }}
                            >
                              <CloseGlyph size={16} />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                multiple
                onChange={onFiles}
                className="hidden"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: theme.accent, color: inkOn(theme.accent) }}
              >
                {busy ? 'Saving…' : '⬆️ Save music or video'}
              </button>
              {note && (
                <p className="text-xs font-semibold" style={{ color: theme.ink }}>{note}</p>
              )}
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Original quality is kept. Whether it plays at full resolution
                depends on the file, the browser and the screen.
              </p>
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Your files stay on this device and are never uploaded.
              </p>
            </div>
          )}

          {tab === 'playlists' && (
            <div className="mt-2 space-y-1">
              {lists.lists.length === 0 && (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  No playlists yet. Make one in My Library.
                </p>
              )}
              {lists.lists.map((list) => {
                const tracks = tracksOf(list.trackIds);
                return (
                  <button
                    key={list.id}
                    type="button"
                    disabled={tracks.length === 0}
                    onClick={() => play(tracks[0], tracks)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left disabled:opacity-50"
                  >
                    <span aria-hidden>🎶</span>
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-semibold"
                      style={{ color: theme.ink }}
                    >
                      {list.name}
                    </span>
                    <span className="text-[10px]" style={{ color: theme.inkSoft }}>
                      {tracks.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'ambience' && (
            <div className="mt-2 space-y-2">
              {/* GROUPED, because they were not and it cost people. The calm
                  sounds and the masking ones are different errands, and in one
                  flat list somebody looking to read quietly kept landing on
                  the brightest thing here. The heading is the warning. */}
              {AMBIENCE_GROUPS.map((group) => (
                <div key={group.kind}>
                  <p
                    className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: theme.inkSoft }}
                  >
                    {group.heading}
                  </p>
                  <div className="space-y-1">
                    {group.tracks.map((track) => {
                      const on = current?.id === track.id;
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => play(track, AMBIENCE)}
                          className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left"
                          style={rowStyle(on)}
                        >
                          <span aria-hidden className="pt-0.5">{track.icon ?? '🎵'}</span>
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-xs font-semibold"
                              style={{ color: theme.ink }}
                            >
                              {track.title}
                            </span>
                            {track.blurb && (
                              <span
                                className="block text-[10px] leading-snug"
                                style={{ color: theme.inkSoft }}
                              >
                                {track.blurb}
                              </span>
                            )}
                          </span>
                          {on && playing && (
                            <span className="text-[10px] font-bold" style={{ color: theme.accent }}>
                              Playing
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Made on your device as it plays. No download, no data, and it
                works with no signal.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}



/**
 * The full player, and the only place it is drawn.
 *
 * WHY THE VAULT COMES FIRST. The tabs used to open on Ambience, which is the
 * one thing on this panel nobody had to go and get. Somebody who has saved
 * eight files to their phone opened the player and was offered rainfall. Your
 * own files are the reason you came; generated hush is the fallback.
 *
 * BLOB URLS ARE MADE ON PRESS AND NEVER REVOKED, and that is deliberate rather
 * than an oversight. components/MediaPlayer revokes on unmount, which is right
 * there because the element it feeds dies with the component. This player
 * outlives the page — the provider is in the root layout precisely so a track
 * keeps running while you walk back to your room — so revoking on unmount would
 * cut the sound off at the exact moment the design promises it will not. One
 * URL per file actually played, held for the session, is the cost of that.
 */
export function PlayerPanel({
  vault = [],
  theme,
  onAddMedia,
  onVaultChanged,
}: {
  /** The person's own files, saved on this device. Empty everywhere but /library. */
  vault?: MediaMeta[];
  theme?: RoomTheme;
  /** Sends somebody with an empty vault to the upload control on the page. */
  onAddMedia?: () => void;
  /**
   * Told when a file is deleted from here.
   *
   * The page that supplied `vault` owns that list, so this player cannot
   * refresh it: without this, deleting a file removes it from the device and
   * leaves it on screen until a reload.
   */
  onVaultChanged?: () => void;
}) {
  const player = usePlayer();
  const lists = usePlayerLists();
  // Same hook the rail uses, so both sizes read one list and share one object
  // URL per file rather than making a second copy of every track.
  const shelf = useVault(vault, onVaultChanged);
  // ALWAYS OPENS ON THE VAULT, even when the vault is empty. Opening on
  // Ambience when there is nothing saved hides the existence of the vault from
  // exactly the person who has not used it yet; its empty state is the thing
  // that explains what it is and carries the button that fills it.
  const [tab, setTab] = useState<Tab>('vault');
  const [newName, setNewName] = useState('');
  const [openList, setOpenList] = useState('');
  const [find, setFind] = useState('');
  const [dropping, setDropping] = useState('');
  if (!player) return null;
  const { current, playing, play } = player;

  const accent = theme?.accent ?? '#1E2A4A';

  const playableVault = shelf.playable;
  const needle = find.trim().toLowerCase();
  const foundVault = needle
    ? playableVault.filter((m) => m.title.toLowerCase().includes(needle))
    : playableVault;

  // Everything the player can reach, so a playlist can hold ambience and your
  // own recordings side by side. Somebody wanting rainfall behind a sermon
  // should not need two players to do it.
  const everything = [...AMBIENCE, ...shelf.opened];
  const byId = new Map(everything.map((t) => [t.id, t]));
  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-navy">🎧 Beacon media player</h2>
        <Credit className="text-navy" />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Your own music and video, played here in full size, or something quiet
        in the background while you read. Files stay on this device.
      </p>

      {/* The picture, when there is one. Nothing is drawn for audio, so a
          music track does not leave a black rectangle on the page. */}
      <VideoStage />

      <div className="mt-4 rounded-2xl bg-gray-50 p-4">
        <p className="truncate text-lg font-bold text-navy">
          {current ? `${current.icon ?? ''} ${current.title}`.trim() : 'Nothing playing'}
        </p>
        <p className="text-sm text-gray-500">
          {current ? (playing ? 'Playing' : 'Paused') : 'Choose a track'}
        </p>

        <div className="mt-3"><Scrubber accent={accent} /></div>

        {/* Transport centred, volume off to one side. Centring the transport is
            not decoration: it is where a thumb goes on a phone, and it is where
            every player people already use puts it. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="mx-auto sm:mx-0"><Transport accent={accent} /></div>
          <div className="w-full sm:w-44"><Volume accent={accent} /></div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['vault', 'playlists', 'ambience'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`tap-sm rounded-xl px-3 py-2 text-sm font-bold ${
              tab === t ? '' : 'bg-gray-100 text-navy hover:bg-gray-200'
            }`}
            // The writing the accent can carry: white on Classic's deep
            // accents, dark ink on a light one (6 October 2026: white on
            // Warm Office's gold read 3.0:1, and on Focus's light blue 1.6:1).
            style={tab === t ? { backgroundColor: accent, color: inkOn(accent) } : undefined}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* YOUR OWN FILES. Searchable because a vault worth having is a vault too
          long to scroll, and the name you remember is the fastest way in. */}
      {tab === 'vault' && (
        <div className="mt-3 space-y-2">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Search your media…"
            aria-label="Search your media"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          {playableVault.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              <p>Your vault is empty. Save music or video below and it plays here.</p>
              <p className="mt-1">Your files stay on this device and are never uploaded.</p>
              {onAddMedia && (
                <button
                  type="button"
                  onClick={onAddMedia}
                  className="tap mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 text-lg font-semibold"
                  style={{ backgroundColor: accent, color: inkOn(accent) }}
                >
                  ⬆️ Save music or video
                </button>
              )}
            </div>
          ) : foundVault.length === 0 ? (
            <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              Nothing in your vault matches “{find.trim()}”.
            </p>
          ) : (
            <div className="space-y-1.5">
              {foundVault.map((m) => {
                const on = current?.id === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-xl ${on ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <button
                      type="button"
                      onClick={() => void shelf.open(m, play)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span aria-hidden className="text-lg">{m.type === 'video' ? '🎬' : '🎵'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-navy">
                          {m.title}
                        </span>
                        <span className="block text-xs text-gray-500">{humanSize(m.size)}</span>
                      </span>
                      {shelf.opening === m.id && <span className="text-xs text-gray-500">Opening…</span>}
                      {on && playing && (
                        <span className="text-xs font-bold" style={{ color: accent }}>Playing</span>
                      )}
                    </button>
                    {/* Two taps, and the second one names what happens. The file
                        lives on this device and nowhere else: nothing restores
                        it. See the rail's copy of this for the longer note. */}
                    {dropping === m.id ? (
                      <button
                        type="button"
                        onClick={() => { setDropping(''); void shelf.remove(m, player.stop); }}
                        className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Delete for good
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDropping(m.id)}
                        aria-label={`Remove ${m.title} from this device`}
                        className="shrink-0 px-3 py-1.5 text-sm text-gray-500 hover:text-red-700"
                      >
                        <CloseGlyph size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PLAYLISTS. Kept on this device, never uploaded: what somebody listens
          to while they read is nobody else's business, and a church database is
          a place other people can see. */}
      {tab === 'playlists' && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name a playlist, for example Sabbath study"
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <Button
              variant="ghost"
              disabled={!newName.trim()}
              onClick={() => {
                // Seeded with whatever is playing, because the moment somebody
                // wants a playlist is usually while listening to something.
                lists.create(newName, current ? [current.id] : []);
                setNewName('');
              }}
            >
              Create
            </Button>
          </div>

          {lists.lists.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              No playlists yet. Name one above, then use <strong>Add to playlist</strong>
              {' '}on any track.
            </p>
          )}

          {lists.lists.map((list) => {
            const tracks = tracksOf(list.trackIds);
            const open = openList === list.id;
            return (
              <div key={list.id} className="rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenList(open ? '' : list.id)}
                    className="flex-1 text-left font-semibold text-navy underline underline-offset-2"
                  >
                    {list.name}
                  </button>
                  <span className="text-xs text-gray-500">
                    {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                  </span>
                  <Button
                    disabled={tracks.length === 0}
                    onClick={() => play(tracks[0], tracks)}
                  >
                    Play
                  </Button>
                  <button
                    type="button"
                    onClick={() => lists.remove(list.id)}
                    className="text-xs font-semibold text-red-700 underline"
                  >
                    Delete
                  </button>
                </div>
                {open && (
                  <ul className="mt-2 space-y-1">
                    {tracks.length === 0 && (
                      <li className="text-sm text-gray-500">
                        {/* A saved playlist can name a file that has not been
                            opened yet this session, so it has no URL to play.
                            Saying that beats an empty list that looks broken. */}
                        Nothing in here yet, or its tracks have not been opened
                        from the Vault yet this session.
                      </li>
                    )}
                    {tracks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => play(t, tracks)}
                          className="min-w-0 flex-1 truncate text-left font-semibold text-navy"
                        >
                          {t.icon ?? '🎵'} {t.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => lists.removeFrom(list.id, t.id)}
                          className="text-xs font-semibold text-red-700 underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'ambience' && (
        <div className="mt-3 space-y-3">
          {/* TWO GROUPS, NOT ONE LIST. "Some of it are not pleasing" -- and it
              was one flat list of five, so the sound built to cut through a
              conversation sat beside the one built to read to, with nothing
              between them. The heading and the note under it are the whole
              fix: somebody who wants quiet can now see which half to stay in,
              and somebody who wants masking can find it deliberately. */}
          {AMBIENCE_GROUPS.map((group) => (
            <div key={group.kind}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
                {group.heading}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-gray-500">{group.note}</p>
              <div className="mt-1.5 space-y-1.5">
                {group.tracks.map((track) => {
                  const on = current?.id === track.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => play(track, AMBIENCE)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${
                        on ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span aria-hidden className="pt-0.5 text-lg">{track.icon ?? '🎵'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-navy">
                          {track.title}
                        </span>
                        {/* The line that says what it sounds like, which has
                            existed in lib/noise.ts since the day it was
                            written and has never been drawn anywhere. */}
                        {track.blurb && (
                          <span className="block text-xs leading-snug text-gray-500">
                            {track.blurb}
                          </span>
                        )}
                      </span>
                      {on && playing && (
                        <span className="shrink-0 text-xs font-bold" style={{ color: accent }}>
                          Playing
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* AMBIENCE IS GENERATED, and saying so is worth a line: somebody on a
              phone plan needs to know this costs them nothing and works with no
              signal. */}
          <p className="pt-1 text-xs text-gray-500">
            Made on your device as it plays. No download, no data, and it works
            with no signal.
          </p>
        </div>
      )}

      {/* ADD TO PLAYLIST, where the tracks are. A select rather than a menu: it
          is one tap on a phone and needs no dismiss logic. Drawn only when a
          playlist exists, so it never offers an empty list. */}
      {tab !== 'playlists' && lists.lists.length > 0 && current && (
        <label className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-2.5 text-sm">
          <span className="font-semibold text-navy">Add what is playing to</span>
          <select
            value=""
            onChange={(e) => { if (e.target.value) lists.addTo(e.target.value, current.id); }}
            className="rounded-xl border border-gray-300 px-2 py-1"
          >
            <option value="">Choose a playlist…</option>
            {lists.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
    </Card>
  );
}
