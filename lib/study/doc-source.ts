// Where an Explorer's study documents are kept: the church's own database.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE IS THE WHOLE INTEGRATION. AFFiNE's editor is MIT and its server
// is not -- packages/backend is Enterprise Edition, production use only under a
// paid subscription -- so the editor had to arrive without the place it keeps
// documents. Reading the published packages turned up the seam that makes this
// tractable: BlockSuite's `DocEngine` talks to a `DocSource`, and a DocSource
// is three methods. Everything else about persistence is theirs.
//
// So this is not a reimplementation of AFFiNE's backend. It is the adapter that
// points their engine at `study_docs`, a table the church owns, behind
// owner-only policies that were verified against the live database.
//
// A SNAPSHOT, NOT A LOG. Their IndexedDB source keeps an array of updates and
// merges it when it grows. A row per document holding one merged state is the
// better shape here for one reason: this is a 500 MB free tier shared by a
// whole congregation, and an append-only log with no compaction job is how a
// study room quietly eats a church's database.
//
// THE RACE THAT SNAPSHOTS CREATE, AND WHAT IS DONE ABOUT IT. Read-merge-write
// loses a change when two devices write between the same read and write. Yjs
// updates merge cleanly, so nothing becomes corrupt -- but one edit can vanish,
// which for somebody's study notes is worse than an error. Every write is
// therefore conditional on the `version` it read, and a write that loses the
// race re-reads and merges again rather than overwriting. Bounded, because a
// retry loop that cannot end is its own bug.
//
// THE TOKEN IS AN INTEGER, AND THAT WAS A CORRECTION. The first version of this
// conditioned on `updated_at`. Measured against the real database, matching on
// the microsecond value PostgREST returns hits 1 row and the same value
// truncated to milliseconds -- which is all JavaScript's toISOString() can
// carry -- hits 0. A guard that matches nothing turns every save into a retry
// and then a refusal. An integer has no precision to lose and no clock to be
// wrong about.
// ---------------------------------------------------------------------------

import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';
import type { DocSource } from '@blocksuite/sync';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Base64 both ways, because the column is text. See the migration for why. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) on a large document overflows the
  // argument limit and throws, which would show up as "your notes did not save"
  // only once somebody's room got big enough.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

type Row = { state: string; version: number };

/**
 * A document source that can say when it is in trouble.
 *
 * WHY THIS EXISTS. DocEngine catches everything a source throws and retries on
 * its own schedule, which is right -- a dropped packet should not be an error
 * screen. But it means a source that can never save throws into a void: the
 * person keeps typing, nothing reaches the database, and the screen looks
 * exactly like the screen where everything is fine. For a room whose entire
 * job is keeping what somebody wrote, silence is the worst possible answer.
 *
 * So a source may report trouble upward, and the room shows it. Non-null is a
 * problem that has not cleared; null means the last write got through.
 */
export type Troubled = { onTrouble?: (cause: unknown | null) => void };

export class SupabaseDocSource implements DocSource, Troubled {
  name = 'supabase';

  /** Set by whoever is showing the room. See Troubled. */
  onTrouble?: (cause: unknown | null) => void;

  /** How many times a write may lose the race before it gives up and throws. */
  private static readonly RETRIES = 3;

  constructor(
    private readonly db: SupabaseClient,
    private readonly ownerId: string,
    private readonly workspaceId: string,
  ) {}

  private row(docId: string) {
    return this.db
      .from('study_docs')
      .select('state, version')
      .eq('owner_id', this.ownerId)
      .eq('workspace_id', this.workspaceId)
      .eq('doc_id', docId)
      .maybeSingle();
  }

  async pull(docId: string, state: Uint8Array) {
    const { data, error } = await this.row(docId);
    if (error) {
      const cause = new Error(error.message);
      this.onTrouble?.(cause);
      throw cause;
    }
    if (!data) return null;

    const update = fromBase64((data as Row).state);
    // Send only what the caller is missing. On a phone on mobile data the
    // difference between a diff and a whole document is the difference between
    // a room that opens and one that people stop opening.
    const diff = state.length ? diffUpdate(update, state) : update;
    return { data: diff, state: encodeStateVectorFromUpdate(update) };
  }

  async push(docId: string, data: Uint8Array): Promise<void> {
    try {
      await this.write(docId, data);
      // The last write got through, so whatever was wrong is over. Reported
      // every time rather than only after a failure, because the room has no
      // other way to learn that a problem has cleared.
      this.onTrouble?.(null);
    } catch (cause) {
      this.onTrouble?.(cause);
      throw cause;
    }
  }

  private async write(docId: string, data: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt < SupabaseDocSource.RETRIES; attempt += 1) {
      const { data: existing, error } = await this.row(docId);
      if (error) throw new Error(error.message);

      if (!existing) {
        const { error: insertError } = await this.db.from('study_docs').insert({
          owner_id: this.ownerId,
          workspace_id: this.workspaceId,
          doc_id: docId,
          state: toBase64(data),
        });
        // Somebody else created the row between the read and the insert. That
        // is the race, not a failure: go round again and merge onto theirs.
        if (insertError?.code === '23505') continue;
        if (insertError) throw new Error(insertError.message);
        return;
      }

      const row = existing as Row;
      const merged = mergeUpdates([fromBase64(row.state), data]);

      // CONDITIONAL ON WHAT WAS READ. Without the version match this is a
      // plain overwrite and the other device's edit is gone.
      const { data: written, error: updateError } = await this.db
        .from('study_docs')
        .update({
          state: toBase64(merged),
          version: row.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('owner_id', this.ownerId)
        .eq('workspace_id', this.workspaceId)
        .eq('doc_id', docId)
        .eq('version', row.version)
        .select('doc_id');

      if (updateError) throw new Error(updateError.message);
      if (written && written.length > 0) return;
      // Zero rows means the row moved under us. Read it again and re-merge.
    }

    throw new Error(
      'Those notes could not be saved because the room kept changing on another '
      + 'device. Close it there and try again.',
    );
  }

  /**
   * Live updates from another device.
   *
   * DELIBERATELY NOTHING, FOR NOW, and saying so rather than leaving an empty
   * function that reads like an oversight. A study room has one owner, so the
   * common case is one device at a time; the conditional write above is what
   * keeps two devices from losing each other's work. Turning this on means
   * publishing `study_docs` for realtime and registering it in the keep-up
   * sets, which is a change to make deliberately and test, not to smuggle in
   * underneath an editor.
   */
  subscribe(): () => void {
    return () => {};
  }
}
