// A photograph that says where it was taken never goes out saying so.
//
// ---------------------------------------------------------------------------
// WHY. The privacy notice promises that "the location your camera recorded in
// it is removed" before a photo is stored. shrink-image.ts kept that promise
// only for photos worth shrinking -- over 400 KB -- and sent anything smaller
// untouched, GPS block and all. On 25 September 2026, while Resources and study
// handouts were opened to files and the owner asked for policy and security to
// be kept consistent, both of those uploads were also found to skip the
// shrinker entirely.
//
// This runs the reader in lib/live/photo-location.ts on JPEGs built byte by
// byte here -- with and without a GPS block, in both byte orders, with the
// coordinates in XMP instead, and broken ones -- and then checks the shrinker
// and both new uploads use it.
//
//   node tests/photos-lose-their-location.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { jpegCarriesLocation, withoutJpegMetadata } from '../lib/live/photo-location.ts';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---- A tiny JPEG, assembled from segments --------------------------------
const seg = (marker, payload) => {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
};
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
/** A TIFF block whose first directory holds the given tags (each 12 bytes). */
const tiff = (little, tags) => {
  const u16 = (n) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n) => (little
    ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
    : [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const out = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(tags.length)];
  for (const tag of tags) out.push(...u16(tag), ...u16(4), ...u32(1), ...u32(0));
  out.push(...u32(0));
  return out;
};
const exif = (little, tags) => seg(0xe1, [...ascii('Exif'), 0, 0, ...tiff(little, tags)]);
const JFIF = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9, 9]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(1)]);
const PICTURE = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0x00, 0x78, 0xff, 0xd9];
const jpeg = (...segments) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...PICTURE]);

const ORIENTATION = 0x0112;
const GPS = 0x8825;

// ---------------------------------------------------------------------------
// 1. IT FINDS A LOCATION WHEREVER A CAMERA PUTS ONE
// ---------------------------------------------------------------------------
ok(jpegCarriesLocation(jpeg(JFIF, exif(true, [ORIENTATION, GPS]), DQT)),
  'a GPS block in EXIF (Intel byte order, as most phones write it)');
ok(jpegCarriesLocation(jpeg(exif(false, [GPS]), DQT)),
  'a GPS block in EXIF (Motorola byte order, as some cameras write it)');
ok(jpegCarriesLocation(jpeg(JFIF, seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta exif:GPSLatitude="51,30N"/>')), DQT)),
  'coordinates written into XMP instead');

// ---------------------------------------------------------------------------
// 2. AND DOES NOT CRY WOLF, so a photo with nothing to hide is not re-encoded
// ---------------------------------------------------------------------------
ok(!jpegCarriesLocation(jpeg(JFIF, exif(true, [ORIENTATION]), DQT)),
  'EXIF with only the rotation in it is not a location');
// In both byte orders: a reader that ignored the order would misread the
// directory, fall back to "assume a location", and answer yes here -- which
// the GPS cases above cannot tell apart from reading it properly.
ok(!jpegCarriesLocation(jpeg(exif(false, [ORIENTATION]), DQT)),
  'nor in Motorola byte order, which is only answered right if the order is actually read');
ok(!jpegCarriesLocation(jpeg(JFIF, DQT)), 'a JPEG with no metadata at all');
ok(!jpegCarriesLocation(new Uint8Array(ascii('%PDF-1.4 not a photo'))), 'a file that is not a JPEG');
ok(!jpegCarriesLocation(new Uint8Array([])), 'an empty file');

// ---------------------------------------------------------------------------
// 3. BROKEN FILES: never a throw, and an unreadable EXIF counts as a location
// ---------------------------------------------------------------------------
{
  const whole = jpeg(JFIF, exif(true, [ORIENTATION, GPS]), DQT);
  // Cut inside the EXIF block, as reading only the first bytes of a file can.
  const cut = whole.slice(0, 2 + JFIF.length + 16);
  let threw = false;
  let answer;
  try { answer = jpegCarriesLocation(cut); } catch { threw = true; }
  ok(!threw, 'a file cut off in the middle of its EXIF does not throw');
  ok(answer === true, 'and is treated as carrying a location, because the safe mistake is one re-encode');
  let threwOnJunk = false;
  try { jpegCarriesLocation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0x45])); } catch { threwOnJunk = true; }
  ok(!threwOnJunk, 'a nonsense length does not throw either');
}

// ---------------------------------------------------------------------------
// 4. THE FALLBACK CUTS THE METADATA AND LEAVES THE PICTURE BYTE FOR BYTE
// ---------------------------------------------------------------------------
{
  const iptc = seg(0xed, [...ascii('Photoshop 3.0'), 0, 1, 2, 3]);
  const original = jpeg(JFIF, exif(true, [ORIENTATION, GPS]), ICC, iptc, DQT);
  const clean = withoutJpegMetadata(original);
  ok(clean instanceof Uint8Array, 'it produces a file');
  ok(clean && !jpegCarriesLocation(clean), 'with no location left in it');
  const has = (bytes, marker) => {
    for (let i = 2; i + 1 < bytes.length; i++) if (bytes[i] === 0xff && bytes[i + 1] === marker) return true;
    return false;
  };
  ok(clean && !has(clean, 0xe1) && !has(clean, 0xed), 'EXIF, XMP and IPTC are all gone');
  ok(clean && has(clean, 0xe0) && has(clean, 0xe2) && has(clean, 0xdb),
    'the JFIF header, the colour profile and the tables the picture needs are kept');
  const tail = (b) => Array.from(b.slice(b.length - PICTURE.length)).join(',');
  ok(clean && tail(clean) === PICTURE.join(','), 'and the picture itself is untouched, to its last byte');
  ok(withoutJpegMetadata(new Uint8Array(ascii('not a jpeg'))) === null, 'anything that is not a JPEG is left to the caller');
}

// ---------------------------------------------------------------------------
// 5. EVERY PHOTO GOES THROUGH IT
// ---------------------------------------------------------------------------
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const shrink = strip(readFileSync('lib/live/shrink-image.ts', 'utf8'));
  const body = shrink.slice(shrink.indexOf('export async function shrinkImage('));
  const asked = body.indexOf('await carriesLocation(file)');
  const sizeRule = body.indexOf('if (!isShrinkable(file) && !located) return file;');
  ok(asked !== -1 && sizeRule > asked,
    'the shrinker asks every JPEG about its location BEFORE the size rule can wave it through');
  ok(/jpegCarriesLocation\(new Uint8Array\(await file\.slice\(0, HEAD_BYTES\)\.arrayBuffer\(\)\)\)/.test(shrink),
    'reading only the front of the file, where a JPEG keeps its metadata');
  ok(/withoutJpegMetadata\(/.test(shrink), 'and cuts the metadata out itself when a canvas cannot help');

  // Every function in the data layer that uploads a file, found by its
  // `.upload(` call rather than listed by hand, so a sixth one cannot arrive
  // without being asked the question.
  const data = strip(readFileSync('lib/live/data.ts', 'utf8'));
  const uploaders = new Map();
  for (const m of data.matchAll(/\.upload\(/g)) {
    const head = data.lastIndexOf('export async function ', m.index);
    const name = data.slice(head + 'export async function '.length).match(/^\w+/)[0];
    uploaders.set(name, data.slice(head, m.index));
  }
  // THE ONE DELIBERATE EXCEPTION: evidence attached to a safeguarding report
  // is kept exactly as it was sent. Re-encoding evidence changes it, only the
  // leadership handling the report can open it, and where a photo was taken
  // can be the point of it. The privacy notice says so.
  const EXCEPT = new Set(['attachReportEvidence']);
  ok(uploaders.size >= 5, `the uploads were found (${[...uploaders.keys()].join(', ')})`);
  for (const [name, before] of uploaders) {
    if (EXCEPT.has(name)) continue;
    ok(/await shrinkImage\(\w+\)/.test(before), `${name} shrinks the photo, and drops its location, before uploading`);
  }
  const notice = readFileSync('app/privacy/page.tsx', 'utf8').replace(/\s+/g, ' ');
  ok(/safeguarding report is kept exactly as you send it/.test(notice),
    'and the notice names the one exception rather than letting it differ quietly');
  ok(/a resource and a study handout/.test(notice), 'and names the two uploads added on 25 September 2026');
}

console.log(bad === 0 ? '\nNo photo leaves with its location.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
