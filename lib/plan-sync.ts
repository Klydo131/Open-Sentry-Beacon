// Keeping the Office's own documents (Sabbath programs, evangelistic
// meetings) the same on every device the person signs in on, with the device
// always first.
//
// THE RULE IS SMALL ON PURPOSE: each item carries `updated`, the moment it was
// last changed, and whichever copy is newer wins, on the device and in the
// account alike. A deletion is remembered as a mark with its own moment, so a
// device that was offline cannot bring back what was deleted elsewhere, and a
// later edit on that device can.
//
// This file decides; it never asks the network. lib/use-plan-sync.ts runs it
// against the account's copy (lib/live/office-plans.ts), and
// tests/the-office-follows-you.mjs holds every case below.

import { keep, readKept } from '@/lib/sabbath-program';

export type PlanKind = 'sabbath_program' | 'evangelistic_meeting';

/** One item as the account keeps it. */
export interface SyncRow {
  id: string;
  kind: PlanKind;
  body: unknown;
  updated: number;
  deleted: boolean;
}

/** Deleted items, by id, with when they were deleted. */
export type Marks = Record<string, number>;

export interface Merged<T> {
  /** What the device should now hold. */
  list: T[];
  /** What the account should be told: newer copies and deletions it lacks. */
  push: SyncRow[];
  /** The deletion marks to keep. */
  marks: Marks;
  /** Whether the device's list changed. */
  changed: boolean;
}

/**
 * Merge the device's items and deletion marks with the account's rows.
 * `tidy` makes a stored body safe, or null when it is not an item at all.
 */
export function mergePlans<T extends { id: string; updated: number }>(
  kind: PlanKind,
  local: T[],
  localMarks: Marks,
  remote: SyncRow[],
  tidy: (raw: unknown) => T | null,
): Merged<T> {
  const mine = new Map(local.map((x) => [x.id, x]));
  const marks: Marks = { ...localMarks };
  const push: SyncRow[] = [];
  let changed = false;
  const seen = new Set<string>();

  for (const row of remote) {
    if (row.kind !== kind) continue;
    seen.add(row.id);
    const here = mine.get(row.id);
    const gone = marks[row.id];
    if (row.deleted) {
      if (here && here.updated > row.updated) {
        // Changed here after it was deleted there: the change wins.
        push.push(asRow(kind, here));
      } else {
        if (here) { mine.delete(row.id); changed = true; }
        marks[row.id] = Math.max(gone ?? 0, row.updated);
      }
      continue;
    }
    if (gone !== undefined && gone >= row.updated) {
      // Deleted here after its last change there.
      if (!here) push.push({ id: row.id, kind, body: {}, updated: gone, deleted: true });
      continue;
    }
    const theirs = tidy(row.body);
    if (!theirs) continue;
    if (!here || row.updated > here.updated) {
      mine.set(row.id, { ...theirs, updated: row.updated });
      delete marks[row.id];
      changed = true;
    } else if (here.updated > row.updated) {
      push.push(asRow(kind, here));
    }
  }

  // Anything only on this device goes up; anything deleted here and unknown there, too.
  for (const item of mine.values()) if (!seen.has(item.id)) push.push(asRow(kind, item));
  for (const [id, when] of Object.entries(marks)) {
    if (!seen.has(id) && !mine.has(id)) push.push({ id, kind, body: {}, updated: when, deleted: true });
  }

  return { list: [...mine.values()], push, marks, changed };
}

function asRow<T extends { id: string; updated: number }>(kind: PlanKind, item: T): SyncRow {
  return { id: item.id, kind, body: item, updated: item.updated, deleted: false };
}

// The deletion marks, on this device, per account and kind. Old marks are let
// go after a year: by then every device has long since heard.
const YEAR = 365 * 24 * 60 * 60 * 1000;
const marksKey = (owner: string, kind: PlanKind) => `beacon-plans-deleted:${kind}:${owner}`;

export function loadMarks(owner: string, kind: PlanKind, now = Date.now()): Marks {
  const kept = readKept(marksKey(owner, kind));
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return {};
  const out: Marks = {};
  for (const [id, when] of Object.entries(kept as Record<string, unknown>)) {
    if (typeof when === 'number' && Number.isFinite(when) && now - when < YEAR && id.length <= 64) out[id] = when;
  }
  return out;
}

export function saveMarks(owner: string, kind: PlanKind, marks: Marks): boolean {
  return keep(marksKey(owner, kind), marks);
}

/** The account's copy, as a page hands it in. Absent where there is none: the sample church, or no signal. */
export interface PlanStore {
  /** Every row of this kind, or null when this database has no account copy yet. */
  load(kind: PlanKind): Promise<SyncRow[] | null>;
  save(rows: SyncRow[]): Promise<void>;
}
