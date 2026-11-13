// Reads the names a font file carries about itself: who made it, and under
// what licence. WOFF2 only -- the format every font this app serves is in.
//
// WHY THIS EXISTS. The drawing board's fonts are copied out of Excalidraw's
// package and served from this app (scripts/excalidraw-assets.mjs). Most of
// their licences ask that the licence go with every copy, and the copies served
// here lost it: the subsetting that makes them small keeps a font's name table
// and nothing else. So the licence file written next to them is read out of the
// fonts themselves, and cannot drift from what is actually served. Found by the
// licence audit of 1 October 2026.
//
// No dependency: a WOFF2 file is a table directory followed by one Brotli
// stream, and Node can undo Brotli on its own. The name table is never
// transformed, so it can be read straight out of that stream.
import zlib from 'node:zlib';

// The order of the "known tag" list in the WOFF2 specification, section 5.1.
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln',
  'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf',
  'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** The font's name records by id (0 copyright, 1 family, 5 version, 7 trademark, 13 licence, 14 licence URL), or null. */
export function woff2Names(buf) {
  if (buf.length < 48 || buf.toString('latin1', 0, 4) !== 'wOF2') return null;
  if (buf.toString('latin1', 4, 8) === 'ttcf') return null; // a font collection; none is served here
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = buf[at++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('not a WOFF2 number');
  };
  const tables = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[at++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 0x3f) { tag = buf.toString('latin1', at, at + 4); at += 4; }
    const version = (flags >> 6) & 3;
    let length = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    if (transformed) length = base128();
    tables.push({ tag, length });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(at, at + compressed));
  let offset = 0;
  let name = null;
  for (const t of tables) {
    if (t.tag === 'name') name = data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  if (!name) return null;
  const count = name.readUInt16BE(2);
  const strings = name.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    const platform = name.readUInt16BE(r);
    const encoding = name.readUInt16BE(r + 2);
    const id = name.readUInt16BE(r + 6);
    const raw = name.subarray(strings + name.readUInt16BE(r + 10), strings + name.readUInt16BE(r + 10) + name.readUInt16BE(r + 8));
    let text;
    if (platform === 3 || platform === 0) {
      const swapped = Buffer.from(raw);
      swapped.swap16();
      text = swapped.toString('utf16le');
    } else if (platform === 1 && encoding === 0) {
      text = raw.toString('latin1');
    } else continue;
    // Windows names win: they are the Unicode ones.
    if (!(id in out) || platform === 3) out[id] = text;
  }
  return out;
}
