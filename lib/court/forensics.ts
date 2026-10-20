// The court room's forensic tools, as plain functions with no screen attached.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS FOR. Evidence handled carelessly stops being evidence. The
// three questions a court asks of any file are: is this the same file that was
// entered, is it what it says it is, and what does it say about itself? This
// file answers each on the device of the person asking, with nothing uploaded
// and nothing sent anywhere:
//
//   * THE FINGERPRINT. The SHA-256 of a file's bytes, taken with the browser's
//     own WebCrypto. Taken once when an exhibit is entered and recorded by the
//     database before the file is even uploaded, then taken again by every
//     device that opens it. Two files with the same fingerprint are the same
//     file; one byte different and the fingerprint is unrecognisably different.
//
//   * WHAT IT REALLY IS. A file's name and the type a phone reports are labels
//     anybody can change. The first bytes of a file say what it actually is
//     (a JPEG starts FF D8 FF, a PDF "%PDF-"). A ".jpg" that is really a web
//     page, or a "document" that is really a program, is a finding.
//
//   * WHAT A PICTURE SAYS ABOUT ITSELF. Photos carry EXIF details: when they
//     were taken, by which phone or camera, which program last saved them, and
//     sometimes where. Read here from the bytes, never changed: an exhibit is
//     kept exactly as it was entered, location and all, and the screen decides
//     who is shown the location.
//
//   * THE RECORD. The database chains every act in a case with SHA-256. The
//     same chain is recomputed here from the entries the bench is shown, so a
//     record can be checked on a device that does not trust the server.
//
// Every reader here is written for hostile input: a file can be anything, so
// nothing reads past its end and nothing throws to the screen.
// ---------------------------------------------------------------------------

/** The SHA-256 of some bytes or some text (UTF-8), as lowercase hex. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data);
  // A copy into a plain ArrayBuffer, which every engine's digest accepts.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The first twelve characters of a fingerprint in groups of four, upper case:
 * "3F9A 12BC 77DE". Enough for a person to compare two by eye; the whole
 * fingerprint is always one tap away.
 */
export function shortFingerprint(hex: string | null | undefined): string {
  const clean = String(hex ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase().slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, '$1 ');
}

/** The whole fingerprint in groups of eight, which is how people read one aloud. */
export function fullFingerprint(hex: string | null | undefined): string {
  return String(hex ?? '').replace(/[^0-9a-f]/gi, '').toLowerCase().replace(/(.{8})(?=.)/g, '$1 ');
}

// --------------------------------------------------------------- the type --

export interface Sniffed {
  /** The type the bytes say, e.g. 'image/jpeg'. */
  mime: string;
  /** In words: 'a JPEG photo'. */
  says: string;
  /** Something a browser or a computer would run, rather than show. */
  runs?: boolean;
}

const ascii = (b: Uint8Array, at: number, n: number) =>
  at + n <= b.length ? String.fromCharCode(...b.subarray(at, at + n)) : '';

/** What the first bytes of a file say it is, or null when they say nothing known. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', says: 'a JPEG photo' };
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { mime: 'image/png', says: 'a PNG picture' };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { mime: 'image/gif', says: 'a GIF picture' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { mime: 'image/webp', says: 'a WebP picture' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return { mime: 'audio/wav', says: 'a WAV recording' };
  if (ascii(b, 0, 5) === '%PDF-') return { mime: 'application/pdf', says: 'a PDF document' };
  if (ascii(b, 0, 4) === 'OggS') return { mime: 'audio/ogg', says: 'an Ogg recording' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', says: 'a WebM video or recording' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) {
    return { mime: 'audio/mpeg', says: 'an MP3 recording' };
  }
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (/^(heic|heix|hevc|hevx|heim|heis)$/.test(brand)) return { mime: 'image/heic', says: 'a HEIC photo (iPhone)' };
    if (/^(mif1|msf1)$/.test(brand)) return { mime: 'image/heif', says: 'a HEIF picture' };
    if (brand === 'qt  ') return { mime: 'video/quicktime', says: 'a QuickTime video (iPhone)' };
    if (/^M4A /.test(brand)) return { mime: 'audio/mp4', says: 'an M4A recording' };
    return { mime: 'video/mp4', says: 'an MP4 video' };
  }
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    return { mime: 'application/zip', says: 'a ZIP container (Word, Excel and PowerPoint files are these inside)' };
  }
  if (b[0] === 0x4d && b[1] === 0x5a) return { mime: 'application/x-msdownload', says: 'a Windows program', runs: true };
  if (b[0] === 0x7f && ascii(b, 1, 3) === 'ELF') return { mime: 'application/x-executable', says: 'a Linux program', runs: true };
  if (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) return { mime: 'application/x-mach-binary', says: 'a Mac program', runs: true };

  // Text: look at the start, after any byte-order mark and blank space.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.subarray(0, Math.min(b.length, 512)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || /^<head|^<script|^<body/.test(head)) {
    return { mime: 'text/html', says: 'a web page', runs: true };
  }
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return { mime: 'image/svg+xml', says: 'an SVG drawing, which can carry a script', runs: true };
  }
  if (looksLikeText(b.subarray(0, Math.min(b.length, 4096)))) return { mime: 'text/plain', says: 'plain text' };
  return null;
}

/** Mostly printable UTF-8, with no NUL bytes: text. */
function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return false;
  let odd = 0;
  for (const c of b) {
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) odd += 1;
  }
  return odd / b.length < 0.02;
}

/** The kinds of file the court room keeps. Matches the bucket in the migration. */
export const EXHIBIT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/aac',
  'video/mp4', 'video/quicktime', 'video/webm',
  'text/plain',
] as const;

/** The largest exhibit, in bytes: 25 MB, as the bucket says. */
export const EXHIBIT_LIMIT = 25 * 1024 * 1024;

const EXTENSION_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', aac: 'audio/aac', mp4: 'video/mp4', mov: 'video/quicktime',
  webm: 'video/webm', txt: 'text/plain',
};

/** The broad family of a type: 'image/jpeg' -> 'image'. */
const family = (mime: string) => mime.split('/')[0];

export interface TypeFinding {
  /** True when the name, the reported type and the bytes agree closely enough. */
  agrees: boolean;
  /** One sentence for the screen. */
  says: string;
  /** The type to store the exhibit as: what the bytes say, when they say something allowed. */
  storeAs: string | null;
}

/**
 * Compare what a file is called and reported as with what its bytes say.
 *
 * Families, not exact types, decide agreement: a phone that calls an M4A
 * "audio/x-m4a" and its bytes that say "audio/mp4" are telling the same truth.
 */
export function typeFinding(fileName: string, reported: string, sniffed: Sniffed | null): TypeFinding {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const byName = EXTENSION_TYPE[ext] ?? '';
  const allowed = (m: string) => (EXHIBIT_TYPES as readonly string[]).includes(m);
  if (!sniffed) {
    const fallback = allowed(reported) ? reported : allowed(byName) ? byName : null;
    return {
      agrees: false,
      says: 'The file’s first bytes do not match any kind of file this room knows, so what it is cannot be confirmed.',
      storeAs: fallback,
    };
  }
  if (sniffed.runs) {
    return {
      agrees: false,
      says: `Its contents are ${sniffed.says}. It is not kept as an exhibit: describe it in writing instead, and keep the file itself somewhere safe.`,
      storeAs: null,
    };
  }
  const claimed = byName || reported;
  // Pictures, sound and video agree by family; documents only exactly, because
  // "application" covers a PDF and a program alike.
  const same = (a: string, b: string) => a === b || (family(a) === family(b) && family(a) !== 'application');
  const agrees = !claimed || same(claimed, sniffed.mime);
  return {
    agrees,
    says: agrees
      ? `It is ${sniffed.says}, as its name says.`
      : `Its name says ${byName ? `a .${ext} file` : `“${reported || 'unknown'}”`}, but its contents are ${sniffed.says}. That is worth asking about.`,
    storeAs: allowed(sniffed.mime) ? sniffed.mime : null,
  };
}

/** How a type can be shown on this screen, safely. Nothing that runs is ever shown. */
export function showAs(mime: string | null | undefined): 'image' | 'audio' | 'video' | 'text' | 'save' {
  const m = String(mime ?? '');
  if (/^image\/(jpeg|png|webp|gif)$/.test(m)) return 'image';
  if (/^audio\//.test(m)) return 'audio';
  if (/^video\/(mp4|webm|quicktime)$/.test(m)) return 'video';
  if (m === 'text/plain') return 'text';
  return 'save';
}

// ---------------------------------------------------------- picture details --

export interface PictureDetails {
  taken?: string;
  saved?: string;
  make?: string;
  model?: string;
  software?: string;
  width?: number;
  height?: number;
  hasLocation: boolean;
  latitude?: number;
  longitude?: number;
}

/**
 * Read what a picture says about itself. JPEG EXIF (and a PNG's size); null
 * for anything else or anything malformed. Never throws.
 */
export function pictureDetails(bytes: Uint8Array): PictureDetails | null {
  try {
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 12, 4) === 'IHDR') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20), hasLocation: false };
    }
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return { hasLocation: false };
      const marker = bytes[at + 1];
      const length = view.getUint16(at + 2);
      if (length < 2) return { hasLocation: false };
      if (marker === 0xe1 && ascii(bytes, at + 4, 6) === 'Exif\0\0') {
        return readExif(bytes, at + 10, Math.min(bytes.length, at + 2 + length));
      }
      if (marker === 0xda || marker === 0xd9) break;
      at += 2 + length;
    }
    return { hasLocation: false };
  } catch {
    return null;
  }
}

function readExif(bytes: Uint8Array, tiff: number, end: number): PictureDetails {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = ascii(bytes, tiff, 2) === 'II';
  const u16 = (o: number) => (o + 2 <= end ? view.getUint16(o, little) : 0);
  const u32 = (o: number) => (o + 4 <= end ? view.getUint32(o, little) : 0);
  const out: PictureDetails = { hasLocation: false };

  type Entry = { tag: number; type: number; count: number; valueAt: number };
  const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const entries = (ifd: number): Entry[] => {
    const list: Entry[] = [];
    if (ifd <= 0 || tiff + ifd + 2 > end) return list;
    const n = Math.min(u16(tiff + ifd), 256);
    for (let i = 0; i < n; i += 1) {
      const e = tiff + ifd + 2 + i * 12;
      if (e + 12 > end) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const bytesLong = (SIZE[type] ?? 1) * count;
      list.push({ tag: u16(e), type, count, valueAt: bytesLong <= 4 ? e + 8 : tiff + u32(e + 8) });
    }
    return list;
  };
  const text = (e: Entry) => {
    const n = Math.min(e.count, 200);
    if (e.valueAt + n > end) return undefined;
    return ascii(bytes, e.valueAt, n).replace(/\0+$/, '').trim() || undefined;
  };
  const num = (e: Entry) => (e.type === 3 ? u16(e.valueAt) : u32(e.valueAt));
  const rationals = (e: Entry) => {
    const out3: number[] = [];
    for (let i = 0; i < Math.min(e.count, 3); i += 1) {
      const o = e.valueAt + i * 8;
      const d = u32(o + 4);
      out3.push(d ? u32(o) / d : 0);
    }
    return out3;
  };

  let exifIfd = 0;
  let gpsIfd = 0;
  for (const e of entries(u32(tiff + 4))) {
    if (e.tag === 0x010f) out.make = text(e);
    else if (e.tag === 0x0110) out.model = text(e);
    else if (e.tag === 0x0131) out.software = text(e);
    else if (e.tag === 0x0132) out.saved = text(e);
    else if (e.tag === 0x8769) exifIfd = u32(e.valueAt);
    else if (e.tag === 0x8825) gpsIfd = u32(e.valueAt);
  }
  for (const e of entries(exifIfd)) {
    if (e.tag === 0x9003) out.taken = text(e);
    else if (e.tag === 0xa002) out.width = num(e);
    else if (e.tag === 0xa003) out.height = num(e);
  }
  if (gpsIfd) {
    let latRef = '';
    let lonRef = '';
    let lat: number[] = [];
    let lon: number[] = [];
    for (const e of entries(gpsIfd)) {
      if (e.tag === 0x0001) latRef = text(e) ?? '';
      else if (e.tag === 0x0002 && e.type === 5) lat = rationals(e);
      else if (e.tag === 0x0003) lonRef = text(e) ?? '';
      else if (e.tag === 0x0004 && e.type === 5) lon = rationals(e);
    }
    if (lat.length === 3 && lon.length === 3) {
      const deg = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600;
      out.hasLocation = true;
      out.latitude = Math.round(deg(lat) * (latRef === 'S' ? -1 : 1) * 1e6) / 1e6;
      out.longitude = Math.round(deg(lon) * (lonRef === 'W' ? -1 : 1) * 1e6) / 1e6;
    }
  }
  return out;
}

// --------------------------------------------------------------- the record --

export interface RecordEntry {
  seq: number;
  at: string;
  at_us: number;
  actor_id: string | null;
  actor_name: string;
  act: string;
  about: string;
  detail: string;
  prev_hash: string;
  hash: string;
}

/** The text the database hashes for one entry. Written down in docs/COURT-ROOM.md. */
export function recordLine(prev: string, e: Pick<RecordEntry, 'seq' | 'at_us' | 'actor_id' | 'actor_name' | 'act' | 'about' | 'detail'>): string {
  return [prev, String(e.seq), String(e.at_us), e.actor_id ?? '', e.actor_name, e.act, e.about, e.detail].join('\n');
}

/** The "previous hash" of a case's first entry, which ties the chain to its case. */
export function genesis(trialId: string): Promise<string> {
  return sha256Hex(`Hope Beacon court record\n${trialId}`);
}

export interface ChainCheck {
  holds: boolean;
  entries: number;
  /** The first position where the chain stops matching, or null. */
  brokenAt: number | null;
  head: string;
}

/** Recompute a case's chain on this device. */
export async function checkChain(trialId: string, entries: RecordEntry[]): Promise<ChainCheck> {
  let prev = await genesis(trialId);
  let n = 0;
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    n += 1;
    const want = await sha256Hex(recordLine(prev, e));
    if (e.seq !== n || e.prev_hash !== prev || e.hash !== want) {
      return { holds: false, entries: n, brokenAt: e.seq, head: prev };
    }
    prev = e.hash;
  }
  return { holds: true, entries: n, brokenAt: null, head: prev };
}

/** What each act is called on the record, in words. */
export const ACT_WORDS: Record<string, string> = {
  opened: 'Case opened',
  summoned: 'Called to the case',
  statement: 'Statement',
  statement_for: 'Statement written down by the judge',
  exhibit: 'Exhibit entered',
  exhibit_viewed: 'Exhibit opened',
  exhibit_matched: 'Exhibit checked: matches',
  exhibit_differed: 'Exhibit checked: DOES NOT MATCH',
  record_opened: 'Case opened for reading',
  record_exported: 'A copy saved',
  gallery_seat: 'Seat taken in the gallery',
  setting: 'Setting changed',
  judge_called: 'Another judge asked for',
  judge_seated: 'Judge took the seat',
  verdict: 'Verdict',
};
