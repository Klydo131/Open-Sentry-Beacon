// The app works with no signal: every screen, every tool, and what a signed-in
// person last read.
//
// The owner, 16 October 2026: "How is it still and "offline" first local web
// app if all of the features are not usable offline? Can we fix that today
// and make an update?" Measured that day with the server stopped, after
// opening Home and the Church online: 10 of 27 screens opened, and 4 of the 5
// Music folders failed. The signed-in app opened on "Could not load your
// account". Settings said "Beacon keeps working offline".
//
// What this holds (the browser half is tests/e2e/the-app-works-with-no-signal.js,
// which stops the server and walks every screen):
//
//   1. THE WORKER KNOWS EVERY SCREEN. Every page in app/ without a [part] in
//      its address is on the worker's list. The list once held the screens
//      somebody remembered and missed twelve, the Menu among them.
//   2. THE BUNDLER WRITES THE LIST OF CODE (scripts/offline-files.mjs), the
//      worker reads it for its own build, keeps every screen's code and every
//      tool's, copies forward what the last build kept, and an update never
//      deletes a person's kept data. After a build: the list names the Music
//      room's folders, the drawing board and the PDF reader, and every file it
//      names exists.
//   3. A SIGNED-IN READ IS KEPT AND A WRITE NEVER IS (lib/live/kept.ts), run
//      here against a pretend network and a pretend cache: kept as it arrives,
//      answered from the copy with no signal, only to the account that read
//      it, and deleted at sign-out.
//   4. ONLY FUNCTIONS THAT CHANGE NOTHING are answered from a copy: the kept
//      list is exactly the database functions the app calls that the
//      migrations declare STABLE or IMMUTABLE.
//
//   node tests/the-app-works-with-no-signal.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---- the worker -------------------------------------------------------------
const route = read('app/sw.js/route.ts');
const m = route.match(/const SOURCE = ("(?:[^"\\]|\\.)*");/s);
const worker = m ? JSON.parse(m[1]) : '';
ok(!!worker, 'the worker source is one string in app/sw.js/route.ts');
const shell = (() => {
  const s = worker.match(/const SHELL = \[([\s\S]*?)\];/);
  return s ? [...s[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
})();

// 1. Every screen.
const pages = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name === 'page.tsx') pages.push(rel);
  }
};
walk('app');
const addresses = pages
  .map((p) => '/' + p.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, ''))
  .map((a) => (a === '/' ? '/' : a.replace(/\/$/, '')));
const fixed = addresses.filter((a) => !a.includes('['));
const missing = fixed.filter((a) => !shell.includes(a));
ok(fixed.length >= 25 && missing.length === 0,
   `every screen in app/ is on the worker's list (${fixed.length} screens${missing.length ? `; missing ${missing.join(', ')}` : ''})`);
const strays = shell.filter((a) => !a.includes('.') && a !== '/offline.html' && !fixed.includes(a));
ok(strays.length === 0, `and the list names no screen that does not exist${strays.length ? ` (${strays.join(', ')})` : ''}`);
ok(addresses.includes('/dm/[id]') && /PERSON_PAGE = \/\^\\\/dm\\\//.test(worker),
   "a person's own page (/dm/<id>) is kept for the people the screen links to");

// 2. The list of code, and how the worker uses it.
ok(/const LIST = `\/_next\/static\/offline\/\$\{BUILD\}\.json`/.test(worker),
   "the worker reads the bundler's list for its own build");
ok(/OfflineFilesPlugin/.test(read('next.config.mjs')) && /!isServer && !dev/.test(read('next.config.mjs')),
   'next.config.mjs has the bundler write that list for every production build');
ok(/keepAll\(cache, firstFiles\(list\), true\)/.test(worker) && /keepAll\(cache, laterFiles\(list\), true\)/.test(worker),
   'the worker keeps every screen\'s code at install and every tool\'s when asked');
ok(/const before = await caches\.match\(url\)/.test(worker) && /immutable\(url\)/.test(worker),
   'a file the last build kept is copied forward, so an update downloads only what changed');
ok(/const isBuildCache = \(k\) => k\.startsWith\('beacon-'\) && !k\.startsWith\('beacon-kept-'\)/.test(worker)
   && /filter\(\(k\) => isBuildCache\(k\) && k !== CACHE\)/.test(worker),
   "an update replaces the app's own caches and never a person's kept data");
ok(/cache\.match\(request\)\) \|\| \(await cache\.match\(key\)\)/.test(worker),
   'a link into a folder (/music?room=tuner) finds the screen kept for /music');
ok(/url\.pathname === '\/version\.json' \|\| url\.pathname\.startsWith\('\/api\/'\)/.test(worker),
   'questions for the server (version, sign-in) are never answered from a copy');
const sw = read('components/ServiceWorker.tsx');
ok(/askWorker\(true\)/.test(sw) && /addEventListener\('online', keepEverything\)/.test(sw),
   'the app asks the worker to finish keeping everything when it opens and when the signal returns');
ok(/saveData === true/.test(read('lib/offline-ready.ts')) && /!savingData\(\)/.test(read('lib/offline-ready.ts')),
   'and not on Data Saver');

// After a build, the list itself.
const build_ = (read('lib/build-info.ts').match(/export const BUILD_ID = "([^"]+)"/) || [])[1];
const listFile = path.join(root, '.next', 'static', 'offline', `${build_}.json`);
if (build_ && fs.existsSync(listFile)) {
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const from = list.tools.map((t) => t.from);
  ok(list.build === build_ && list.pages.length > 20, `the list is for this build (${build_}) and names every screen's code (${list.pages.length} files)`);
  ok(from.includes('components/music/MusicRoom.tsx') && from.includes('components/draw/Draw.tsx')
     && from.some((f) => f.startsWith('lib/music/')) && from.some((f) => f.startsWith('components/study/')),
     `and every tool: the Music folders, the drawing board, the PDF reader, the study room (${from.join(', ')})`);
  const all = [...list.pages, ...list.tools.flatMap((t) => t.files)];
  const gone = all.filter((u) => !fs.existsSync(path.join(root, '.next', decodeURIComponent(u.replace(/^\/_next\//, '')))));
  ok(gone.length === 0, `every file it names was built (${all.length} files${gone.length ? `; missing ${gone.slice(0, 3).join(', ')}` : ''})`);
  ok(all.some((u) => u.includes('/app/dm/%5Bid%5D/')) && !all.some((u) => /[[\]]/.test(u)),
     "each file is named as the browser asks for it ([id] as %5Bid%5D), or a kept copy is never found");
  const reasons = (list.leftOut || []).map((l) => l.why);
  ok(reasons.length === 3 && (list.leftOut || []).every((l) => l.files > 0),
     `only the three named extras are left out: ${(list.leftOut || []).map((l) => `${l.why} (${(l.bytes / 1e6).toFixed(1)} MB)`).join('; ')}`);
  ok(list.tools.some((t) => t.from === '@excalidraw/excalidraw') && list.tools.some((t) => t.from === '@blocksuite/affine-block-code'),
     "what a library loads for itself as a tool opens is kept (the drawing board's English words, the study room's code colours)");
  ok(list.extras.some((f) => f.startsWith('/excalidraw/')) && !list.extras.includes('/third-party-notices.txt'),
     "the drawing board's fonts are kept, the licence text is not");
} else {
  console.log(`SKIP the list itself: no build of ${build_ || '(unknown)'} here (npm run build writes it)`);
}

// ---- 3. a signed-in read is kept, and a write never is ----------------------
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-kept-'));
const file = path.join(out, 'kept.mjs');
await build({
  entryPoints: [path.join(root, 'lib/live/kept.ts')],
  alias: { '@': root },
  outfile: file,
  bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'silent',
});
const K = await import(pathToFileURL(file).href);

/** A pretend Cache Storage, enough of it for this. */
function pretendCaches() {
  const stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  return {
    stores,
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const s = stores.get(name);
      return {
        async put(r, res) { s.delete(keyOf(r)); s.set(keyOf(r), res); },
        async match(r) { const hit = s.get(keyOf(r)); return hit ? hit.clone() : undefined; },
        async keys() { return [...s.keys()].map((url) => ({ url })); },
        async delete(r) { return s.delete(keyOf(r)); },
      };
    },
  };
}
const token = (sub) => `x.${Buffer.from(JSON.stringify({ sub, role: 'authenticated' })).toString('base64url')}.y`;
const ANNA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const DB = 'https://church.example.supabase.co';
const ask = (sub, extra = {}) => ({ headers: { Authorization: `Bearer ${token(sub)}`, apikey: 'anon', ...extra.headers }, ...extra });

globalThis.caches = pretendCaches();
let signal = true;
let sent = 0;
const network = async (input, init) => {
  sent++;
  if (!signal) throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify({ answer: `${init?.method ?? 'GET'} ${String(input)}`, n: sent }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const settle = () => new Promise((r) => setTimeout(r, 20));
const body = async (res) => (await res.json()).answer;

const profile = `${DB}/rest/v1/profiles?select=*&id=eq.${ANNA}`;
const first = await K.keptFetch(profile, { method: 'GET', ...ask(ANNA) }, network);
await settle();
signal = false;
const again = await K.keptFetch(profile, { method: 'GET', ...ask(ANNA) }, network).catch(() => null);
ok(!!again && (await body(again)) === (await body(first)) && !!again.headers.get('x-beacon-kept-at'),
   'a read is kept as it arrives, and with no signal the same read is answered from the copy');
const asBen = await K.keptFetch(profile, { method: 'GET', ...ask(BEN) }, network).catch((e) => e);
ok(asBen instanceof TypeError, 'and only to the account that read it: another account gets no signal, not her copy');

signal = true;
const feed = `${DB}/rest/v1/rpc/blog_feed`;
await K.keptFetch(feed, { method: 'POST', body: '{"lim":20}', ...ask(ANNA) }, network);
const send = `${DB}/rest/v1/rpc/answer_meeting`;
await K.keptFetch(send, { method: 'POST', body: '{"id":"m1","yes":true}', ...ask(ANNA) }, network);
const post = `${DB}/rest/v1/messages`;
await K.keptFetch(post, { method: 'POST', body: '{"body":"hi"}', ...ask(ANNA) }, network);
await settle();
signal = false;
const feedAgain = await K.keptFetch(feed, { method: 'POST', body: '{"lim":20}', ...ask(ANNA) }, network).catch(() => null);
ok(!!feedAgain, 'a function that changes nothing (blog_feed) is answered from the copy');
const otherArgs = await K.keptFetch(feed, { method: 'POST', body: '{"lim":50}', ...ask(ANNA) }, network).catch((e) => e);
ok(otherArgs instanceof TypeError, 'but only for the same question: different arguments are not the same read');
const sendAgain = await K.keptFetch(send, { method: 'POST', body: '{"id":"m1","yes":true}', ...ask(ANNA) }, network).catch((e) => e);
ok(sendAgain instanceof TypeError, 'a function that changes something (answer_meeting) is never answered from a copy: it fails, and says so');
const postAgain = await K.keptFetch(post, { method: 'POST', body: '{"body":"hi"}', ...ask(ANNA) }, network).catch((e) => e);
ok(postAgain instanceof TypeError, 'nor is a write to a table');
const kept = [...(globalThis.caches.stores.get(`beacon-kept-${ANNA}`)?.keys() ?? [])];
ok(kept.length === 2 && kept.every((k) => !/answer_meeting|\/messages/.test(k)), `only the two reads were kept (${kept.length})`);
ok(K.keptKey({ url: new URL(`${DB}/auth/v1/user`), method: 'GET', headers: new Headers(), body: '' }) === null
   && K.keptKey({ url: new URL(`${DB}/storage/v1/object/list/x`), method: 'POST', headers: new Headers(), body: '{}' }) === null,
   'sign-in and files are never kept');
const single = K.keptKey({ url: new URL(profile), method: 'GET', headers: new Headers({ accept: 'application/vnd.pgrst.object+json' }), body: '' });
const many = K.keptKey({ url: new URL(profile), method: 'GET', headers: new Headers({ accept: 'application/json' }), body: '' });
ok(single !== many, 'one row and a list of rows are kept apart, because they are answered differently');
const anon = await (async () => { signal = true; const before = globalThis.caches.stores.size; await K.keptFetch(`${DB}/rest/v1/churches?select=name`, { method: 'GET', headers: { apikey: 'anon' } }, network); await settle(); return globalThis.caches.stores.size === before; })();
ok(anon, 'a read made by nobody (before sign-in) is not kept');

// The church takes something away: the next refused read deletes its copy.
{
  signal = true;
  const minors = `${DB}/rest/v1/rpc/minors_in_church`;
  await K.keptFetch(minors, { method: 'POST', body: '{}', ...ask(ANNA) }, network);
  await settle();
  const refuse = async () => new Response('{"message":"permission denied"}', { status: 403 });
  await K.keptFetch(minors, { method: 'POST', body: '{}', ...ask(ANNA) }, refuse);
  await settle();
  signal = false;
  const after = await K.keptFetch(minors, { method: 'POST', body: '{}', ...ask(ANNA) }, network).catch((e) => e);
  ok(after instanceof TypeError, 'a read the database now refuses deletes its kept copy: a leader who stepped down keeps nothing of it');
  signal = true;
  const down = async () => new Response('', { status: 503 });
  await K.keptFetch(profile, { method: 'GET', ...ask(ANNA) }, network);
  await settle();
  await K.keptFetch(profile, { method: 'GET', ...ask(ANNA) }, down);
  await settle();
  signal = false;
  const stillThere = await K.keptFetch(profile, { method: 'GET', ...ask(ANNA) }, network).catch(() => null);
  ok(!!stillThere, 'but a server that is down (503) deletes nothing');
  signal = true;
}

// Ben signs in on the same device: Anna's copy goes.
await K.keptFetch(profile, { method: 'GET', ...ask(BEN) }, network);
await settle();
ok(!globalThis.caches.stores.has(`beacon-kept-${ANNA}`) && globalThis.caches.stores.has(`beacon-kept-${BEN}`),
   "another account reading on this device deletes the last account's copy");
globalThis.caches.stores.set('beacon-somebuild', new Map());
await K.forgetEverythingKept();
ok(![...globalThis.caches.stores.keys()].some((k) => k.startsWith('beacon-kept-')) && globalThis.caches.stores.has('beacon-somebuild'),
   'signing out deletes every kept copy, and leaves the app itself');
const client = read('lib/supabase/client.ts');
ok(/export function clearBrowserSession\(\) \{[\s\S]*?void forgetEverythingKept\(\);[\s\S]*?\n\}/.test(client),
   'clearing the session is what forgets: every sign-out goes through it');
ok(/const res = await keptFetch\(input, init, fetch\);/.test(client), 'every database call goes through the kept copy');

// ---- 4. only functions that change nothing -----------------------------------
const data = read('lib/live/data.ts');
const called = [...new Set([...data.matchAll(/\.rpc\(\s*'([a-z_0-9]+)'/g)].map((x) => x[1]))];
const declared = new Map();
const dir = path.join(root, 'supabase', 'migrations');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_0-9]+)"?\s*\(/gi;
  let d;
  while ((d = re.exec(sql))) {
    const rest = sql.slice(d.index);
    const open = rest.match(/\$([A-Za-z_]*)\$/);
    if (!open) continue;
    const after = rest.slice(open.index + open[0].length);
    const close = after.indexOf(open[0]);
    if (close < 0) continue;
    const words = (rest.slice(0, open.index) + ' ' + after.slice(close + open[0].length).split(';')[0]).toLowerCase();
    declared.set(d[1].toLowerCase(), /\b(stable|immutable)\b/.test(words) ? 'reads' : 'writes');
  }
}
const reads = called.filter((n) => declared.get(n) === 'reads').sort();
const listed = [...K.READ_FUNCTIONS].sort();
const unsafe = listed.filter((n) => declared.get(n) !== 'reads');
const forgotten = reads.filter((n) => !K.READ_FUNCTIONS.has(n));
ok(unsafe.length === 0, `every function answered from a copy is declared STABLE or IMMUTABLE by the database${unsafe.length ? ` (not: ${unsafe.join(', ')})` : ''}`);
ok(forgotten.length === 0, `and every such function the app calls is kept (${reads.length} of ${called.length} the app calls)${forgotten.length ? `; missing ${forgotten.join(', ')}` : ''}`);
ok(declared.get('answer_meeting') === 'writes' && declared.get('blog_feed') === 'reads', 'the reading of the migrations tells a write from a read');

console.log(bad ? `\n${bad} failed` : '\nAll OK');
process.exit(bad ? 1 : 0);
