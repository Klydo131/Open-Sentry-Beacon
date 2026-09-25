// Make a photo small enough to send, before it is sent.
//
// WHY, IN NUMBERS FROM THE LIVE BUCKET. Fifteen of the sixteen files a real
// church had sent each other were photographs, averaging 2.3 MB and running to
// 4.4 MB, for 34 MB in total. One was a PDF, at two kilobytes. A phone camera
// produces four thousand pixels across; a conversation shows the result about
// three hundred pixels wide on a phone and never more than about eight hundred.
// Every one of those megabytes was paid for twice, once to store and once
// again on every single view, because a signed URL is fetched fresh each time
// and no cache in front of it will keep a private object.
//
// Sixteen hundred pixels at quality 0.82 puts a typical phone photo between two
// and four hundred kilobytes, which nobody can tell apart on the screen it is
// read on. That is most of a nine-tenths saving on the only thing in this app
// that grows without anybody deciding it should.
//
// AND IT REMOVES THE LOCATION. This is the part that matters more than the
// bytes. A photograph from a phone carries EXIF metadata, and on most phones
// with location services on that includes the exact coordinates it was taken
// at, usually the person's home. Sending a picture of a Bible page to your
// Guide should not tell them where you live. Drawing the image onto a canvas
// and re-encoding it keeps the pixels and drops every tag, so this is a privacy
// fix that happens to save money rather than the other way round.
//
// WHAT IT WILL NOT DO. It never returns something larger than what it was
// given -- unless the photo records where it was taken, when losing that
// matters more than a few kilobytes -- it leaves anything that is not an image
// alone, and every failure path falls back to the original file rather than
// refusing to send (with its metadata cut out, if it carries a location). A
// photo that arrives large is a worse outcome than a photo that does not
// arrive at all.
//
// EVERY UPLOAD OF A PHOTO GOES THROUGH HERE: a conversation, a profile
// picture, a resource and a study handout. The last two were added on
// 25 September 2026 and at first did not, which would have kept the location
// in exactly the photos most likely to be passed around.

import { HEAD_BYTES, jpegCarriesLocation, withoutJpegMetadata } from '@/lib/live/photo-location';

/** Longest edge, in pixels. */
const MAX_EDGE = 1600;
/** JPEG quality. 0.82 is the knee: below it, text in a photographed page goes soft. */
const QUALITY = 0.82;
/** Below this there is nothing to win, and re-encoding can only lose. */
const ALREADY_SMALL = 400 * 1024;

/** Formats worth re-encoding. HEIC is deliberately absent: browsers cannot decode it. */
const SHRINKABLE = /^image\/(jpeg|png|webp)$/i;

export function isShrinkable(file: { type?: string; size?: number }): boolean {
  return SHRINKABLE.test(file.type ?? '') && (file.size ?? 0) > ALREADY_SMALL;
}

/**
 * Whether a JPEG says where it was taken. Read from its first bytes, where a
 * JPEG keeps its metadata; see lib/live/photo-location.ts.
 */
async function carriesLocation(file: File): Promise<boolean> {
  if (!/^image\/jpe?g$/i.test(file.type ?? '') && !/\.jpe?g$/i.test(file.name ?? '')) return false;
  try {
    return jpegCarriesLocation(new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer()));
  } catch {
    return false;
  }
}

/** The same photo with its metadata cut out and the picture untouched, or the original. */
async function withoutLocation(file: File): Promise<File> {
  try {
    const clean = withoutJpegMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!clean) return file;
    return new File([new Uint8Array(clean)], file.name, { type: file.type || 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * A smaller version of a photo, or the original when that is the better answer
 * -- except that a photo which says where it was taken never goes out saying so.
 *
 * Never throws. Every branch that cannot do the work returns the file it was
 * handed, because the caller's job is to send a message and this one's is only
 * to make it cheaper -- unless the file carries a location, in which case the
 * fallback is the same file with its metadata cut out (withoutLocation).
 */
export async function shrinkImage(file: File): Promise<File> {
  // ASKED OF EVERY JPEG, WHATEVER ITS SIZE. The size rule below decides what is
  // worth shrinking; it was also, until 25 September 2026, deciding which
  // photos kept their coordinates, and small ones did.
  const located = await carriesLocation(file);
  if (!isShrinkable(file) && !located) return file;
  const fallback = () => (located ? withoutLocation(file) : Promise.resolve(file));
  if (typeof document === 'undefined') return fallback();

  try {
    // `imageOrientation: 'from-image'` applies the EXIF rotation tag while
    // decoding. Without it a photo taken in portrait arrives on its side: the
    // tag said to rotate it and the tag is exactly what this function throws
    // away. That is a bug this would have shipped with.
    const bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' })
      : null;
    if (!bitmap) return fallback();

    const { width, height } = bitmap;
    if (!width || !height) return fallback();

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return fallback(); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    if (!blob) return fallback();

    // A small PNG of flat colour can come out BIGGER as a JPEG. Sending the
    // larger of the two to save space is the kind of thing that only shows up
    // in a bill -- but a photo that says where it was taken goes out without
    // saying so even if that costs a few kilobytes.
    if (blob.size >= file.size && !located) return file;

    const name = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // A tainted canvas, a decode failure, an out-of-memory on a very old
    // phone: none of them is a reason not to send the picture. A photo with a
    // location in it still loses the location.
    return fallback();
  }
}
