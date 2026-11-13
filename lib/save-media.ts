'use client';

// Saving a file to this device, in ONE place.
//
// WHY THIS IS A HOOK AND NOT COPIED CODE. The player's Vault now offers "Save
// music or video" in the right rail, and the Library page has offered "Upload
// files" all along. Written twice, those become two upload paths that drift —
// and the thing they would drift on is not cosmetic. This function carries a
// WebKit fix that took a live bug to find (see the `finally` below), plus the
// storage-quota request and the duration/resolution probe. A second copy would
// have quietly shipped without one of them.
//
// So there is one path, and both buttons call it.

import {
  LocalMediaError,
  inspectPlayableMedia,
  newMediaId,
  prepareMediaStorage,
  putMedia,
  typeFromMime,
  type MediaMeta,
} from '@/lib/localMedia';

export interface SaveResult {
  saved: number;
  /** Empty when every file saved. */
  error: string;
}

/**
 * Reads the files off an <input type="file"> and writes them to this device.
 *
 * Takes the input element rather than the FileList so it can clear it at the
 * right moment, which is the whole WebKit fix.
 */
export async function saveFilesFromInput(
  input: HTMLInputElement,
  note?: string,
): Promise<SaveResult> {
  // THE RESET HAPPENS IN THE `finally` AT THE END, NOT HERE. WebKit invalidates
  // a File the moment its input is cleared, and every byte below is read after
  // an await — so clearing first aborted the whole upload on Safari and iOS
  // while working perfectly in Chromium. Clearing at the end is also what lets
  // the same file be chosen twice in a row.
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return { saved: 0, error: '' };

  try {
    await prepareMediaStorage(files.reduce((sum, file) => sum + file.size, 0));

    // Probed BEFORE anything is written, so a file the browser cannot read at
    // all fails the whole batch rather than leaving half of it on the device.
    const ready: Array<{
      file: File;
      type: MediaMeta['type'];
      info: Pick<MediaMeta, 'width' | 'height' | 'duration'>;
    }> = [];
    for (const file of files) {
      const type = typeFromMime(file.type);
      const info =
        type === 'audio' || type === 'video' ? await inspectPlayableMedia(file, type) : {};
      ready.push({ file, type, info });
    }

    for (const { file, type, info } of ready) {
      await putMedia(
        {
          id: newMediaId(),
          title: file.name,
          type,
          note: note || undefined,
          mime: file.type,
          size: file.size,
          created_at: new Date().toISOString(),
          ...info,
        },
        file,
      );
    }
    return { saved: files.length, error: '' };
  } catch (error) {
    return {
      saved: 0,
      error:
        error instanceof LocalMediaError
          ? error.message
          : 'Could not save. Your device storage may be full.',
    };
  } finally {
    input.value = '';
  }
}

/** What to say afterwards, so both buttons say the same thing. */
export function savedMessage(result: SaveResult): string {
  if (result.error) return result.error;
  if (result.saved === 0) return '';
  return result.saved === 1 ? 'Saved to your device' : `${result.saved} files saved`;
}
