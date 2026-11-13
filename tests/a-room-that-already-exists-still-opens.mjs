// A study room that is already in the database still opens.
//
// ---------------------------------------------------------------------------
// THE GAP THIS FILLS, AND IT COST A LIVE AFTERNOON. Every other check on the
// study room opens a NEW room: the browser walk runs against the tutorial,
// because the tutorial needs no credentials, and the tutorial starts empty
// every time. A new room is the one case that cannot go wrong -- the code that
// reads it is the code that just wrote it.
//
// The rooms that differ are the stored ones. Trimming the editor down to what a
// study room needs dropped `affine:surface`, the infinite canvas, which this
// room does not draw. But the pages already written have a surface block in
// them, and loading one raises `schema for flavour: affine:surface not found`.
//
// MEASURED, NOT ASSUMED, because the first version of this comment claimed the
// room never opened at all and that was wrong. BlockSuite catches that error,
// logs "An error occurred while adding block", skips the block and carries on:
// the page opens, the note and the paragraph are there, the writing is intact.
// What is left is an error on every open and one block the app can see in the
// store but not in the model. Keeping the schema costs nothing and ends both.
//
// The reason to have this file is broader than that one block: no check in this
// repo had ever opened a page it did not just write, and none had ever asked
// what happens when the database refuses. It now covers both -- the second half
// is at the bottom, where a source that cannot save has to say so.
//
// So this opens a page of that shape with today's extension set. It runs the
// real StudyWorkspace against a document source that hands back stored bytes,
// in Node -- no browser, because the failure is in the store layer, not the
// view. The page is built by hand from the shape, not from anybody's data.
//
// The bundling step is what lets a .ts file under lib/ run here at all:
// @blocksuite ships compiled output using the `accessor` keyword, which Node
// cannot parse, so esbuild lowers it exactly as scripts/accessor-loader.cjs
// does for webpack. It is esbuild's own API rather than `npx esbuild`, because
// this gate runs on Windows too and `npx` there is a different executable.
//
//   node tests/a-room-that-already-exists-still-opens.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-stored-room-'));
const bundle = path.join(out, 'open-a-stored-room.mjs');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** Bundle one fixture and run it, handing back the JSON it prints. */
async function runFixture(name) {
  const outfile = path.join(out, `${name}.mjs`);
  await build({
    entryPoints: [path.join(root, `tests/fixtures/${name}.ts`)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    // es2020 is below the `accessor` proposal, so esbuild lowers it rather than
    // passing it through for Node to choke on.
    target: 'es2020',
    alias: { '@': root },
    outfile,
    logLevel: 'error',
  });
  const stdout = execFileSync(process.execPath, [outfile], { cwd: root, encoding: 'utf8', timeout: 90_000 });
  return JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() ?? '{}');
}

let result;
let trouble;
try {
  result = await runFixture('open-a-stored-room');
  trouble = await runFixture('a-source-in-trouble');
} catch (cause) {
  ok(false, `the fixtures ran at all (${String(cause).slice(0, 200)})`);
  console.log(`\nRESULT: ${bad} FAILURE(S)`);
  process.exit(1);
}

// A flavour the schema cannot resolve raises inside the load. BlockSuite catches
// it and carries on, so this assertion is about the loud kind of failure -- a
// throw that escapes and takes the room with it.
ok(!result.threw, `opening a stored page does not throw (${result.threw ?? 'no error'})`);

ok(result.root === 'affine:page', `the page has its root (${result.root})`);

// Every flavour this room has ever written into a stored page has to stay
// readable, whether or not it is still drawn.
for (const flavour of ['affine:page', 'affine:surface', 'affine:note', 'affine:paragraph']) {
  ok((result.flavours ?? []).includes(flavour), `${flavour} still resolves`);
}

// And the writing itself survives, which is the only reason any of the above
// matters.
ok(result.text === 'what was written before',
   `what was already written is still there (${JSON.stringify(result.text)})`);

// THE PAGE LIST COMES BACK TOO. It lives in the workspace document rather than
// in any page, and a room that loses it opens showing one page while the rest of
// somebody's writing sits in the database with nothing pointing at it.
ok((result.pages ?? []).length === 2,
   `every stored page is in the list (${JSON.stringify(result.pages)})`);
ok((result.pages ?? []).includes('page-2:Daniel'),
   'and a page somebody named keeps its name');

// ---------------------------------------------------------------------------
// AND A SOURCE THAT CANNOT SAVE SAYS SO
// ---------------------------------------------------------------------------
//
// DocEngine catches everything a source throws and retries quietly. That is
// right for a dropped packet and wrong for a room that will never save again:
// the person keeps writing into a page that looks perfectly normal, and the
// only thing this app exists to do -- keep what they wrote -- is not happening.
ok(trouble.reportedOnPull === true, 'a failed read is reported upward');
ok(trouble.reportedOnPush === true, 'a failed save is reported upward');
// A warning that never clears is its own bug: somebody stops believing it, and
// then does not believe the true one either.
ok(trouble.clearedOnSuccess === true, 'and the warning clears once a save gets through');

fs.rmSync(out, { recursive: true, force: true });

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
