// A photo is checked on the server.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 27 October 2026, from the costed plan "Rust and Python for Hope
// Beacon": the browser takes a photo's location out before it is sent, and a
// modified app could skip the browser, so the server does it too
// (supabase/migrations/20261027170000_a_photo_is_checked_on_the_server.sql,
// supabase/functions/photo-check). When the database asks is proved by
// supabase/tests/a-photo-is-checked-on-the-server.sql on every fresh install,
// which this checks is run.
//
// THIS RUNS THE FUNCTION ITSELF, the same file Supabase deploys, against a
// stand-in for the file store that keeps files in memory, with photos built
// byte by byte: one that says where it was taken, one that does not, one that
// says so and cannot be read, a PNG with an EXIF chunk. It checks what the
// function wrote back, not what it said it did.
//
//   node tests/a-photo-is-checked-on-the-server.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---- the reader is one reader ----
ok(read('lib/live/photo-location.ts') === read('supabase/functions/_shared/photo-location.ts'),
   'the function reads photos with a byte-for-byte copy of the browser\'s reader');

// ---- a stand-in file store ----
const KEY = 'photo-check-test-key';
const store = new Map();   // "bucket/name" -> { bytes, mime }
const writes = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(403).end(); return; }
  const url = new URL(req.url, 'http://store');
  const parts = url.pathname.replace(/^\/storage\/v1\/object\//, '').split('/').map(decodeURIComponent);
  const bucket = parts.shift();
  const key = `${bucket}/${parts.join('/')}`;
  if (req.method === 'GET') {
    const o = store.get(key);
    if (!o) { res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"not_found"}'); return; }
    res.writeHead(200, { 'Content-Type': o.mime, 'Content-Length': o.bytes.length }).end(o.bytes);
  } else if (req.method === 'PUT') {
    store.set(key, { bytes: new Uint8Array(body), mime: req.headers['content-type'] });
    writes.push(key);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  } else if (req.method === 'DELETE') {
    for (const name of JSON.parse(body.toString()).prefixes) store.delete(`${bucket}/${name}`);
    writes.push(`deleted ${bucket}`);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
  } else {
    res.writeHead(405).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- the function, loaded as Supabase loads it ----
let handler;
// The function's one key is the only variable it reads that ends in _KEY, so
// the stand-in answers by that, and this file need not name the key itself
// (tests/no-backend.js keeps privileged key names to a reviewed list).
const env = (n) => (n === 'SUPABASE_URL' ? base : n.endsWith('_KEY') ? KEY : undefined);
globalThis.Deno = { env: { get: env }, serve: (h) => { handler = h; } };
const logged = [];
const realLog = console.log;
const mod = await import(pathToFileURL(path.join(root, 'supabase/functions/photo-check/index.ts')).href);
const { jpegCarriesLocation } = await import(pathToFileURL(path.join(root, 'lib/live/photo-location.ts')).href);
ok(typeof handler === 'function' && typeof mod.verdictFor === 'function', 'the function loads and serves');

const ask = async (body, key = KEY, method = 'POST') => {
  console.log = (...a) => logged.push(a.join(' '));
  try {
    const res = await handler(new Request('http://function/photo-check', {
      method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }));
    return { status: res.status, body: await res.json() };
  } finally {
    console.log = realLog;
  }
};

// ---- photos, byte by byte (as tests/photos-lose-their-location.mjs builds them) ----
const seg = (marker, payload) => { const len = payload.length + 2; return [0xff, marker, len >> 8, len & 0xff, ...payload]; };
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const tiff = (tags) => {
  const out = [0x49, 0x49, 42, 0, 8, 0, 0, 0, tags.length, 0];
  for (const tag of tags) out.push(tag & 0xff, tag >> 8, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0);
  out.push(0, 0, 0, 0);
  return out;
};
const exif = (tags) => seg(0xe1, [...ascii('Exif'), 0, 0, ...tiff(tags)]);
const JFIF = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(1)]);
const PICTURE = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0x00, 0x78, 0xff, 0xd9];
const jpeg = (...segments) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...PICTURE]);
const GPS = 0x8825;
const ORIENTATION = 0x0112;
const located = jpeg(JFIF, exif([ORIENTATION, GPS]), DQT);
const plain = jpeg(JFIF, exif([ORIENTATION]), DQT);
// Says where it was taken, then a block whose length runs past the end.
const broken = new Uint8Array([0xff, 0xd8, ...JFIF, ...exif([GPS]), 0xff, 0xdb, 0x40, 0x00, 1, 2, 3]);
const pngChunk = (type, data) => [0, 0, 0, data.length, ...ascii(type), ...data, 0, 0, 0, 0];
const png = (...chunks) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunks.flat()]);
const IHDR = pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const IDAT = pngChunk('IDAT', [1, 2, 3]);
const IEND = pngChunk('IEND', []);
const pngWithExif = png(IHDR, pngChunk('eXIf', [0x49, 0x49, 42, 0]), IDAT, IEND);
const pngPlain = png(IHDR, IDAT, IEND);
const put = (key, bytes, mime) => store.set(key, { bytes, mime });
const ends = (bytes, tail) => tail.every((b, i) => bytes[bytes.length - tail.length + i] === b);
const has = (bytes, type) => Buffer.from(bytes).includes(Buffer.from(type));

// ---- only the database may ask ----
ok((await ask({ bucket: 'pairing-media', name: 'x.jpg' }, 'not-the-key')).status === 401, 'a wrong key is refused');
ok((await ask({ bucket: 'pairing-media', name: 'x.jpg' }, '')).status === 401, 'and so is no key');
ok((await ask({}, KEY, 'GET')).status === 405, 'and anything but POST');
ok((await ask({ bucket: 'pairing-media', name: '../avatars/x.jpg' })).status === 400, 'a name that climbs out of its folder is refused');

// ---- a photo that says where it was taken is cleaned, the picture kept ----
put('pairing-media/pair-1/a', located, 'image/jpeg');
let r = await ask({ bucket: 'pairing-media', name: 'pair-1/a' });
const cleaned = store.get('pairing-media/pair-1/a').bytes;
ok(r.body.changed === 'cleaned' && writes.includes('pairing-media/pair-1/a'), 'a JPEG that says where it was taken is written back');
ok(jpegCarriesLocation(located) && !jpegCarriesLocation(cleaned), 'and no longer says where it was taken');
ok(cleaned[0] === 0xff && cleaned[1] === 0xd8 && ends(cleaned, PICTURE), 'with the picture itself byte for byte');
ok(has(cleaned, 'JFIF') && !has(cleaned, 'Exif'), 'keeping what the picture needs, and dropping the EXIF block');
ok(store.get('pairing-media/pair-1/a').mime === 'image/jpeg', 'and still a JPEG');
ok(!logged.some((l) => l.includes('pair-1')), 'the log names no file: a file name carries the ids of the people in it');

// ---- a photo that does not is left alone ----
writes.length = 0;
put('post-media/church/post/b.jpg', plain, 'image/jpeg');
r = await ask({ bucket: 'post-media', name: 'church/post/b.jpg' });
ok(r.body.changed === false && writes.length === 0, 'a JPEG that does not say where it was taken is not written');

// ---- one that says so and cannot be read is removed ----
put('pairing-media/pair-1/c', broken, 'image/jpeg');
r = await ask({ bucket: 'pairing-media', name: 'pair-1/c' });
ok(r.body.changed === 'removed' && !store.has('pairing-media/pair-1/c'),
   'a JPEG that says where it was taken but cannot be read is removed, not kept');

// ---- PNG and WebP keep only their picture ----
writes.length = 0;
put('pairing-media/library/u/d.png', pngWithExif, 'image/png');
r = await ask({ bucket: 'pairing-media', name: 'library/u/d.png' });
const pngAfter = store.get('pairing-media/library/u/d.png').bytes;
ok(r.body.changed === 'cleaned' && !has(pngAfter, 'eXIf') && has(pngAfter, 'IDAT'), 'a PNG loses its EXIF chunk and keeps its picture');
writes.length = 0;
put('pairing-media/library/u/e.png', pngPlain, 'image/png');
r = await ask({ bucket: 'pairing-media', name: 'library/u/e.png' });
ok(r.body.changed === false && writes.length === 0, 'a PNG with nothing to take out is not written');
const webp = new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'),
  ...ascii('VP8X'), 10, 0, 0, 0, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ...ascii('EXIF'), 4, 0, 0, 0, 0x49, 0x49, 42, 0,
  ...ascii('VP8 '), 4, 0, 0, 0, 9, 9, 9, 9]);
put('post-media/c/p/f.webp', webp, 'image/webp');
r = await ask({ bucket: 'post-media', name: 'c/p/f.webp' });
const webpAfter = store.get('post-media/c/p/f.webp').bytes;
ok(r.body.changed === 'cleaned' && !has(webpAfter, 'EXIF') && has(webpAfter, 'VP8 '), 'a WebP loses its EXIF chunk and keeps its picture');

// ---- what is not asked of it ----
writes.length = 0;
put('pairing-media/reports/u/g.jpg', located, 'image/jpeg');
r = await ask({ bucket: 'pairing-media', name: 'reports/u/g.jpg' });
ok(r.body.checked === false && writes.length === 0 && jpegCarriesLocation(store.get('pairing-media/reports/u/g.jpg').bytes),
   'report evidence is kept as it was raised');
r = await ask({ bucket: 'somewhere-else', name: 'h.jpg' });
ok(r.body.checked === false, 'a bucket photos do not go into is not read');
put('pairing-media/lessons/u/i.pdf', located, 'application/pdf');
r = await ask({ bucket: 'pairing-media', name: 'lessons/u/i.pdf' });
ok(r.body.changed === false && writes.length === 0, 'a file that is not a photo is left alone');
r = await ask({ bucket: 'pairing-media', name: 'pair-1/gone' });
ok(r.status === 200 && r.body.why === 'gone', 'a file already gone is nothing to clean');

server.close();

// ---- the database asks, and the edition answers ----
const m = read('supabase/migrations/20261027170000_a_photo_is_checked_on_the_server.sql').replace(/--[^\n]*/g, '');
ok(/after insert on storage\.objects/.test(m) && /after update of metadata on storage\.objects[\s\S]*?old\.metadata ->> 'eTag' is distinct from new\.metadata ->> 'eTag'/.test(m),
   'the database asks when a file arrives, and when one is replaced with new bytes');
ok(/name = 'photo_check_function_url'/.test(m) && /service_key is null or function_url is null then\s+return new/.test(m),
   'and asks nothing until the church has set the address');
ok(/exception when others then\s+return new/.test(m), 'and an upload is kept whatever happens to the request');
ok(/supabase\/tests\/a-photo-is-checked-on-the-server\.sql/.test(read('scripts/fresh-install.sh')),
   'every fresh install proves when it asks, as invented people');
ok(/'photo_check_function_url', \$2/.test(read('selfhost/server/src/migrate.mjs'))
   && /`\$\{INTERNAL_FUNCTIONS\}\/photo-check`/.test(read('selfhost/server/src/migrate.mjs')),
   'the Postgres edition points the check at its own copy of the function');

console.log(bad ? `\n${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
