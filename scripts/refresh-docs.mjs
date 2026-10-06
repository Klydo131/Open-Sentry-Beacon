// Every picture and every printed guide, in one command.
//
//   npm run docs:refresh               build, then every picture and every PDF
//   npm run docs:refresh -- --no-build  use the build already in .next
//   npm run docs:refresh -- --pictures  pictures only, no PDFs
//
// WHY ONE COMMAND. Until 6 October 2026 a new edition was eight commands run by
// hand in the right order against a server started by hand: four picture
// scripts (the README, the setup guide, the illustrated walkthrough, the
// complete guides in three parts), the reference appendices, the two complete
// guides, and the two printed manuals, which were then copied by hand from
// docs/handbook/pdf/ to the names the README links to. That last step was
// written down nowhere. A church that copies this app, or a developer who
// changes a screen, should be able to bring every picture and every guide up to
// date without knowing any of that.
//
// What it runs, and where each lands:
//
//   scripts/screenshots.mjs           docs/screenshots/*.png       README
//   scripts/guide-shots.mjs           docs/screenshots/guide/      setup guide
//   scripts/walkthrough-shots.mjs     docs/screenshots/walkthrough/ HOW-TO-USE, HANDBOOK
//   scripts/complete-guide-shots.mjs  docs/screenshots/complete/   complete guides
//   docs/guides/build-reference.mjs   docs/guides/building/generated/
//   docs/guides/build-guides.mjs      docs/Hope-Beacon-Complete-Guide-*.pdf
//   docs/handbook/build-pdf.js        docs/Hope-Beacon-Handbook.pdf, docs/Hope-Beacon-How-To-Use.pdf
//
// Sample people only: the app is started with no database, so no picture can
// show a real member. Look at the pictures before committing them anyway, and
// search the PDFs' text for anything that must not be public (docs/guides/README.md).

import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const printing = !args.includes('--pictures');
// Three browsers at once: on a four-core machine more than that makes pages
// slow enough to be photographed half drawn.
const JOBS = 3;

const run = (label, cmd, cmdArgs) => new Promise((resolve, reject) => {
  const started = Date.now();
  const child = spawn(cmd, cmdArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  const keep = (d) => { tail = (tail + d).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('close', (code) => {
    const secs = Math.round((Date.now() - started) / 1000);
    if (code === 0) { console.log(`  done  ${label} (${secs}s)`); resolve(); }
    else { console.log(`  FAIL  ${label} (exit ${code})\n${tail}`); reject(new Error(`${label} failed`)); }
  });
});

/** Run `tasks` (functions returning promises) at most `n` at a time; every failure is collected. */
async function pool(tasks, n) {
  const failures = [];
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task().catch((e) => failures.push(e.message));
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return failures;
}

const freePort = () => new Promise((resolve) => {
  const s = createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function waitFor(url, seconds = 90) {
  for (let i = 0; i < seconds; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`the app did not answer at ${url}`);
}

let server;
const failures = [];
try {
  if (build) {
    console.log('Building the app');
    await run('build', 'npm', ['run', 'build']);
  } else if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
    throw new Error('--no-build, but there is no build in .next: run without it');
  }

  const port = String(await freePort());
  console.log(`Serving it on port ${port}`);
  server = spawn('node', ['scripts/run-next.mjs', 'start', '-p', port], { cwd: root, stdio: 'ignore' });
  await waitFor(`http://localhost:${port}/login`);

  console.log(`Taking every picture, ${JOBS} at a time`);
  failures.push(...await pool([
    () => run('complete guides: phone', 'node', ['scripts/complete-guide-shots.mjs', port, 'phone']),
    () => run('complete guides: computer', 'node', ['scripts/complete-guide-shots.mjs', port, 'computer']),
    () => run('complete guides: extras', 'node', ['scripts/complete-guide-shots.mjs', port, 'extras']),
    () => run('walkthrough (HOW-TO-USE, HANDBOOK)', 'node', ['scripts/walkthrough-shots.mjs', port]),
    () => run('README', 'node', ['scripts/screenshots.mjs', port]),
    () => run('setup guide', 'node', ['scripts/guide-shots.mjs', port]),
  ], JOBS));
} finally {
  if (server) server.kill();
  // The build stamps lib/build-info.ts; a picture run is not a release.
  if (build) { try { execFileSync('git', ['checkout', '--', 'lib/build-info.ts'], { cwd: root }); } catch { /* not a git checkout */ } }
}

if (printing && !failures.length) {
  console.log('Printing');
  await run('reference appendices', 'node', ['docs/guides/build-reference.mjs']);
  await run('complete guides (both PDFs)', 'node', ['docs/guides/build-guides.mjs']);
  await run('HANDBOOK and HOW-TO-USE', 'node', ['docs/handbook/build-pdf.js', 'HANDBOOK.md', 'HOW-TO-USE.md']);
  // The builder names its output after the repository; the README links to these.
  for (const [from, to] of [['HANDBOOK', 'Hope-Beacon-Handbook'], ['HOW-TO-USE', 'Hope-Beacon-How-To-Use']]) {
    copyFileSync(join(root, 'docs/handbook/pdf', `Open-Sentry-Beacon-${from}.pdf`), join(root, 'docs', `${to}.pdf`));
  }
}

if (failures.length) {
  console.log(`\n${failures.length} step(s) failed: ${failures.join('; ')}. Nothing was printed.`);
  process.exit(1);
}
console.log('\nEvery picture and guide is up to date. Look at the pictures before committing (git status shows which changed).');
