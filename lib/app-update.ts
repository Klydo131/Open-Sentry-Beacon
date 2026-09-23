'use client';

import { useEffect, useState } from 'react';
import { isBelowFloor } from './min-build.mjs';

// -------------------------------------------------------------------------
// "Am I running the latest version?"
//
// The service worker already replaces itself silently when a new build is
// deployed, so nobody has to uninstall and reinstall. But silent is also
// invisible: there was no way to tell a fresh build from a stale one, which is
// exactly the doubt that makes people reinstall anyway "just in case".
//
// This is the small piece of shared state that answers the question. The
// registration lives in components/ServiceWorker.tsx and reports into here;
// any screen can read it, and the banner and the Settings panel both do.
// -------------------------------------------------------------------------

export type UpdateState =
  | 'unsupported' // no service worker (dev build, or a browser without it)
  | 'current' // checked, and this is the newest build
  | 'checking' // asking the server right now
  | 'ready' // a new build is downloaded and waiting to take over
  | 'required'; // this build is older than the server will support: must update

interface Snapshot {
  state: UpdateState;
  /** When we last successfully asked the server. */
  checkedAt: number | null;
  /** Set once a new worker is installed and waiting. */
  apply: (() => void) | null;
}

let snapshot: Snapshot = { state: 'unsupported', checkedAt: null, apply: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setUpdateState(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function getUpdateState(): Snapshot {
  return snapshot;
}

/** Ask the server for a new build now. Wired up by ServiceWorker.tsx. */
let checker: (() => Promise<void>) | null = null;
export function setChecker(fn: (() => Promise<void>) | null) {
  checker = fn;
}

// The live service worker registration, handed over by ServiceWorker.tsx.
//
// Applying an update used to mean one thing: throw every cache away, unregister
// the worker and fetch the whole app again. That always works, and on a phone on
// church wi-fi it is the slowest thing the app can possibly do — the new copy
// re-downloads every chunk and re-precaches fifteen routes before anybody sees a
// screen. The fast path was already sitting there unused: if a new worker has
// finished installing, it is holding the new build ALREADY DOWNLOADED, and
// handing over to it is a page reload rather than a re-download.
//
// So the registration is shared, the new build is fetched in the background the
// moment we learn one exists, and by the time somebody taps Restart the work is
// usually done. The wipe stays as the fallback for when there is no waiting
// worker, which is the case that made people reinstall.
let registration: ServiceWorkerRegistration | null = null;
export function setRegistration(reg: ServiceWorkerRegistration | null) {
  registration = reg;
}

// Set when the user has asked for the update, so ServiceWorker.tsx's
// controllerchange handler knows to reload. Without it a worker taking control
// for the first time would reload the page under somebody mid-sentence.
let applying = false;
export function isApplying(): boolean {
  return applying;
}

/**
 * Ask the worker to fetch the new build and wait, briefly, for it to install.
 * Resolves with a worker ready to take over, or null if none arrived in time.
 */
async function readyWorker(timeoutMs = 8000): Promise<ServiceWorker | null> {
  const reg = registration;
  if (!reg) return null;
  if (reg.waiting) return reg.waiting;
  try {
    await reg.update();
  } catch {
    return null;
  }
  if (reg.waiting) return reg.waiting;

  const installing = reg.installing;
  if (!installing) return null;
  return new Promise((resolve) => {
    const done = (w: ServiceWorker | null) => {
      clearTimeout(timer);
      installing.removeEventListener('statechange', onChange);
      resolve(w);
    };
    const onChange = () => {
      if (installing.state === 'installed') done(reg.waiting ?? installing);
      // redundant means this worker lost — a newer one superseded it, or the
      // install failed. Either way there is nothing here to hand over to.
      else if (installing.state === 'redundant') done(null);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    installing.addEventListener('statechange', onChange);
  });
}

/** Start downloading a known-newer build now, so Restart is a reload later. */
function warmUpdate() {
  void readyWorker().catch(() => {});
}

/**
 * Apply the update. Fast path first, wipe-and-refetch as the fallback.
 *
 * The timeout is not paranoia. A wedged worker never answers SKIP_WAITING, and
 * then Restart is a button that visibly does nothing — worse than no button, and
 * the dead end that made people reinstall in the first place.
 */
export async function applyUpdate(): Promise<void> {
  const worker = await readyWorker(8000);
  if (!worker) {
    await hardRefresh();
    return;
  }
  applying = true;
  worker.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => {
    // Offline, a wipe would leave nothing to load. Better stuck than blank.
    if (navigator.onLine !== false) void hardRefresh();
  }, 3000);
}
// Ask the SERVER what build it is running, ignoring the service worker entirely.
//
// This is the check that cannot be fooled. The worker-based one can only report
// an update if the browser decides the worker script changed, and when that
// judgement goes wrong the app insists it is current while the server has moved
// on — which is exactly the state people were stuck in, with reinstalling as the
// only escape. Comparing the server's build id against the one baked into this
// bundle needs no cooperation from anything that might already be broken.
export interface ServerCheck {
  /** How this bundle compares with what the server is serving. */
  build: 'same' | 'newer' | 'unknown';
  /**
   * True when the server says this bundle is older than the oldest it still
   * supports. Only ever true alongside `build: 'newer'`: the floor is clamped
   * to the server's own build, so the build a server is serving is never below
   * its own floor. See lib/min-build.mjs.
   */
  required: boolean;
}

export async function checkServerBuild(): Promise<ServerCheck> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return { build: 'unknown', required: false };
    const data = (await res.json()) as { build?: string; minBuildTime?: string | null };
    if (!data.build || data.build === 'dev') return { build: 'unknown', required: false };
    if (data.build === BUILD_ID) return { build: 'same', required: false };
    return { build: 'newer', required: isBelowFloor(BUILD_TIME, data.minBuildTime) };
  } catch {
    // Offline is not staleness — say nothing rather than nag.
    return { build: 'unknown', required: false };
  }
}

export async function checkForUpdate(): Promise<void> {
  // A required update is not something a later check may quietly undo. Once the
  // server has said this build is too old, only a successful answer saying
  // otherwise should clear it, and the code below never produces one while the
  // bundle is unchanged. Skipping the 'checking' flicker here also stops the
  // blocking screen dissolving for a moment every fifteen minutes.
  const wasRequired = snapshot.state === 'required';
  if (!wasRequired) setUpdateState({ state: 'checking' });

  // The authoritative check first.
  const server = await checkServerBuild();

  if (server.required) {
    warmUpdate();
    setUpdateState({
      state: 'required',
      checkedAt: Date.now(),
      apply: () => void applyUpdate(),
    });
    return;
  }

  // Offline, or a server that would not answer. Hold whatever we already knew
  // rather than downgrading a real finding to "current".
  if (wasRequired && server.build === 'unknown') return;

  if (server.build === 'newer') {
    // Start downloading it NOW, while the banner is being read, rather than
    // when it is tapped. This is most of the speed: by the time somebody
    // decides to restart, the new build is usually already on the device and
    // applying it is a handover instead of a re-download.
    warmUpdate();
    setUpdateState({
      state: 'ready',
      checkedAt: Date.now(),
      // applyUpdate hands over to a waiting worker when there is one and falls
      // back to throwing the cached copy away when there is not. Either way
      // localStorage and IndexedDB survive, so nothing the person owns is lost.
      apply: () => void applyUpdate(),
    });
    return;
  }

  if (!checker) {
    setUpdateState({
      state: server.build === 'same' ? 'current' : 'unsupported',
      checkedAt: Date.now(),
    });
    return;
  }

  try {
    await checker();
    // If the worker check turned up a new build, `state` is already 'ready' —
    // don't stomp on it. 'required' is cleared here and only here: reaching this
    // line means the server answered, named a build id equal to ours, and did
    // not put a floor above it. That is the one honest way out of the blocking
    // screen without a reload, and it covers a release being rolled back.
    const now = getUpdateState().state;
    if (now === 'checking' || now === 'required') {
      setUpdateState({ state: 'current', checkedAt: Date.now() });
    }
  } catch {
    setUpdateState({ state: 'current', checkedAt: Date.now() });
  }
}

export function useUpdateState(): Snapshot {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snapshot;
}

// The build this bundle was compiled from, stamped by scripts/stamp-build.mjs.
// The server route imports the very same constants, which is the point: read
// from process.env instead and the two sides can end up with different values,
// and the app then insists an update is waiting that does not exist.
export { BUILD_ID, BUILD_TIME } from './build-info';
import { BUILD_ID, BUILD_TIME } from './build-info';

/** A short, human version string, e.g. "29 Jul 2026 · 4k2j9x". */
export function versionLabel(): string {
  if (!BUILD_TIME) return `Development build (${BUILD_ID})`;
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return BUILD_ID;
  return `${d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${BUILD_ID}`;
}

// The escape hatch for an installed app stuck on an old build.
//
// The normal path is enough almost always: the worker checks for a new deploy on
// launch, on focus and hourly, and the banner offers a one-tap restart. But when
// an installed copy is wedged — a worker that failed to activate, a shell served
// from a cache that will not let go — the only honest remedy is to throw the
// cached copy away and fetch the app again from scratch.
//
// This deliberately touches ONLY the service worker and the Cache API. Anything
// the person owns lives in localStorage and IndexedDB: their demo data, their
// room theme, their saved library files. Those are untouched, so this is safe to
// offer to anybody rather than telling them to uninstall and reinstall,
// which is the thing the whole auto-update system exists to avoid.
export async function hardRefresh(by: 'update' | 'settings' = 'update'): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Whatever failed, still reload — a fresh fetch is the point.
  }
  // A query the app has never seen, so nothing can answer it from a cache.
  // `by` names the caller, so a log that shows this address can say which of
  // the four reloads in the app produced it. See components/SelfHeal.tsx.
  window.location.replace(`/?fresh=${Date.now()}&by=${by}`);
}
