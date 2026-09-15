#!/usr/bin/env node
// Gate, commit, push. One command, so the three cannot drift apart.
//
//   node scripts/ship.mjs <message-file>
//   node scripts/ship.mjs --dry-run <message-file>
//
// WHY THIS EXISTS, AND IT IS NOT TIDINESS.
//
// Shipping was a block of shell written fresh each time: run the gate, read the
// verdict, commit, push. Written fresh each time means wrong differently each
// time, and it produced two real faults in one afternoon.
//
//   ONE. TWO ARMED JOBS AT ONCE. A push job left running from an earlier change
//   was still alive when a second was started. Both watched the same tree and
//   both read the same message file off disk, so the first committed a source
//   change under a message written for something else, and the second committed
//   the build stamp under the same message again. The history ended up with two
//   commits, 27 minutes apart, carrying one sentence between them and neither
//   of them describing what it contained.
//
//   TWO. `git add -A` UNDER A FEATURE MESSAGE. The gate regenerates
//   lib/build-info.ts as a side effect of building, so a blanket add sweeps a
//   generated file into a commit about something else -- or, when the source
//   was already committed, produces a commit that is ONLY the stamp while still
//   claiming the feature's title.
//
// So: one lock, and the stamp is always its own commit with its own fixed
// message. Neither fault can be made by hand again, because there is no longer
// a hand-written version to get wrong.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles } from './lib/changed-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(root, '.git', 'beacon-ship.lock');

/** The generated file. Always its own commit, never the feature's. */
const STAMP = 'lib/build-info.ts';
const STAMP_MESSAGE = 'Stamp the build';

const TRAILERS = [
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_01CScYNmRgqxWRNGDZhznGKw',
].join('\n');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const messageFile = args.find((a) => !a.startsWith('--'));

const say = (s) => process.stdout.write(`${s}\n`);
const die = (s) => { process.stderr.write(`ship: ${s}\n`); release(); process.exit(1); };

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
/** The same, WITHOUT trimming. See `changedFiles` for why that matters. */
const gitRaw = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });



// ---------------------------------------------------------------------------
// The lock. One ship at a time, per checkout.
// ---------------------------------------------------------------------------
//
// A stale lock from a killed run would block every later ship, which is worse
// than the problem, so the pid is written down and a lock whose process is gone
// is cleared rather than obeyed.
function claim() {
  try {
    const held = fs.readFileSync(LOCK, 'utf8').trim();
    const pid = Number(held);
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { alive = false; }
    if (alive) {
      process.stderr.write(
        `ship: another ship is already running (pid ${pid}).\n`
        + '      Two at once is how a commit gets somebody else\'s message.\n',
      );
      process.exit(1);
    }
    say(`(clearing a stale lock from pid ${pid}, which is no longer running)`);
    fs.rmSync(LOCK, { force: true });
  } catch (e) {
    if (e && e.code !== 'ENOENT') throw e;
  }
  fs.writeFileSync(LOCK, String(process.pid));
}

function release() {
  try { fs.rmSync(LOCK, { force: true }); } catch { /* already gone */ }
}

// ---------------------------------------------------------------------------
if (!messageFile) die('usage: node scripts/ship.mjs [--dry-run] <message-file>');
if (!fs.existsSync(messageFile)) die(`no such message file: ${messageFile}`);

const subject = fs.readFileSync(messageFile, 'utf8').split('\n')[0].trim();
if (!subject) die('the message file has no subject line');
if (subject === STAMP_MESSAGE) {
  die(`"${STAMP_MESSAGE}" is reserved for the generated stamp; give this change its own subject`);
}

claim();
process.on('exit', release);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
  die(`on ${branch}. Beacon ships from main; Vercel builds Production from nothing else.`);
}

// ---------------------------------------------------------------------------
// The gate. Nothing is committed before it is green.
// ---------------------------------------------------------------------------
say('running the full gate...');
// `shell: true` because on Windows `npm` is a .cmd shim rather than an
// executable, and spawning it without a shell fails with ENOENT. The repo's
// own portability check enforces this, and it caught this script on its first
// real run -- which is a fair verdict on writing a shipping tool that could not
// itself have shipped from half the machines the CI matrix covers.
const gate = spawnSync('npm', ['run', 'verify:all'], {
  cwd: root, encoding: 'utf8', shell: true,
});
const log = `${gate.stdout ?? ''}${gate.stderr ?? ''}`;

const passed = /All \d+ checks passed/.exec(log);
const failures = (log.match(/^(BAD|FAIL)/gm) ?? []).length;

// THREE CONDITIONS, NOT ONE. A run can exit 0 having skipped suites, and a
// "checks passed" line can sit above failures printed by a later suite. Reading
// only one of the three is how a red tree gets pushed.
if (gate.status !== 0 || !passed || failures > 0) {
  process.stderr.write(log.split('\n').filter((l) => /^(BAD|FAIL)/.test(l)).slice(0, 20).join('\n'));
  die(`NOT GREEN — nothing committed (verdict: ${passed ? passed[0] : 'no pass line'}, `
      + `failures: ${failures}, exit: ${gate.status})`);
}
say(`${passed[0]} · 0 failures`);

// ---------------------------------------------------------------------------
// Two commits, deliberately.
// ---------------------------------------------------------------------------
const changed = changedFiles(gitRaw('status', '--porcelain', '-z'));
const source = changed.filter((f) => f !== STAMP);
const stamped = changed.includes(STAMP);

if (!source.length && !stamped) die('nothing to ship: the tree is clean');

if (dryRun) {
  say(`would commit ${source.length} file(s) as: ${subject}`);
  if (stamped) say(`would commit ${STAMP} separately as: ${STAMP_MESSAGE}`);
  say('would push to origin main');
  release();
  process.exit(0);
}

if (source.length) {
  // A DELETED PATH CANNOT BE `git add`ed, WITH OR WITHOUT -A.
  //
  // `git add -- <path>` resolves the pathspec against the working tree, and a
  // removed file is not there, so git exits "pathspec ... did not match any
  // files" and the whole ship dies -- after sitting through the entire gate,
  // because the add only happens once the gate is green. This tool could ship
  // any change except one that removed something, and nothing had removed
  // anything until a retired test suite.
  //
  // `-A` DOES NOT FIX IT, which was the first attempt: once the deletion is
  // staged the path is gone from the index as well as the disk, so there is
  // still nothing for the pathspec to match.
  //
  // So the two cases are separated. `git rm` is the command that stages a
  // removal, and `--ignore-unmatch` makes it a quiet success when the deletion
  // was already staged -- which it will be whenever somebody ran `git add -A`
  // by hand before shipping.
  const gone = source.filter((f) => !fs.existsSync(path.join(root, f)));
  const present = source.filter((f) => fs.existsSync(path.join(root, f)));
  if (present.length) {
    execFileSync('git', ['add', '--', ...present], { cwd: root });
  }
  if (gone.length) {
    execFileSync('git', ['rm', '-q', '--ignore-unmatch', '--', ...gone], { cwd: root });
  }
  execFileSync('git', ['commit', '-q', '-F', messageFile], { cwd: root });
  say(`committed ${source.length} file(s): ${subject}`);
}

if (stamped) {
  // Its own message, every time, written here rather than read from a file that
  // something else may have left lying about.
  execFileSync('git', ['add', '--', STAMP], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', `${STAMP_MESSAGE}\n\n${TRAILERS}`], { cwd: root });
  say(`committed ${STAMP}: ${STAMP_MESSAGE}`);
}

// ---------------------------------------------------------------------------
// The push, with the backoff the house rules ask for.
// ---------------------------------------------------------------------------
let pushed = false;
for (const wait of [0, 2, 4, 8, 16]) {
  if (wait) {
    say(`push failed; retrying in ${wait}s`);
    // NOT `sleep`, which is a Unix binary and does not exist on Windows. The
    // portability rule did not catch this one -- its list of forbidden commands
    // does not name `sleep` -- so it is fixed here on the same reasoning rather
    // than left because nothing complained.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait * 1000);
  }
  const p = spawnSync('git', ['push', '-u', 'origin', 'main'], { cwd: root, encoding: 'utf8' });
  if (p.status === 0) { pushed = true; break; }
  process.stderr.write(`${p.stderr ?? ''}`);
}
if (!pushed) die('could not push after five attempts');

say(`pushed · HEAD=${git('rev-parse', '--short', 'HEAD')} `
    + `origin=${git('rev-parse', '--short', 'origin/main')} `
    + `unpushed=${git('rev-list', '--count', 'origin/main..HEAD')}`);

// Pushing is not deploying, and saying so is the house rule.
say('pushed, build not observed — this sandbox cannot reach the deploy platform.');
release();
