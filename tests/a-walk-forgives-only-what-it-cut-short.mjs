// A walk forgives a request only when its own next page load cut it short.
//
// ---------------------------------------------------------------------------
// WHY. About 1.5 seconds after every page load the app checks for a new
// release (/version.json, then the browser's re-check of /sw.js). A walk that
// moves to its next page at that moment cancels both; WebKit reports each as
// "Cannot load ... due to access control checks", and Playwright calls it a
// page error. That failed fresh-looks on three of five Safari runs (3 and 4
// October 2026). tests/e2e/_playwright.js has the rule, pageErrors().
//
// Only WebKit produces the message, so this drives the rule with a pretend
// page and a pretend clock instead of a browser.
//
//   node tests/a-walk-forgives-only-what-it-cut-short.mjs
// ---------------------------------------------------------------------------
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { pageErrors, CUT_SHORT_MS } = require(path.join(root, 'tests/e2e/_playwright.js'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The messages exactly as the Safari logs recorded them.
const SW = 'Cannot load http: /localhost:49222/sw.js?v=6fb22e2e2ffb due to access control checks.';
const VERSION = 'Fetch API cannot load http: /localhost:49226/version.json?t=1791067355178 due to access control checks.';
const PREFETCH = 'Fetch API cannot load http: /localhost:49222/settings?_rsc=b6vwr0yuyl3KIOiD due to access control checks.';
const ELSEWHERE = 'Cannot load https://example.org/sw.js due to access control checks.';
const REAL_ERROR = "TypeError: undefined is not an object (evaluating 'a.b')";

// A pretend page: it can throw, wait and navigate, and it keeps its own clock.
function pretendPage() {
  const page = new EventEmitter();
  const mainFrame = {};
  page.mainFrame = () => mainFrame;
  let clock = 0;
  const errors = pageErrors(page, () => clock);
  return {
    errors,
    threw: (message) => page.emit('pageerror', new Error(message)),
    wait: (ms) => { clock += ms; },
    navigate: () => page.emit('framenavigated', mainFrame),
    navigateEmbeddedFrame: () => page.emit('framenavigated', {}),
  };
}

// What happens to the page, in order, and how many errors the walk should be
// left with.
const CASES = [
  {
    name: 'sw.js cut short, then the next page load 32ms later: forgiven',
    steps: (p) => { p.threw(SW); p.wait(32); p.navigate(); },
    errors: 0,
  },
  {
    name: 'the release check pair, then the next page load 131ms later: both forgiven',
    steps: (p) => { p.threw(VERSION); p.threw(SW); p.wait(131); p.navigate(); },
    errors: 0,
  },
  {
    name: 'the same words with no page load after them: counted',
    steps: (p) => { p.threw(SW); },
    errors: 1,
  },
  {
    name: `a page load ${CUT_SHORT_MS + 300}ms later did not cut it short: counted`,
    steps: (p) => { p.threw(SW); p.wait(CUT_SHORT_MS + 300); p.navigate(); },
    errors: 1,
  },
  {
    name: 'an embedded frame moving is not the page moving: counted',
    steps: (p) => { p.threw(SW); p.wait(20); p.navigateEmbeddedFrame(); },
    errors: 1,
  },
  {
    name: 'the same words for another address: counted',
    steps: (p) => { p.threw(ELSEWHERE); p.wait(20); p.navigate(); },
    errors: 1,
  },
  {
    name: 'any other error, page load or not: counted',
    steps: (p) => { p.threw(REAL_ERROR); p.wait(20); p.navigate(); },
    errors: 1,
  },
  {
    name: 'forgiving one does not forgive the next one',
    steps: (p) => { p.threw(SW); p.wait(20); p.navigate(); p.wait(2000); p.threw(SW); },
    errors: 1,
  },
  {
    name: 'a cancelled prefetch is still forgiven as before, page load or not',
    steps: (p) => { p.threw(PREFETCH); },
    errors: 0,
  },
];

for (const { name, steps, errors } of CASES) {
  const page = pretendPage();
  steps(page);
  ok(page.errors.list().length === errors, name);
}

// And the walk it was written for uses it.
const walk = fs.readFileSync(path.join(root, 'tests/e2e/fresh-looks.js'), 'utf8');
ok(/const errors = pageErrors\(page\);/.test(walk) && /assert\.deepEqual\(errors\.list\(\), \[\]/.test(walk),
   'fresh-looks asserts on the rule, not on a list of its own');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
