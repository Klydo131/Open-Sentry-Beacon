'use client';

// Recording a voice message, in the browser, with nothing to install.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 1 OCTOBER 2026, among the things people expect from a chat app:
// "Voice messages". For somebody who finds typing slow -- an older member, or
// anybody explaining something that matters -- speaking is the easier way to
// say it, and it is how a great many people message every day.
//
// TAP TO START, THEN CANCEL OR SEND. Not hold-to-talk: holding a button down
// for a minute is hard on an older hand, and a slip of the thumb sends
// something half-said. Two clear buttons are slower by one tap and never send
// by accident.
//
// THE MICROPHONE IS ASKED FOR ON THE TAP, NEVER BEFORE, and released the moment
// recording stops or is cancelled, so the phone's "microphone in use" light
// goes off when it should. next.config.mjs allows the microphone for this site
// only (Permissions-Policy: microphone=(self)); camera and location stay off.
//
// TWO MINUTES AT MOST. Long enough to explain something properly; short
// enough that one message is not the storage of fifty. At the limit recording
// stops and waits for Send or Cancel -- it never sends on its own.
//
// THE FORMAT IS WHATEVER THE BROWSER RECORDS WELL, in this order: mp4 (Safari,
// and the format every phone plays), webm (Chrome, Android), ogg (Firefox).
// The private file store accepts all three (migration 20261001120000). An
// older iPhone cannot play webm; the player then offers the file instead.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

/** The longest a voice message may be, in milliseconds. */
export const VOICE_MAX_MS = 2 * 60 * 1000;

/** What a voice message's file is called. ChatView recognises it by this. */
export const VOICE_TITLE = 'Voice message';

/** Is this attachment a voice message, rather than an audio file somebody chose? */
export function isVoiceTitle(title: string): boolean {
  return title === VOICE_TITLE || title.startsWith(`${VOICE_TITLE}.`);
}

const CANDIDATES: { mime: string; ext: string }[] = [
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

/** Can this browser record at all? Needs a secure page and MediaRecorder. */
export function canRecordVoice(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (typeof window.MediaRecorder === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return CANDIDATES.some((c) => MediaRecorder.isTypeSupported(c.mime));
}

function pickFormat(): { mime: string; ext: string } | null {
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

export type VoiceState = 'idle' | 'asking' | 'recording' | 'ready';

/**
 * Record one voice message.
 *
 *   const voice = useVoiceRecorder();
 *   voice.start();                 // asks for the microphone, then records
 *   const file = await voice.finish();   // stops if needed; the File to send
 *   voice.cancel();                // throws it away
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const format = useRef<{ mime: string; ext: string } | null>(null);
  const startedAt = useRef(0);
  const tick = useRef(0);
  const stopped = useRef<Promise<void> | null>(null);
  // WHICH REQUEST IS STILL WANTED. Asking for the microphone waits on the
  // person answering the browser's prompt, and they may press Cancel or leave
  // the conversation meanwhile. Each start() takes a number; cancel() and
  // leaving move it on, and a microphone granted to a request that is no
  // longer wanted is put straight back down. Without this, Cancel during the
  // prompt was ignored and recording began when the prompt was answered, and
  // leaving during the prompt left the microphone on, unseen, for two minutes.
  // Found by the security review of 1 October 2026.
  const attempt = useRef(0);

  const release = useCallback(() => {
    window.clearInterval(tick.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // Stop recording; resolves when the last chunk has arrived.
  const stop = useCallback((): Promise<void> => {
    const rec = recorder.current;
    if (!rec || rec.state === 'inactive') return stopped.current ?? Promise.resolve();
    stopped.current = new Promise<void>((resolve) => {
      rec.addEventListener('stop', () => resolve(), { once: true });
    });
    rec.stop();
    release();
    setState('ready');
    return stopped.current;
  }, [release]);

  const start = useCallback(async () => {
    setError('');
    if (!canRecordVoice()) {
      setError('This browser cannot record a voice message. You can still type, or attach a recording.');
      return;
    }
    setState('asking');
    const mine = ++attempt.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (mine !== attempt.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const chosen = pickFormat();
      if (!chosen) throw new Error('no format');
      stream.current = media;
      format.current = chosen;
      chunks.current = [];
      const rec = new MediaRecorder(media, { mimeType: chosen.mime });
      rec.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      });
      recorder.current = rec;
      stopped.current = null;
      // The microphone taken away (unplugged, or switched off in the phone's
      // settings) ends the recording rather than leaving it silently empty.
      media.getAudioTracks().forEach((t) => t.addEventListener('ended', () => { void stop(); }, { once: true }));
      rec.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setState('recording');
      tick.current = window.setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= VOICE_MAX_MS) void stop();
      }, 200);
    } catch (cause) {
      if (mine !== attempt.current) return;
      release();
      setState('idle');
      const denied = cause instanceof DOMException
        && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setError(denied
        ? 'The microphone is switched off for this app. Allow it in your browser\'s settings to send a voice message.'
        : 'The microphone could not be started. Check that one is connected and not in use by another app.');
    }
  }, [release, stop]);

  /** Stop if still recording, and hand back the recording as a File. */
  const finish = useCallback(async (): Promise<File | null> => {
    attempt.current += 1; // a prompt still open cannot start a recording now
    await stop();
    const fmt = format.current;
    const parts = chunks.current;
    recorder.current = null;
    chunks.current = [];
    setState('idle');
    setElapsed(0);
    if (!fmt || parts.length === 0) return null;
    // The plain type, without `;codecs=`: it is what the file store compares
    // against its list, and what a player needs.
    const type = fmt.mime.split(';')[0];
    return new File(parts, `${VOICE_TITLE}.${fmt.ext}`, { type });
  }, [stop]);

  const cancel = useCallback(() => {
    attempt.current += 1;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    release();
    recorder.current = null;
    chunks.current = [];
    setState('idle');
    setElapsed(0);
  }, [release]);

  // Leaving the conversation mid-recording puts the microphone down, and a
  // prompt still open when you leave can no longer start it.
  useEffect(() => () => {
    attempt.current += 1;
    window.clearInterval(tick.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { state, elapsed, error, clearError: () => setError(''), start, finish, cancel };
}
