// Do the tests run anywhere, or only on the machine that wrote them?
//
// Three separate portability bugs were committed into these suites before this
// check existed, and none of them failed loudly:
//
//   • `require('/opt/node22/lib/node_modules/playwright')` — an absolute path
//     to one sandbox, in a committed test.
//   • `const OUT = '/tmp/claude-0/-home-user/<session-id>/scratchpad'` — six
//     files writing screenshots into a directory that exists for one session.
//   • `const BASE = 'http://localhost:4002'` — a hardcoded port, so running the
//     suite against a server anywhere else failed with a connection error that
//     reads exactly like a broken app rather than a broken test.
//
// That last one wasted real time twice: the failure looks like the product is
// down. A test that cannot run on a second machine is not a safety net, it is a
// decoration, and CI is the second machine.
//
// This is a lint, not a test run — it never starts a browser, so it costs
// nothing and can gate every push.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (m) => console.log(`OK   ${m}`);
const fail = (m) => {
  bad++;
  console.log(`FAIL ${m}`);
};

const e2eDir = path.join(root, 'tests/e2e');
if (!fs.existsSync(e2eDir)) {
  console.log('OK   no e2e directory in this repo');
  process.exit(0);
}

const suites = fs
  .readdirSync(e2eDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'));

const problems = {
  'an absolute path into node_modules': /require\(\s*['"]\/[^'"]*node_modules[^'"]*['"]\s*\)/,
  'a session-specific scratchpad path': /['"]\/tmp\/claude-[^'"]*['"]/,
  'a hardcoded browser executable': /['"]\/opt\/pw-browsers\/[^'"]*['"]/,
  'a hardcoded home directory': /['"]\/home\/[a-z]+\/[^'"]*['"]/,
};

for (const [label, pattern] of Object.entries(problems)) {
  const hits = suites.filter((f) =>
    pattern.test(fs.readFileSync(path.join(e2eDir, f), 'utf8')),
  );
  hits.length
    ? fail(`${label} in: ${hits.join(', ')}`)
    : ok(`no suite carries ${label}`);
}

// A hardcoded port is only a problem when nothing can override it. Suites are
// run as `node tests/e2e/<suite>.js <port>`, so the port must come from argv
// with the literal as a fallback at most.
const portOffenders = suites.filter((f) => {
  const src = fs.readFileSync(path.join(e2eDir, f), 'utf8');
  const usesLiteralPort = /(localhost|127\.0\.0\.1):\d+/.test(src);
  if (!usesLiteralPort) return false;
  return !/process\.argv\[2\]/.test(src);
});
portOffenders.length
  ? fail(
      `suites with a hardcoded port and no argv override: ${portOffenders.join(', ')} ` +
        '— they will fail against any other server and it looks like an outage',
    )
  : ok('every suite takes its port from the command line');

// Every suite must exit non-zero when it fails, or the runner reports a pass.
// This is the failure mode that makes a whole suite decorative.
const silent = suites.filter((f) => {
  const src = fs.readFileSync(path.join(e2eDir, f), 'utf8');
  return !/process\.exit\(/.test(src);
});
silent.length
  ? fail(`suites that never call process.exit: ${silent.join(', ')} — a failure would report as a pass`)
  : ok(`all ${suites.length} suites signal failure through their exit code`);

// ---------------------------------------------------------------------------
// Nothing may depend on a Unix shell.
// ---------------------------------------------------------------------------
// "Runs anywhere" is what this file is for, and it was only checking ports and
// exit codes. Two suites had been RED ON EVERY WINDOWS RUN for months and
// nobody looked, because the failure lived in CI and the summary line everybody
// reads is printed on Linux.
//
//   tests/plain-words.mjs   ran `find app components ... -name '*.ts'`. On
//     Windows `find` is a different command that searches for TEXT INSIDE
//     files. It matched nothing, the suite read ZERO files, and its three real
//     rules then reported "0 found" and PASSED. Green, and checking nothing.
//   tests/ios-install.mjs   ran `spawn('npx', ...)`. npx is npx.cmd on Windows
//     and spawn without a shell cannot find it: ENOENT, every time.
//
// Both had a portable answer already in the repository. scripts/run-next.mjs
// resolves Next's own CLI and runs it under this same Node, needing no shell at
// all, and Node walks a directory tree perfectly well by itself.
{
  const everywhere = [
    ...fs.readdirSync(path.join(root, 'tests')).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => path.join('tests', f)),
    ...fs.readdirSync(e2eDir).map((f) => path.join('tests', 'e2e', f)),
    ...fs.readdirSync(path.join(root, 'scripts')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join('scripts', f)),
  ];

  // Commands that either do not exist on Windows or mean something else there.
  const UNIX_ONLY = /\b(execSync|exec|spawnSync|spawn)\(\s*[`'"]\s*(find|grep|sed|awk|ls|rm|cp|mv|cat|which|xargs|chmod)\b/;
  // npm and npx are .cmd files on Windows: spawn cannot find them without a
  // shell. `shell: true`, or resolving the real binary, both fix it.
  const BARE_NPM = /\bspawn(Sync)?\(\s*[`'"](npm|npx|yarn|pnpm)[`'"]/;

  const offenders = [];
  for (const rel of everywhere) {
    let src;
    try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    const shipped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (UNIX_ONLY.test(shipped)) offenders.push(`${rel} (a Unix-only command)`);
    // Look for a `shell:` option in the CALL, not a literal `true`. The first
    // version of this rule demanded `shell: true` and reported dev-server.mjs,
    // which passes `shell: NEEDS_SHELL` and is correct. A rule that flags
    // working code gets switched off, and then it protects nothing.
    const call = shipped.match(BARE_NPM);
    if (call && !/shell\s*:/.test(shipped.slice(call.index, call.index + 400))) {
      offenders.push(`${rel} (spawns npm/npx with no shell, which is ENOENT on Windows)`);
    }
  }
  offenders.length
    ? fail(`these cannot run on Windows:\n    ${offenders.join('\n    ')}`)
    : ok(`no test or script depends on a Unix shell (${everywhere.length} checked)`);
}

// A GENERATED `import` SPECIFIER IS A URL, NOT A PATH, and on POSIX those are
// indistinguishable so the mistake is invisible on the machine that makes it.
//
// tests/a-page-can-be-tagged-and-dated.mjs bundled a module to a temporary
// directory and wrote a driver that imported it by its absolute path. On Linux
// and macOS that is `/tmp/...` and resolves. On Windows it is
// `C:\Users\...`, and Node reads the drive letter as a URL scheme:
// ERR_UNSUPPORTED_ESM_URL_SCHEME, "Received protocol 'c:'", thrown before a
// single assertion runs. `pathToFileURL(p).href` is correct on every platform
// and costs nothing on the two where the bare path happened to work.
//
// This rule exists because the check above it -- the one about Unix-only
// commands -- was already asking the right question and had no way to see this
// particular answer.
{
  const offenders = [];
  // `from ${...}` inside a template literal: a module specifier being built at
  // runtime. Anything already converted to a URL is fine, and so is a bare
  // package name; what is not fine is handing it a path.
  const GENERATED_IMPORT = /\bfrom\s+\$\{([^}]*)\}/g;
  // Same list as the Windows-shell rule above, rebuilt because that one keeps
  // it in its own block.
  const scanned = [
    ...fs.readdirSync(path.join(root, 'tests')).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => path.join('tests', f)),
    ...fs.readdirSync(e2eDir).map((f) => path.join('tests', 'e2e', f)),
    ...fs.readdirSync(path.join(root, 'scripts')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join('scripts', f)),
  ];
  for (const rel of scanned) {
    // Comments out first. The first version of this rule reported ITSELF,
    // because the paragraph above spells the pattern out in prose and a
    // comment is still text.
    const src = stripTs(fs.readFileSync(path.join(root, rel), 'utf8'));
    for (const [n, line] of src.split('\n').entries()) {
      for (const m of line.matchAll(GENERATED_IMPORT)) {
        const expr = m[1];
        if (!/FileURL|file:\/\//i.test(expr)) {
          offenders.push(`${rel}:${n + 1} (imports from \${${expr.trim()}}, a path on Windows)`);
        }
      }
    }
  }
  offenders.length
    ? fail(`these build an import specifier from a path:\n    ${offenders.join('\n    ')}`)
    : ok(`every generated import specifier is a file:// URL (${scanned.length} checked)`);
}

// A NOTE ON THE STRIPPER, BECAUSE THIS RULE IS WHY IT WAS FIXED.
//
// This was written reading the file line by line and skipping anything that
// looked like a comment, because tests/_strip.mjs did not work here: it had no
// notion of a regular expression, and the two rules above put a backtick
// inside a character class -- [`'"] . It read that backtick as the start of a
// template literal and never recovered, handing back the comments it was asked
// to remove. Fifty-one of this repository's source files were affected.
//
// The stripper understands regex literals now, so this uses it like everything
// else. The workaround is gone; the reason it existed is worth keeping.

console.log(
  bad === 0
    ? '\nRESULT: the suites run anywhere ✓'
    : `\nRESULT: ${bad} PORTABILITY PROBLEM(S)`,
);
process.exit(bad ? 1 : 0);
