'use client';

// Running lib/plan-sync.ts for a screen: when it opens, when the signal comes
// back, when another device changes something (the account's copy is
// published, so a change on the phone reaches the laptop while it is open),
// and a moment after each change here.
//
// With no store (the sample church, a page opened with no signal) or a
// database that has no account copy yet, it does nothing and says so: the
// device's copy is all there is, as before.

import { useCallback, useEffect, useRef, useState } from 'react';
import { KEEP_UP_PLANS, useKeepUp } from '@/lib/live/keep-up';
import { loadMarks, mergePlans, saveMarks, type PlanKind, type PlanStore } from '@/lib/plan-sync';

/** device: kept here only. synced: here and with the account. waiting: here, and will go up with a signal. */
export type SyncState = 'device' | 'synced' | 'waiting';

/** One line for under "Saved", by state. */
export function syncLine(state: SyncState): string {
  if (state === 'synced') return 'Saved on this device and with your account, so it is on your other devices too.';
  if (state === 'waiting') return 'Saved on this device. It reaches your other devices when there is a signal.';
  return '';
}

export function usePlanSync<T extends { id: string; updated: number }>({ kind, owner, store, list, apply, tidy }: {
  kind: PlanKind;
  owner: string;
  store?: PlanStore;
  /** The device's list; null until it has been read. */
  list: T[] | null;
  /** Take the merged list, without counting it as a change made here. */
  apply: (next: T[]) => void;
  tidy: (raw: unknown) => T | null;
}) {
  const [state, setState] = useState<SyncState>('device');
  const latest = useRef(list);
  latest.current = list;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const tidyRef = useRef(tidy);
  tidyRef.current = tidy;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sync = useCallback(async () => {
    if (!store || !latest.current) return;
    try {
      const remote = await store.load(kind);
      if (remote === null) { setState('device'); return; }
      const merged = mergePlans(kind, latest.current, loadMarks(owner, kind), remote, tidyRef.current);
      saveMarks(owner, kind, merged.marks);
      if (merged.changed) applyRef.current(merged.list);
      if (merged.push.length) await store.save(merged.push);
      setState('synced');
    } catch {
      setState('waiting');
    }
  }, [store, kind, owner]);

  // Once the device's list has been read, and whenever the account changes.
  const ready = list !== null;
  useEffect(() => { if (ready) void sync(); }, [ready, sync]);
  useKeepUp(KEEP_UP_PLANS, sync, !!store);
  useEffect(() => {
    if (!store) return;
    const back = () => { void sync(); };
    window.addEventListener('online', back);
    return () => {
      window.removeEventListener('online', back);
      clearTimeout(timer.current);
    };
  }, [store, sync]);

  /** Something changed here: send it soon, not on every key pressed. */
  const changed = useCallback(() => {
    if (!store) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void sync(); }, 1200);
  }, [store, sync]);

  /** An item deleted here: remember it, so no other device brings it back. */
  const deleted = useCallback((id: string) => {
    const marks = loadMarks(owner, kind);
    marks[id] = Date.now();
    saveMarks(owner, kind, marks);
    changed();
  }, [owner, kind, changed]);

  return { state, changed, deleted };
}
