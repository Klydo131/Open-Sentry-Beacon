// The room's Getting Started page is a gift, not a nag.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "Make sure there is an instruction manual inside the study room so
// Explorers can see the full potential of the Affine features like what Affine
// did in the tutorial."
//
// THE HALF THAT IS EASY TO GET WRONG is not writing the page. It is not writing
// it again. "Is the guide page there?" is also false for somebody who read it
// and put it in the bin, so a room that asks that question hands it back every
// single time they open the room, forever. The same mistake was caught and
// avoided in the pocket's starter tile; this is the same rule in a second
// place, which is exactly when a rule stops being obvious.
//
// WHY THIS IS NOT A BROWSER WALK. The only room a walk can reach is the
// walkthrough's, which keeps its pages in memory and forgets them on reload. A
// walk that deletes the guide and reloads gets a brand new room and the guide
// correctly reappears: it passes on the bug and fails on the fix. Measured,
// after writing exactly that walk and watching it report a failure that was not
// one. The question only means something against a room that remembers.
//
//   node tests/a-guide-is-given-once.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-guide-once-'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const outfile = path.join(out, 'a-guide-is-given-once.mjs');
await build({
  entryPoints: [path.join(root, 'tests/fixtures/a-guide-is-given-once.ts')],
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

let result;
try {
  const stdout = execFileSync(process.execPath, [outfile], {
    cwd: root, encoding: 'utf8', timeout: 120_000,
  });
  result = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() ?? '{}');
} catch (cause) {
  ok(false, `the fixture ran at all (${String(cause).slice(0, 250)})`);
  console.log(`\nRESULT: ${bad} FAILURE(S)`);
  process.exit(1);
}

ok(!result.threw, `opening the rooms did not throw (${result.threw ?? 'no error'})`);

// ---------------------------------------------------------------------------
// 1. A ROOM THAT HAS NEVER HAD IT, GETS IT
// ---------------------------------------------------------------------------
{
  const fresh = result.fresh ?? {};
  ok(fresh.wrote === true, 'a room that has never been guided is given the page');
  ok(fresh.hasGuidePage === true, 'and it is in the page list, so the shelf shows it');
  ok(fresh.guidedAfter === true, 'and the room remembers having been given it');
  // MADE OF THE BLOCKS IT DESCRIBES, which is the point of it being a page
  // rather than a help screen: the to-do items are real and can be ticked.
  ok((fresh.blocks ?? 0) >= 30,
     `and it is a real page of real blocks (${fresh.blocks})`);
}

// ---------------------------------------------------------------------------
// 2. A ROOM THAT HAS HAD IT AND DELETED IT DOES NOT GET IT BACK
// ---------------------------------------------------------------------------
//
// This is the assertion the whole design turns on. The stored room here has the
// flag and NO guide page, which is exactly the state of somebody who read it
// and put it in the bin.
{
  const already = result.already ?? {};
  ok(already.wrote === false,
     'a room that was already guided is not given it a second time');
  ok(already.hasGuidePage === false,
     'so somebody who deleted it does not find it back tomorrow');
  ok(already.pages === 1,
     `and the page list is left exactly as they left it (${already.pages})`);
}

// ---------------------------------------------------------------------------
// 3. NOTHING IS WRITTEN BEFORE THE DATABASE HAS ANSWERED
// ---------------------------------------------------------------------------
//
// A room whose pages are still arriving looks, for a few hundred milliseconds,
// exactly like a room that has none. Writing then gives somebody a second copy
// on every device they open, and marks a room guided that already was.
{
  const waiting = result.waiting ?? {};
  ok(waiting.wrote === false, 'a room that has not answered yet is not written to');
  ok(waiting.guidedAfter === false, 'and is not marked as having been given anything');
}

// ---------------------------------------------------------------------------
// 4. AND NOT TWICE INSIDE ONE SESSION
// ---------------------------------------------------------------------------
{
  const twice = result.twice ?? {};
  ok(twice.first === true && twice.second === false,
     'called twice in one session, it writes once');
  ok(twice.pagesAfterTwo === 2,
     `so a room never ends up with two guides (${twice.pagesAfterTwo} pages)`);
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
