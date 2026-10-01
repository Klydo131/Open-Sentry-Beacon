// A file path read from the database never becomes a different request.
//
// ---------------------------------------------------------------------------
// Found by the security review of 1 October 2026. The storage library builds
// `<storage>/object/sign/<bucket>/<path>` from the path exactly as stored, with
// the sign-in of whoever is looking. Paths are written by other people -- the
// other person in a conversation, a Guide sharing a resource, a member
// attaching evidence -- so a path of `../../auth/v1/logout` turned "show this
// picture" into "sign me out of every device".
//
// This holds three things:
//   1. lib/live/storage-path.ts lets through every path the app writes and
//      refuses every shape a URL parser reads as more than a name;
//   2. every signed URL and download in lib/live/data.ts goes through it;
//   3. the app writes only the path shapes listed here, so a new one is
//      looked at before it ships, and the database holds conversation files
//      to theirs.
//
//   node tests/a-stored-path-cannot-leave-its-folder.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const js = ts.transpileModule(readFileSync('lib/live/storage-path.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { isSafeStoragePath, safeStoragePath } = mod.exports;

// 1. THE GUARD ------------------------------------------------------------------
const U = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const V = '11111111-2222-4333-8444-555555555555';
const written = [
  `${U}/${V}`,                                   // a file in a conversation
  `library/${U}/${V}.pdf`,                       // a resource
  `library/${U}/${V}`,                           // a resource with no extension
  `avatars/${U}/1727740800000.jpeg`,             // a profile picture
  `lessons/${U}/${V}-1727740800000.PDF`,         // a handout (its extension keeps its case)
  `reports/${U}/${V}-1727740800000-k3x9qa.png`,  // evidence on a report
];
for (const p of written) ok(isSafeStoragePath(p), `the app's own path passes: ${p.replace(U, '<uuid>').replace(V, '<uuid>')}`);

const hostile = [
  [`${U}/../../../../auth/v1/logout`, 'climbing out with ..'],
  [`${U}/%2e%2e/%2e%2e/auth/v1/logout`, 'climbing out with %2e%2e, which the URL parser reads as ..'],
  [`${U}/.%2E/auth`, 'a mixed .%2E'],
  [`${U}\\..\\..\\auth`, 'backslashes, which the URL parser reads as /'],
  [`${U}/.\t./auth`, 'a tab inside .., which the URL parser deletes'],
  [`${U}/.\n./auth`, 'a newline inside ..'],
  ['/auth/v1/logout', 'a leading /'],
  [`${U}/x?select=*`, 'a ? that starts a query'],
  [`${U}/x#y`, 'a # that ends the path'],
  [`${U}//x`, 'an empty segment'],
  [`./${U}`, 'a . segment'],
  ['', 'an empty path'],
  [null, 'no path at all'],
  [42, 'a number'],
];
for (const [p, why] of hostile) ok(!isSafeStoragePath(p), `refused: ${why}`);
let threw = false;
try { safeStoragePath(`${U}/../x`); } catch (e) { threw = /could not be opened/.test(e.message); }
ok(threw, 'safeStoragePath throws an error a person can read');

// 2. EVERY CALL GOES THROUGH IT ------------------------------------------------------
const data = readFileSync('lib/live/data.ts', 'utf8');
const calls = [...data.matchAll(/\.(createSignedUrl|download)\(/g)];
ok(calls.length >= 6, `found the signed URLs and downloads (${calls.length})`);
for (const m of calls) {
  const fnStart = data.lastIndexOf('export async function', m.index);
  const name = /export async function (\w+)/.exec(data.slice(fnStart))?.[1];
  const before = data.slice(fnStart, m.index);
  const args = data.slice(m.index, data.indexOf(')', m.index + m[0].length + 1) + 1);
  const guarded = /safeStoragePath\(/.test(args) || /isSafeStoragePath\(/.test(before);
  ok(guarded, `${name}(): its ${m[1]} is guarded`);
}
// createSignedUrls (plural) sends the paths in the request body, not the URL,
// so it needs no guard; it is named here so that stays a decision, not luck.
ok(/\.createSignedUrls\(unique,/.test(data), 'the one plural signing call sends its paths in the body');

// 3. THE SHAPES THE APP WRITES -------------------------------------------------------
const templates = [...data.matchAll(/const path = `([^`]+)`/g)].map((m) => m[1]).sort();
const KNOWN = [
  "${pairingId}/${uuid()}",
  "avatars/${me}/${Date.now()}.${ext}",
  "lessons/${me_id}/${lessonId}-${Date.now()}${ext ? '.' + ext : ''}",
  "library/${me_id}/${uuid()}${ext ? '.' + ext : ''}",
  "reports/${me_id}/${reportId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? '.' + ext : ''}",
].sort();
ok(JSON.stringify(templates) === JSON.stringify(KNOWN),
   templates.length === KNOWN.length && templates.every((t, i) => t === KNOWN[i])
     ? 'the app writes only the five known path shapes'
     : `a path shape changed; check it against lib/live/storage-path.ts, then update this list:\n      ${templates.join('\n      ')}`);
// Every extension is cut down to letters and digits before it joins a path.
const exts = [...data.matchAll(/const ext = ([^;]+);/g)].map((m) => m[1]);
ok(exts.length >= 4 && exts.every((e) => /replace\(\/\[\^a-z0-9\]\/gi, ''\)/.test(e)),
   `every extension is reduced to letters and digits (${exts.length})`);

const migration = readFileSync('supabase/migrations/20261001120000_a_conversation_can_reply_react_and_speak.sql', 'utf8');
ok(/pairing_media_path_shape check \(\s*path ~ \('\^' \|\| pairing_id::text \|\| '\/\[0-9a-f\]\{8\}/.test(migration),
   'the database holds a conversation file to <pairing_id>/<uuid>');
ok(/grant\s+insert \(pairing_id, owner_id, title, mime, size, path\) on public\.pairing_media to authenticated/.test(migration),
   'and a browser writes only the six columns the app sends');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
