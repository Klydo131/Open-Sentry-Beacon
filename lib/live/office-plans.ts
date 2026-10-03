// The account's copy of a person's Sabbath programs and evangelistic
// meetings, in a church's own app (supabase/migrations/
// 20261002150000_office_plans_follow_you.sql). Private to the owner by the
// table's own rules.
//
// A DATABASE WITHOUT THE TABLE IS NOT AN ERROR. Until the migration runs, the
// tools work exactly as they did, on the device alone: load answers null and
// nothing is saved.

import { db } from '@/lib/live/data';
import { isMissingFromDatabase } from '@/lib/live/not-yet';
import type { PlanKind, PlanStore, SyncRow } from '@/lib/plan-sync';

/**
 * The most one plan may send, in bytes of JSON. The database refuses a plan over
 * 200 KB as it stores it (20261003120000_an_office_plan_has_a_size.sql), and its
 * stored text runs a little longer than JSON's, so this stays well under. A plan
 * over it is kept on this device and not sent, so one oversized plan never
 * holds back the rest of the save.
 */
export const OFFICE_PLAN_SEND_LIMIT = 150_000;

/** Whether a row is small enough to send to the account. */
export function fitsTheAccount(row: SyncRow): boolean {
  if (row.deleted) return true;
  try {
    return new TextEncoder().encode(JSON.stringify(row.body ?? {})).length <= OFFICE_PLAN_SEND_LIMIT;
  } catch {
    return false;
  }
}

export const officePlans: PlanStore = {
  async load(kind: PlanKind): Promise<SyncRow[] | null> {
    const { data, error } = await db()
      .from('office_plans')
      .select('id, kind, body, updated, deleted')
      .eq('kind', kind);
    if (error) {
      if (isMissingFromDatabase(error)) return null;
      throw new Error(error.message);
    }
    return (data ?? []) as SyncRow[];
  },

  async save(all: SyncRow[]): Promise<void> {
    const rows = all.filter(fitsTheAccount);
    if (!rows.length) return;
    // NO owner_id: the column defaults to the signed-in account and the
    // policies check it, so nothing can be saved in anybody else's name.
    const { error } = await db()
      .from('office_plans')
      .upsert(
        rows.map((r) => ({ id: r.id, kind: r.kind, body: r.deleted ? {} : r.body, updated: r.updated, deleted: r.deleted })),
        { onConflict: 'owner_id,id' },
      );
    if (error && !isMissingFromDatabase(error)) throw new Error(error.message);
  },
};
