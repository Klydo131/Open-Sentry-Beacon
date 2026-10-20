// The study room keeps what it promises: deleted is gone, offline writing is
// kept, a page arrives when it is asked for, and pictures leave with the last
// page that shows them.
//
// ---------------------------------------------------------------------------
// REPORTED ON 19 OCTOBER 2026 (the Study room bug report), and fixed on the
// 20th, when the owner asked: "I dont want to see any more repeated bugs
// throughout updated version." So each fix has a check that fails if the bug
// comes back:
//
//   * "Delete forever" left the page's row in the database, and every room's
//     first page had the same id, so emptying a room and starting again
//     brought the deleted writing back.
//   * Nothing was kept on the device: writing done without a signal was lost
//     when the tab closed, and the room could not open offline.
//   * Pages came from the database all at once with an eight-second wait, so
//     opening page thirty of forty said the whole room "did not answer".
//   * Pictures stayed in the database after the last page showing them went.
//
// The engine half runs in Node (tests/fixtures/a-study-room-keeps-its-
// promises.ts, bundled with esbuild as a-room-that-already-exists-still-opens
// does); the room's own decisions are read from its source below.
//
//   node tests/a-study-room-keeps-its-promises.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-study-promises-'));
const outfile = path.join(out, 'promises.mjs');
await build({
  entryPoints: [path.join(root, 'tests/fixtures/a-study-room-keeps-its-promises.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2020',
  alias: { '@': root },
  outfile,
  logLevel: 'error',
});
const stdout = execFileSync(process.execPath, [outfile], { cwd: root, encoding: 'utf8', timeout: 120_000 });
const r = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() ?? '{}');
if (r.threw) console.log(`the fixture threw: ${r.threw}`);

// 1. ---------------------------------------------------------------------------
ok(r.writtenReachesDatabase && r.writtenOnDevice, 'writing reaches the device copy and the database');
ok(r.deletedFromList && r.deletedFromDevice && r.deletedFromDatabase && r.deleteReportsNothingMissed,
  'deleted for good: off the list, off the device, out of the database');
ok(r.neverComesBack === true, 'and a second device opened afterwards never sees the writing again');
{
  const editor = code('components/study/StudyRoomEditor.tsx');
  ok(!/createDoc\(\s*FIRST_PAGE\s*\)/.test(editor) && !/'page-1'/.test(editor),
    'a new first page gets a new id, never the old fixed one that pulled deleted writing back');
  ok(/room\.deleteForever\(id\)/.test(editor) && /rememberToForget\(ownerId, id\)/.test(editor),
    '"Delete forever" deletes everywhere, and remembers to finish a deletion the database missed');
}

// 2. ---------------------------------------------------------------------------
ok(r.offlineKeptOnDevice && r.offlineNothingInDatabase, 'with no connection, writing is kept on the device');
ok(r.offlineSaysWaiting === true, 'and the room says it is waiting, not saved');
ok(r.reachesDatabaseWhenBack === true, 'and it reaches the database when the connection comes back');
ok(r.saysSavedWhenBack === true, 'after which the room says saved');
{
  const room = code('components/study/StudyRoom.tsx');
  ok(/new LocalDocSource\(/.test(room) && /shadows: \[remote\]/.test(room),
    'the live room keeps this device\'s copy first and the database behind it');
  ok(/canKeepOnThisDevice\(\)/.test(room), 'and falls back to the database alone where a browser keeps nothing');
  const kept = code('lib/live/kept.ts');
  ok(/forgetEveryLocalRoom\(\)/.test(kept), 'signing out deletes the study room\'s copy from the device');
}

// 3. ---------------------------------------------------------------------------
ok(r.freshDeviceSeesTheList === true, 'a device that never held the room gets its list of forty pages');
ok(r.askedForPageArrives === true, `the page asked for arrives (${r.askedForPageMs} ms with a slow database)`);
ok(r.askedForPageArrivesBeforeMost === true, 'ahead of most of the others, because it was asked for');
ok(r.answeredMarksThePage === true, 'and the database is known to have answered for it');
{
  const editor = code('components/study/StudyRoomEditor.tsx');
  ok(/room\.putFirst\(openPage\)/.test(editor), 'opening a page puts it first in the queue');
  ok(/setPageMissing\(true\)/.test(editor) && !/if \(!store\.root\) \{\s*setStalled\(true\)/.test(editor),
    'a page that has not arrived says so on the page, and never shuts the whole room');
}

// 4. ---------------------------------------------------------------------------
ok(r.picturesAreFound === true, 'the pictures a page shows are found from its blocks');
ok(r.onlyPictureGoes === true, 'a picture only the deleted page showed is deleted with it');
ok(r.sharedPictureStays === true, 'a picture another page still shows stays');

// 5. The room's other hiccups -------------------------------------------------
{
  const editor = code('components/study/StudyRoomEditor.tsx');
  ok(!/setError\(/.test(editor) && /setHiccup\(/.test(editor) && /setFatal\(/.test(editor),
    'a failed insert or export is a passing line, not the whole room replaced until reload');
  const blobs = code('lib/study/blob-source.ts');
  ok(/shrinkImage\(/.test(blobs) && /prepareStudyFile/.test(code('lib/study/local-source.ts')),
    'a photo is made smaller and loses where it was taken before it is kept, on the device and in the database');
}

process.exit(bad === 0 ? 0 : 1);
