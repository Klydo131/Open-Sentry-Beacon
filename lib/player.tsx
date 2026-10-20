'use client';

// One media player, shared by every screen that shows it (the library page and
// the rail strip), provided from the root layout so it survives navigation.
//
// There is one <video> element (it plays audio too), parked in a visually
// hidden but laid-out node; a full player adopts it into its stage and hands it
// back on unmount, so playback never stops. A detached or display:none element
// can be stopped by the browser.
//
// The credit line comes from NEXT_PUBLIC_PLAYER_CREDIT; unset, nothing is drawn.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { KINDS, VOICES, noiseBuffer, voiceFor, type AmbienceKind, type Voice } from '@/lib/noise';

export function playerCredit(): string {
  return (process.env.NEXT_PUBLIC_PLAYER_CREDIT ?? '').trim();
}

export interface Track {
  id: string;
  title: string;
  /** A URL for real media, or absent for a generated ambience. */
  url?: string;
  /** Set for generated sound: the key of a voice in lib/noise.ts. */
  noise?: string;
  /** True when there is a picture to show. */
  video?: boolean;
  icon?: string;
  /** One line describing the sound (ambience only). */
  blurb?: string;
}

interface PlayerValue {
  current: Track | null;
  playing: boolean;
  volume: number;
  muted: boolean;
  queue: Track[];
  /** Seconds. Zero for generated ambience, which has no length. */
  position: number;
  duration: number;
  /** True while the browser is still fetching enough to play. */
  loading: boolean;
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  /** Move by a number of seconds, positive or negative. */
  nudge: (seconds: number) => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  /**
   * Hands the video element to a container that wants to show it, and gives it
   * back when that container goes away. Returns a cleanup function.
   */
  attachVideo: (host: HTMLElement | null) => void;
  hasVideo: boolean;
}

const Ctx = createContext<PlayerValue | null>(null);

/** Where the element lives when nothing is showing it. */
function parkingSpot(): HTMLElement {
  const id = 'beacon-player-park';
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    // Visually hidden but in the document and laid out: display:none or
    // visibility:hidden would let the browser stop the media.
    node.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;'
      + 'opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(node);
  }
  return node;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const media = useRef<HTMLVideoElement | null>(null);
  const host = useRef<HTMLElement | null>(null);
  // Web Audio for generated ambience only, created on the first press (an
  // AudioContext made before a gesture stays suspended on iOS).
  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  // Where generated sound leaves the graph (see openOutput).
  const sink = useRef<MediaStreamAudioDestinationNode | null>(null);
  // The low-pass and the swell's gain and oscillator, kept so they can be
  // stopped and disconnected (a running oscillator leaks).
  const shape = useRef<{ nodes: AudioNode[]; lfo: OscillatorNode | null }>({ nodes: [], lfo: null });
  // A chime strikes notes on a chain of timeouts of varying length; cleared when the sound stops.
  const striker = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<OscillatorNode[]>([]);

  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [volume, setVol] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  /** The one element, made once, parked when nothing is showing it. */
  const element = useCallback((): HTMLVideoElement => {
    if (media.current) return media.current;
    const el = document.createElement('video');
    el.playsInline = true;
    el.preload = 'metadata';
    el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block';
    media.current = el;
    (host.current ?? parkingSpot()).appendChild(el);
    return el;
  }, []);

  const stopNoise = useCallback(() => {
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
    // The swell's oscillator does not stop with the noise; stop it too.
    if (striker.current) { clearTimeout(striker.current); striker.current = null; }
    for (const osc of held.current) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    held.current = [];
    try { shape.current.lfo?.stop(); } catch { /* already stopped */ }
    for (const node of shape.current.nodes) {
      try { node.disconnect(); } catch { /* already gone */ }
    }
    shape.current = { nodes: [], lfo: null };
    if (sink.current && media.current) {
      try { media.current.pause(); } catch { /* not playing */ }
    }
  }, []);

  /**
   * Build the sound: buffer -> [low-pass] -> [swelling gain] -> master -> output.
   * The low-pass removes the hiss above a few kHz; the swell is a slow sine on
   * the gain, on its own oscillator so it never lines up with the 2-second loop.
   * A voice with neither stage plays raw ("Plain hush").
   */
  /**
   * A struck note that rings and fades: two slightly detuned partials, a near
   * instant attack and an exponential fall (which cannot reach zero, so the note
   * is stopped after).
   */
  const strike = useCallback((c: AudioContext, to: AudioNode, hz: number, level: number) => {
    const now = c.currentTime;
    const ring = 3.5 + Math.random() * 2.5;

    const shell = c.createGain();
    shell.gain.setValueAtTime(0.0001, now);
    shell.gain.exponentialRampToValueAtTime(level, now + 0.01);
    shell.gain.exponentialRampToValueAtTime(0.0001, now + ring);
    shell.connect(to);

    for (const [ratio, share] of [[1, 1], [2.76, 0.28]] as const) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      // About the first inharmonic partial of a struck bar, so it reads as metal.
      osc.frequency.value = hz * ratio;
      const part = c.createGain();
      part.gain.value = share;
      osc.connect(part);
      part.connect(shell);
      osc.start(now);
      osc.stop(now + ring + 0.1);
    }
  }, []);

  /**
   * Route generated sound through a MediaStream on the player's media element.
   * On iOS the silent switch mutes Web Audio but not media, so this keeps
   * ambience audible and puts it under the volume buttons. If the stream will
   * not play, fall back to the speakers directly.
   */
  const openOutput = useCallback((c: AudioContext, master: GainNode) => {
    const direct = () => {
      try { master.connect(c.destination); } catch { /* already connected */ }
    };
    let out: MediaStreamAudioDestinationNode;
    try {
      if (typeof c.createMediaStreamDestination !== 'function') { direct(); return; }
      out = c.createMediaStreamDestination();
      master.connect(out);
      const el = element();
      el.srcObject = out.stream;
      el.muted = false;
      sink.current = out;
    } catch {
      direct();
      return;
    }
    // play() refused: use the direct route instead (never both, or it doubles the level).
    void el_play(element(), direct);
  }, [element]);

  const startNoise = useCallback((key: string, v: number) => {
    if (!ctx.current) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current = new Ctor();
    }
    const c = ctx.current;
    void c.resume();
    stopNoise();

    // An unknown key still plays something.
    const voice = voiceFor(key) ?? VOICES[0];

    if (!gain.current) {
      gain.current = c.createGain();
      openOutput(c, gain.current);
    } else if (sink.current) {
      // Re-attach the stream to the element each time: play() and stopNoise move it.
      const el = element();
      if (el.srcObject !== sink.current.stream) {
        el.removeAttribute('src');
        el.srcObject = sink.current.stream;
      }
      el.muted = false;
      void el_play(el, () => {});
    }
    gain.current.gain.value = v;

    // Chimes and chords, which are notes rather than a looped buffer.
    if (voice.engine === 'chime' && voice.notes?.length) {
      const notes = voice.notes;
      // Measured: this level puts a repeated strike in the same loudness range as the noise voices.
      const level = 0.34;
      // Gaps short enough that silence is never mistaken for a fault.
      const gap = voice.key === 'chapel-bells' ? 4200 : 1900;
      const ring = () => {
        const hz = notes[Math.floor(Math.random() * notes.length)];
        strike(c, gain.current as AudioNode, hz, level);
      };
      ring();
      // Each wait is randomised around the gap, so it never sounds like a metronome.
      const tick = () => {
        striker.current = setTimeout(() => {
          ring();
          tick();
        }, gap * (0.45 + Math.random()));
      };
      tick();
      source.current = null;
      shape.current = { nodes: [], lfo: null };
      return;
    }

    if (voice.engine === 'pad' && voice.notes?.length) {
      // A held chord: each note swells at its own unrelated rate, so it never pulses.
      const made: AudioNode[] = [];
      voice.notes.forEach((hz, i) => {
        const osc = c.createOscillator();
        osc.type = 'triangle';   // one soft harmonic more than a sine
        osc.frequency.value = hz;

        const swell = c.createGain();
        // Still the quietest voice, but audible on a phone speaker.
        const depth = 0.10;
        swell.gain.value = depth;

        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.031 + i * 0.012;
        const amount = c.createGain();
        amount.gain.value = depth * 0.7;
        lfo.connect(amount);
        amount.connect(swell.gain);
        lfo.start();

        // A gentle low-pass so the upper harmonics never sound glassy.
        const soft = c.createBiquadFilter();
        soft.type = 'lowpass';
        // Phone speakers have almost nothing below ~500 Hz, so the lid sits higher.
        soft.frequency.value = 1400;
        soft.Q.value = 0.6;

        osc.connect(soft);
        soft.connect(swell);
        swell.connect(gain.current as AudioNode);
        osc.start();

        held.current.push(osc, lfo);
        made.push(swell, amount, soft);
      });
      source.current = null;
      shape.current = { nodes: made, lfo: null };
      return;
    }

    const node = c.createBufferSource();
    node.buffer = noiseBuffer(c, voice.colour);
    node.loop = true;

    const made: AudioNode[] = [];
    let tail: AudioNode = node;

    if (voice.cutoff) {
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = voice.cutoff;
      // Q below 0.707 avoids a resonant peak at the corner frequency.
      filter.Q.value = 0.6;
      tail.connect(filter);
      made.push(filter);
      tail = filter;

      // Make up the level the low-pass removed (`trim` in lib/noise.ts).
      if (voice.trim && voice.trim !== 1) {
        const lift = c.createGain();
        lift.gain.value = voice.trim;
        tail.connect(lift);
        made.push(lift);
        tail = lift;
      }
    }

    let lfo: OscillatorNode | null = null;
    if (voice.sway) {
      const swell = c.createGain();
      // The swell only dips below the chosen level, never above it.
      swell.gain.value = 1 - voice.sway.depth;

      lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = voice.sway.hz;
      const depth = c.createGain();
      depth.gain.value = voice.sway.depth;
      lfo.connect(depth);
      depth.connect(swell.gain);
      lfo.start();

      tail.connect(swell);
      made.push(swell, depth);
      tail = swell;
    }

    tail.connect(gain.current);
    node.start();
    source.current = node;
    shape.current = { nodes: made, lfo };
  }, [stopNoise, strike, element, openOutput]);

  const play = useCallback((track: Track, nextQueue?: Track[]) => {
    if (nextQueue) setQueue(nextQueue);
    setCurrent(track);
    setPlaying(true);
    setPosition(0);
    setDuration(0);

    if (track.noise) {
      // Pause rather than clear the source: clearing fires an error in some browsers.
      element().pause();
      setLoading(false);
      startNoise(track.noise, muted ? 0 : volume);
      return;
    }
    stopNoise();
    const el = element();
    setLoading(true);
    // srcObject overrides src, so detach the ambience stream, but keep the sink:
    // the audio graph is still wired to it.
    el.srcObject = null;
    el.src = track.url ?? '';
    el.volume = volume;
    el.muted = muted;
    void el.play().catch(() => { setPlaying(false); setLoading(false); });
  }, [element, startNoise, stopNoise, volume, muted]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (playing) {
      if (current.noise) stopNoise(); else element().pause();
      setPlaying(false);
      return;
    }
    if (current.noise) startNoise(current.noise, muted ? 0 : volume);
    else void element().play().catch(() => setPlaying(false));
    setPlaying(true);
  }, [current, playing, element, startNoise, stopNoise, volume, muted]);

  const step = useCallback((by: 1 | -1) => {
    if (!current || queue.length === 0) return;
    const at = queue.findIndex((t) => t.id === current.id);
    const target = queue[at + by];
    if (target) play(target, queue);
  }, [current, queue, play]);

  const next = useCallback(() => step(1), [step]);

  /** Back to the start of this track, or to the previous one if already at the start. */
  const previous = useCallback(() => {
    if (!current) return;
    if (!current.noise && element().currentTime > 3) {
      element().currentTime = 0;
      setPosition(0);
      return;
    }
    step(-1);
  }, [current, element, step]);

  const seek = useCallback((seconds: number) => {
    if (!current || current.noise) return;
    const el = element();
    const clamped = Math.max(0, Math.min(seconds, el.duration || 0));
    el.currentTime = clamped;
    setPosition(clamped);
  }, [current, element]);

  const nudge = useCallback((seconds: number) => {
    if (!current || current.noise) return;
    seek((element().currentTime || 0) + seconds);
  }, [current, element, seek]);

  const stop = useCallback(() => {
    stopNoise();
    const el = media.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    setPlaying(false);
    setCurrent(null);
    setPosition(0);
    setDuration(0);
  }, [stopNoise]);

  const setVolume = useCallback((v: number) => {
    setVol(v);
    // Moving the slider off zero unmutes.
    if (v > 0 && muted) setMuted(false);
    if (media.current) { media.current.volume = v; media.current.muted = v === 0 ? media.current.muted : false; }
    if (gain.current) gain.current.gain.value = v;
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nextMuted = !m;
      if (media.current) media.current.muted = nextMuted;
      if (gain.current) gain.current.gain.value = nextMuted ? 0 : volume;
      return nextMuted;
    });
  }, [volume]);

  /** Move the element into a visible stage, or back to the parking spot; moving it does not interrupt playback. */
  const attachVideo = useCallback((next: HTMLElement | null) => {
    host.current = next;
    const el = media.current;
    if (!el) return;
    (next ?? parkingSpot()).appendChild(el);
  }, []);

  // Every element event, one listener set.
  useEffect(() => {
    const el = element();
    const onTime = () => setPosition(el.currentTime || 0);
    const onMeta = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setLoading(false);
    };
    const onEnd = () => next();
    const onWait = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onPause = () => setPlaying(false);
    const onPlayEv = () => setPlaying(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('waiting', onWait);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlayEv);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('waiting', onWait);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlayEv);
    };
  }, [element, next]);

  const value = useMemo(
    () => ({
      current, playing, volume, muted, queue, position, duration, loading,
      play, toggle, next, previous, seek, nudge, stop, setVolume, toggleMute,
      attachVideo, hasVideo: Boolean(current?.video),
    }),
    [current, playing, volume, muted, queue, position, duration, loading,
     play, toggle, next, previous, seek, nudge, stop, setVolume, toggleMute, attachVideo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside the provider, rather than throwing. */
export function usePlayer(): PlayerValue | null {
  return useContext(Ctx);
}

/** mm:ss, or h:mm:ss past an hour. Empty for a length nobody knows yet. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Start a media element, and call `onRefused` if play() is rejected. */
function el_play(el: HTMLVideoElement, onRefused: () => void): Promise<void> {
  try {
    const started = el.play();
    if (!started || typeof started.catch !== 'function') return Promise.resolve();
    return started.catch(() => { onRefused(); });
  } catch {
    onRefused();
    return Promise.resolve();
  }
}

/** The generated ambience, as tracks. Always available, needs no network. */
export const AMBIENCE: Track[] = VOICES.map((v) => ({
  id: `ambience-${v.key}`,
  title: v.label,
  noise: v.key,
  icon: v.icon,
  blurb: v.blurb,
}));

/** The ambience voices in their groups, for both player views. Empty groups are dropped. */
export const AMBIENCE_GROUPS: {
  kind: AmbienceKind;
  heading: string;
  note: string;
  tracks: Track[];
}[] = KINDS
  .map((k) => ({
    ...k,
    tracks: AMBIENCE.filter((t) => voiceFor(t.noise ?? '')?.kind === k.kind),
  }))
  .filter((g) => g.tracks.length > 0);
