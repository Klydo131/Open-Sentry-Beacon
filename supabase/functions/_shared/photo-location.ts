// Does this photograph say where it was taken? Read from its bytes, before it is sent.
//
// WHY THIS EXISTS. The privacy notice promises that "the location your camera
// recorded is removed" before a photo is stored, and shrink-image.ts keeps the
// promise by re-encoding through a canvas, which drops every tag. But it only
// re-encodes a photo worth shrinking -- over 400 KB -- and hands anything
// smaller back untouched, tags and all. A small photograph with coordinates in
// it (a cropped picture, one saved by an app that compresses but keeps EXIF)
// went to the server with the address of wherever it was taken. Found on
// 25 September 2026, while making Resources and study handouts take files,
// when the owner asked for the app's policy and security to be kept
// consistent.
//
// So the question is asked of every JPEG, whatever its size: does it carry a
// GPS block, or an XMP packet naming GPS coordinates? If it does, it is
// re-encoded even when that makes it bigger. Privacy before bytes.
//
// WHAT IT CANNOT READ. HEIC (browsers cannot decode it to re-encode), and PNG
// or WebP metadata, which phones do not normally write coordinates into. Said
// in docs/DATA-PROTECTION.md rather than here only.
//
// Pure functions over bytes: no DOM, no network, so tests/photos-lose-their-
// location.mjs runs them directly in Node.

/** Enough of the file to reach its metadata, which a JPEG keeps at the front. */
export const HEAD_BYTES = 256 * 1024;

const XMP_GPS = /GPS(Latitude|Longitude)/;

/**
 * True when a JPEG's metadata records where it was taken.
 *
 * Never throws. Anything it cannot parse is answered by what it had already
 * seen: an EXIF block it could not finish reading counts as carrying a
 * location, because the cost of being wrong that way is one re-encode and the
 * cost of being wrong the other way is somebody's address.
 */
export function jpegCarriesLocation(bytes: Uint8Array): boolean {
  let sawExif = false;
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return sawExif;
      const marker = bytes[i + 1];
      // Fill bytes between segments.
      if (marker === 0xff) { i += 1; continue; }
      // Start of the picture itself, or its end: no metadata after this.
      if (marker === 0xda || marker === 0xd9) return false;
      // Markers that carry no length.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (length < 2) return sawExif;
      const start = i + 4;
      const end = Math.min(bytes.length, i + 2 + length);
      if (marker === 0xe1) {
        if (isExif(bytes, start)) {
          sawExif = true;
          if (exifHasGps(bytes, start + 6, end)) return true;
        } else if (XMP_GPS.test(ascii(bytes, start, end))) {
          return true;
        }
      }
      i += 2 + length;
    }
    // Ran out of the bytes that were read before reaching the picture.
    return sawExif;
  } catch {
    return sawExif;
  }
}

/**
 * The same JPEG with its EXIF, XMP and IPTC blocks taken out, the picture
 * itself untouched -- or null if the bytes are not a JPEG this can walk.
 *
 * The fallback for when a canvas cannot re-encode the photo. It loses the
 * rotation tag with everything else, so a portrait photo may arrive on its
 * side; that is the lesser harm next to arriving with a home address.
 */
export function withoutJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xda) {
      // The picture: kept byte for byte, to the end of the file.
      kept.push(bytes.subarray(i));
      return join(kept);
    }
    if (marker === 0xd9) { kept.push(bytes.subarray(i, i + 2)); return join(kept); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(i, i + 2)); i += 2; continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) return null;
    // APP1 is EXIF or XMP; APP13 is Photoshop's IPTC block, which can hold a
    // place name. Everything else -- the colour profile, the tables the
    // picture needs to be decoded -- is kept.
    if (marker !== 0xe1 && marker !== 0xed) kept.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

/**
 * A PNG with its words and dates cut out and its picture untouched, or null if
 * the bytes are not a PNG this can walk.
 *
 * FOUND BY THE SECURITY REVIEW OF 1 OCTOBER 2026. A PNG or WebP under 400 KB
 * is not re-drawn, so whatever it carried went out with it. A PNG keeps EXIF
 * (with its GPS block) in an `eXIf` chunk, and XMP -- which can name the place
 * too -- in an `iTXt` one. Every chunk that holds text or metadata goes; the
 * ones that hold the picture and its colours stay, byte for byte.
 */
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function pngWithoutMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    const end = i + 12 + length;
    if (end > bytes.length) return null;
    const type = ascii(bytes, i + 4, i + 8);
    if (!PNG_METADATA.has(type)) kept.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return join(kept);
  }
  return null;
}

/**
 * A WebP with its EXIF and XMP chunks cut out, or null if the bytes are not a
 * WebP this can walk. The extended header's flags say which of the two the
 * file has, so they are cleared as well; the container's length is rewritten.
 */
export function webpWithoutMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WEBP') return null;
  const kept: Uint8Array[] = [new Uint8Array(bytes.subarray(0, 12))];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, i + 4);
    const size = (bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)) >>> 0;
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > bytes.length) return null;
    if (type === 'VP8X') {
      const chunk = new Uint8Array(bytes.subarray(i, Math.min(end, bytes.length)));
      chunk[8] &= ~(0x08 | 0x04); // the EXIF and XMP flags
      kept.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      kept.push(bytes.subarray(i, Math.min(end, bytes.length)));
    }
    i = end;
  }
  const out = join(kept);
  const riff = out.length - 8;
  out[4] = riff & 0xff; out[5] = (riff >> 8) & 0xff; out[6] = (riff >> 16) & 0xff; out[7] = (riff >>> 24) & 0xff;
  return out;
}

function isExif(b: Uint8Array, at: number): boolean {
  return b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66
    && b[at + 4] === 0 && b[at + 5] === 0;
}

/** Walk the first directory of the TIFF block and look for the GPS pointer (tag 0x8825). */
function exifHasGps(b: Uint8Array, tiff: number, end: number): boolean {
  if (tiff + 8 > end) throw new Error('short');
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!little && !big) throw new Error('not tiff');
  const u16 = (at: number) => {
    if (at + 2 > end) throw new Error('short');
    return little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1];
  };
  const u32 = (at: number) => {
    if (at + 4 > end) throw new Error('short');
    return little
      ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000
      : b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
  };
  const ifd = tiff + u32(tiff + 4);
  const entries = u16(ifd);
  for (let k = 0; k < entries; k++) {
    if (u16(ifd + 2 + k * 12) === 0x8825) return true;
  }
  return false;
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]);
  return s;
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
