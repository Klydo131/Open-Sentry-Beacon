// The shipping script reads `git status` correctly, including the first line.
//
// THE BUG THIS EXISTS FOR, because it is a good one and it nearly went unnoticed.
//
// `scripts/ship.mjs` asks git what changed, then hands those paths to `git add`.
// It got the list through a helper that trimmed the output -- reasonable for
// `rev-parse`, wrong here. `git status --porcelain` emits `XY<space>path`, and
// the status letters are frequently blank: an ordinary unstaged edit is
// " M path", starting with a SPACE. Trimming the whole output removed that
// space from the FIRST line only. `slice(3)` then cut one character into the
// path, and git was handed `ib/build-info.ts`, which matches nothing.
//
// WHY IT SURVIVED TWO SUCCESSFUL SHIPS. Only the first entry was ever damaged,
// and only when that entry was an unstaged modification. Twice the first path
// happened to be one git listed with a leading letter, or the run committed
// before reaching it. The third time it took down a 25-minute gate run at the
// last step, after everything had passed.
//
// So the parser now lives in its own module -- importing ship.mjs runs it,
// prints usage and exits, which is why the bug had no test in the first place.
//
//   node tests/the-ship-reads-git-correctly.mjs
//
// Pure function, real porcelain samples. Needs no git and no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles } from '../scripts/lib/changed-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const eq = (got, want, msg) =>
  ok(JSON.stringify(got) === JSON.stringify(want),
     `${msg}${JSON.stringify(got) === JSON.stringify(want) ? '' : ` (got ${JSON.stringify(got)})`}`);

// ---------------------------------------------------------------------------
// 1. THE EXACT SHAPE THAT BROKE IT
// ---------------------------------------------------------------------------
//
// A leading space on the first record is the whole bug. If this passes, the
// class of fault is gone.
eq(changedFiles(' M lib/build-info.ts\0'),
   ['lib/build-info.ts'],
   'an unstaged change keeps the first letter of its path');

eq(changedFiles(' M lib/build-info.ts\0 M tests/a.mjs\0 M tests/b.mjs\0'),
   ['lib/build-info.ts', 'tests/a.mjs', 'tests/b.mjs'],
   'and so does every later one');

// ---------------------------------------------------------------------------
// 2. THE OTHER STATUS SHAPES GIT ACTUALLY EMITS
// ---------------------------------------------------------------------------
eq(changedFiles('M  a.ts\0'), ['a.ts'], 'a staged change');
eq(changedFiles('MM a.ts\0'), ['a.ts'], 'staged and then edited again');
eq(changedFiles('?? scripts/new.mjs\0'), ['scripts/new.mjs'], 'an untracked file');
eq(changedFiles(' D gone.ts\0'), ['gone.ts'], 'a deletion');
eq(changedFiles('A  added.ts\0'), ['added.ts'], 'an addition');

// A RENAME EMITS TWO RECORDS: the new path, then the old one. Taking both would
// hand `git add` a path that no longer exists, which is the same failure this
// file is named after, arriving by a different route.
eq(changedFiles('R  new.ts\0old.ts\0'), ['new.ts'], 'a rename gives the new path');
eq(changedFiles('C  copy.ts\0source.ts\0'), ['copy.ts'], 'and a copy the same way');
eq(changedFiles('R  new.ts\0old.ts\0 M after.ts\0'),
   ['new.ts', 'after.ts'],
   'and the record after a rename is not swallowed');

eq(changedFiles(''), [], 'a clean tree is empty rather than a list of nothing');

// ---------------------------------------------------------------------------
// 3. -z, NOT NEWLINES
// ---------------------------------------------------------------------------
//
// With newlines git QUOTES any path containing a space or a non-ASCII character
// -- `"my file.ts"` -- and the quotes would travel into `git add`. `-z` turns
// that off. This checks the caller actually asks for it, because the parser
// being right is no help if it is fed the other format.
{
  const ship = read('scripts/ship.mjs');
  ok(/changedFiles\(gitRaw\('status', '--porcelain', '-z'\)\)/.test(ship),
     'ship asks git for null-separated records');
  ok(!/git\('status', '--porcelain'\)/.test(ship),
     'and never through the helper that trims, which is what caused this');

  eq(changedFiles(' M my file.ts\0'), ['my file.ts'],
     'so a path with a space arrives unquoted and intact');
}

// ---------------------------------------------------------------------------
// 4. THE STAMP IS STILL SEPARATED BY EXACT MATCH
// ---------------------------------------------------------------------------
//
// The whole reason the damaged path mattered: `lib/build-info.ts` is filtered
// out of the feature commit and committed on its own. A path off by one
// character silently fails that comparison too, so it would have been swept
// into the feature commit rather than merely failing loudly.
{
  const ship = read('scripts/ship.mjs');
  ok(/const source = changed\.filter\(\(f\) => f !== STAMP\)/.test(ship),
     'the stamp is separated from the feature by an exact path match');
  const parsed = changedFiles(' M lib/build-info.ts\0 M supabase/functions/invite/email.ts\0');
  ok(parsed.includes('lib/build-info.ts'),
     'and the parser produces a path that comparison can actually match');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
