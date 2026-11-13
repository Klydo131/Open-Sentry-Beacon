// Reading one file out of a zip: enough for a compressed MusicXML score (.mxl),
// which is a zip holding the score and a note saying where it is.
//
// WHY NOT A LIBRARY. The usual one (JSZip) is 100 KB and does far more than
// this needs. Browsers can already inflate: DecompressionStream('deflate-raw')
// is in every current browser and in Node, so what is left is reading the
// zip's table of contents, which is a few dozen lines.
//
// A ZIP IS SOMETHING SOMEBODY SENT YOU. The table of contents can lie about
// sizes, and a small file can inflate to gigabytes (a "zip bomb"). So:
//   - only stored and deflated entries are read; encrypted, split and Zip64
//     archives are refused;
//   - the table of contents may hold at most MAX_ENTRIES entries;
//   - inflating stops the moment the output passes the size the entry declared
//     or MAX_INFLATED, whichever is smaller, whatever the entry claims.

export const MAX_ENTRIES = 200;
/** No score's XML comes near this; a bomb passes it at once. */
export const MAX_INFLATED = 12 * 1024 * 1024;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

interface Entry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The table of contents, from the end of the archive. */
export function entriesOf(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is in the last 22 bytes, plus a comment of at most 64 KB.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === EOCD) { end = i; break; }
  }
  if (end < 0) throw new ZipError('This file is not a zip, so it is not a compressed MusicXML score (.mxl).');
  const count = view.getUint16(end + 10, true);
  const at = view.getUint32(end + 16, true);
  if (count > MAX_ENTRIES) throw new ZipError('This archive holds more files than a score ever does.');
  if (at === 0xffffffff || count === 0xffff) throw new ZipError('This archive is in a form (Zip64) a score never needs.');

  const entries: Entry[] = [];
  let p = at;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL) throw new ZipError('This archive is damaged.');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    if (flags & 0x1) throw new ZipError('This archive is encrypted.');
    if ([compressed, size, offset].includes(0xffffffff)) throw new ZipError('This archive is in a form (Zip64) a score never needs.');
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.push({ name, method, compressed, size, offset });
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}

/** Read one entry, inflating it, never past its declared size or MAX_INFLATED. */
export async function readEntry(bytes: Uint8Array, entry: Entry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.offset;
  if (p + 30 > bytes.length || view.getUint32(p, true) !== LOCAL) throw new ZipError('This archive is damaged.');
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const end = start + entry.compressed;
  if (end > bytes.length) throw new ZipError('This archive is damaged.');
  const data = bytes.subarray(start, end);
  const ceiling = Math.min(entry.size, MAX_INFLATED);
  if (entry.size > MAX_INFLATED) throw new ZipError('The score inside this archive is larger than a phone should open.');

  if (entry.method === 0) return data.slice(0, ceiling);
  if (entry.method !== 8) throw new ZipError('This archive is compressed in a way a score never is.');
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('This browser cannot open a compressed score (.mxl). Save it as .musicxml and open that instead.');
  }

  // A copy into its own buffer: Blob wants an ArrayBuffer, not a view that
  // could be shared memory.
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ceiling) {
      await reader.cancel();
      throw new ZipError('The score inside this archive is larger than it says it is, so it was not opened.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

/**
 * The score inside a .mxl: the file META-INF/container.xml names, or else the
 * first .xml or .musicxml outside META-INF. Returns its text.
 */
export async function scoreFromMxl(bytes: Uint8Array): Promise<string> {
  const entries = entriesOf(bytes);
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  let path = '';
  const container = entries.find((e) => e.name === 'META-INF/container.xml');
  if (container) {
    const text = decode(await readEntry(bytes, container));
    path = /full-path\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? '';
  }
  const entry = entries.find((e) => e.name === path)
    ?? entries.find((e) => !e.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(e.name));
  if (!entry) throw new ZipError('No score was found inside this archive.');
  return decode(await readEntry(bytes, entry));
}
