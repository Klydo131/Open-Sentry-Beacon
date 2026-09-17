// Where a picture in a study room actually lives.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "I want the whole feature please." Images and attachments are part
// of AFFiNE, and until this file existed the room kept them in BlockSuite's
// `MemoryBlobSource` -- a Map in the tab. A photograph of somebody's Bible page
// survived until the tab closed and then came back as a broken block. The block
// was registered, which made it worse: the feature appeared to work.
//
// SAME SHAPE AS THE DOCUMENT SOURCE, deliberately. Rows in the church's own
// database, owner-only, capped, gone when the account goes. A study room is one
// person's room and its pictures are one person's pictures.
//
// THE KEY IS THE CONTENT'S OWN CHECKSUM -- BlockSuite hashes the bytes before
// it ever asks this to store them. Two copies of the same picture are one row,
// and a row never changes: a different picture is a different key. That is why
// there is no update path here and no update policy in the migration.
// ---------------------------------------------------------------------------

import type { BlobSource } from '@blocksuite/sync';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The most a single picture may be, in real bytes.
 *
 * MATCHED TO THE MIGRATION'S OWN CHECK, which is on the base64 length. Refusing
 * here as well means somebody is told "that picture is too big" while they are
 * looking at it, rather than the database refusing a row and the page quietly
 * showing a blank. The database still has the last word; this is the message.
 */
export const BLOB_LIMIT = 1_000_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  // THE BUFFER IS NAMED, and that is a type fix rather than a style choice.
  // `new Uint8Array(n)` is typed over `ArrayBufferLike`, which includes
  // SharedArrayBuffer, and a Blob cannot be built from shared memory. Saying
  // ArrayBuffer out loud is the difference between this compiling and not.
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export class SupabaseBlobSource implements BlobSource {
  name = 'supabase';
  readonly = false;

  /**
   * What has already been fetched this session.
   *
   * NOT AN OPTIMISATION -- a page with six pictures asks for each of them every
   * time it renders, and without this that is six round trips per render on a
   * phone. The contents behind a key can never change, so a cache of them
   * cannot go stale.
   */
  private readonly seen = new Map<string, Blob>();

  constructor(
    private readonly db: SupabaseClient,
    private readonly ownerId: string,
    private readonly workspaceId: string,
  ) {}

  async get(key: string): Promise<Blob | null> {
    const had = this.seen.get(key);
    if (had) return had;

    const { data, error } = await this.db
      .from('study_blobs')
      .select('bytes, mime')
      .eq('owner_id', this.ownerId)
      .eq('workspace_id', this.workspaceId)
      .eq('key', key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as { bytes: string; mime: string };
    const blob = new Blob([fromBase64(row.bytes)], { type: row.mime });
    this.seen.set(key, blob);
    return blob;
  }

  async set(key: string, value: Blob): Promise<string> {
    if (value.size > BLOB_LIMIT) {
      throw new Error(
        `That file is ${Math.round(value.size / 100_000) / 10} MB. A study room `
        + `keeps files up to ${BLOB_LIMIT / 1_000_000} MB, so the church's database `
        + 'stays usable for everybody.',
      );
    }

    const bytes = new Uint8Array(await value.arrayBuffer());
    // UPSERT RATHER THAN INSERT, because the same picture pasted twice is the
    // same key, and the second paste must not be an error on the screen. There
    // is no update policy, so this is an insert that tolerates a row already
    // being there rather than one that rewrites it.
    const { error } = await this.db.from('study_blobs').upsert({
      owner_id: this.ownerId,
      workspace_id: this.workspaceId,
      key,
      mime: value.type || 'application/octet-stream',
      bytes: toBase64(bytes),
    }, { onConflict: 'owner_id,workspace_id,key', ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    this.seen.set(key, value);
    return key;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.db
      .from('study_blobs')
      .delete()
      .eq('owner_id', this.ownerId)
      .eq('workspace_id', this.workspaceId)
      .eq('key', key);
    if (error) throw new Error(error.message);
    this.seen.delete(key);
  }

  async list(): Promise<string[]> {
    const { data, error } = await this.db
      .from('study_blobs')
      .select('key')
      .eq('owner_id', this.ownerId)
      .eq('workspace_id', this.workspaceId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => (row as { key: string }).key);
  }
}
