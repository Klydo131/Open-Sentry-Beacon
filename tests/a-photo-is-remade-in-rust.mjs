// A photo is remade in Rust.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 27 October 2026: "We can use Rust for Data security." The
// costed plan found one place where Rust earns its keep here: remaking a photo
// from its pixels on the server, so that nothing a file carried survives but
// the picture. tools/photo-remake is the Rust; it is built to WebAssembly and
// carried as text in supabase/functions/_shared/photo-remake-wasm.ts, which
// the photo-check function uses for a JPEG that says where it was taken.
//
// THIS RUNS THE COMMITTED WEBASSEMBLY, through the function, on a real photo
// (tests/fixtures/located-upright.jpg: invented, 240 by 120, an invented GPS
// block, and a tag saying the camera was turned a quarter). It also holds the
// parts nobody would see by reading: that the base64 is the WebAssembly whose
// checksum is written beside it, and that it can reach nothing outside itself.
// Rebuilding it from the Rust and comparing is `node tools/photo-remake/build.mjs
// --check`, which needs Rust 1.97.0 and so is not part of this gate.
//
//   node tests/a-photo-is-remade-in-rust.mjs
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---- the WebAssembly is what it says it is ----
const { WASM_BASE64, WASM_SHA256 } = await load('supabase/functions/_shared/photo-remake-wasm.ts');
const wasm = Buffer.from(WASM_BASE64, 'base64');
ok(crypto.createHash('sha256').update(wasm).digest('hex') === WASM_SHA256,
   `the embedded WebAssembly is the one its checksum names (${WASM_SHA256.slice(0, 12)}…)`);
const module = new WebAssembly.Module(wasm);
ok(WebAssembly.Module.imports(module).length === 0,
   'it imports nothing: no network, no files, no clock, only the bytes it is given');
ok(WebAssembly.Module.exports(module).map((e) => e.name).sort().join(',') === 'alloc,dealloc,memory,out_ptr,remake',
   'and offers only the four calls and its memory');

// ---- the Rust is pinned ----
ok(/channel = "1\.97\.0"/.test(read('tools/photo-remake/rust-toolchain.toml')), 'the Rust compiler is pinned');
ok(/image = \{ version = "=0\.25\.10"/.test(read('tools/photo-remake/Cargo.toml')) && fs.existsSync(path.join(root, 'tools/photo-remake/Cargo.lock')),
   'and so is every library it is built from (Cargo.lock)');
ok(/--locked/.test(read('tools/photo-remake/build.mjs')), 'the build uses exactly the locked libraries');

// ---- run through the function, on a real photo ----
const { remakePhoto } = await load('supabase/functions/_shared/photo-remake.ts');
const { jpegCarriesLocation } = await load('lib/live/photo-location.ts');
const photo = new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/located-upright.jpg')));
ok(jpegCarriesLocation(photo), 'the test photo says where it was taken');

/** Width and height from a JPEG's frame header. */
const sizeOf = (b) => {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
};
const has = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text));

const remade = await remakePhoto(photo);
ok(remade && !jpegCarriesLocation(remade) && !has(remade, 'Exif'), 'remade, it no longer says where it was taken, and has no EXIF block');
const size = remade && sizeOf(remade);
ok(size && size.w === 120 && size.h === 240, `and stands the way the camera was held (${size?.w}×${size?.h})`);
const hidden = await remakePhoto(new Uint8Array([...photo, ...Buffer.from('HIDDEN PAYLOAD AFTER THE END')]));
ok(hidden && !has(hidden, 'HIDDEN'), 'bytes hidden after the end of the picture do not survive');
ok((await remakePhoto(new Uint8Array(Buffer.from('not a photo')))) === null, 'what is not a photo is refused, not guessed at');

// ---- and in the function's own path, against a stand-in file store ----
const KEY = 'photo-remake-test-key';
const store = new Map();
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const key = decodeURIComponent(new URL(req.url, 'http://s').pathname.replace(/^\/storage\/v1\/object\//, ''));
  if (req.method === 'GET') {
    const o = store.get(key);
    if (!o) { res.writeHead(400).end('{}'); return; }
    res.writeHead(200, { 'Content-Type': o.mime, 'Content-Length': o.bytes.length }).end(o.bytes);
  } else {
    store.set(key, { bytes: new Uint8Array(Buffer.concat(chunks)), mime: req.headers['content-type'] });
    res.writeHead(200).end('{}');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let handler;
// As in a-photo-is-checked-on-the-server.mjs: the key is the variable ending in _KEY.
const url = `http://127.0.0.1:${server.address().port}`;
globalThis.Deno = { env: { get: (n) => (n === 'SUPABASE_URL' ? url : n.endsWith('_KEY') ? KEY : undefined) }, serve: (h) => { handler = h; } };
await import(`${pathToFileURL(path.join(root, 'supabase/functions/photo-check/index.ts')).href}?remake`);
store.set('pairing-media/avatars/u/held.jpg', { bytes: photo, mime: 'image/jpeg' });
const realLog = console.log;
console.log = () => {};
const res = await handler(new Request('http://f/photo-check', {
  method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ bucket: 'pairing-media', name: 'avatars/u/held.jpg' }),
}));
console.log = realLog;
const answer = await res.json();
const kept = store.get('pairing-media/avatars/u/held.jpg').bytes;
ok(answer.changed === 'cleaned' && answer.how === 'remade', 'photo-check remakes a located JPEG in Rust first');
ok(!jpegCarriesLocation(kept) && sizeOf(kept)?.w === 120, 'and what is stored is the remade, upright photo');
server.close();

console.log(bad ? `\n${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
