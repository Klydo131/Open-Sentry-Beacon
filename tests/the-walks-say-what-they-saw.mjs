// A browser walk that fails says, in words, what the browser saw.
//
// ---------------------------------------------------------------------------
// WHY. The Safari walks run on a Mac in CI and kept only screenshots when one
// failed, uploaded as an artifact that nobody working in a sandbox can open. For
// a week an Explorer's page failed to open on WebKit, and the log said which
// check went red and nothing about why.
//
// tests/e2e/_playwright.js now watches every page a walk opens, through the one
// place every walk gets its browser, and prints the last things it saw (pages,
// what the page threw, console errors, failed requests) when the walk exits with
// a failure. Proven by hand on 30 September 2026 with a walk that failed on
// purpose after a thrown error and a refused request: the log named both. This
// holds the wiring, so it cannot quietly come undone.
//
//   node tests/the-walks-say-what-they-saw.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = stripTs(fs.readFileSync(path.join(root, 'tests/e2e/_playwright.js'), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

ok(/engine\.launch = async \(\.\.\.args\) => watchBrowser\(await launch\(\.\.\.args\)\)/.test(helper)
   && /engine\.launchPersistentContext = async \(\.\.\.args\) => watchContext\(await persistent\(\.\.\.args\)\)/.test(helper),
   'every way a walk gets a browser is watched (launch and launchPersistentContext)');
ok(/browser\.newContext = async/.test(helper) && /browser\.newPage = async/.test(helper) && /context\.on\('page', watchPage\)/.test(helper),
   'and every page opened in it, however it was opened');
for (const [event, what] of [
  ['framenavigated', 'the pages it went to'],
  ['pageerror', 'what the page threw'],
  ['console', 'console errors'],
  ['requestfailed', 'requests that failed'],
]) {
  ok(new RegExp(`page\\.on\\('${event}'`).test(helper), `it records ${what}`);
}
ok(/process\.on\('exit', \(code\) => \{\s*if \(code === 0 \|\| TRAIL\.length === 0\) return;/.test(helper),
   'and prints them only when the walk fails, so a green run is as quiet as before');
ok(/TRAIL\.length > TRAIL_MAX\) TRAIL\.shift\(\)/.test(helper),
   'keeping the last few dozen events, not the whole run');
ok(/if \(isCancelledPrefetch\(err\)\) return;/.test(helper) && /cancelledPrefetch\(req\.url\(\), why\)/.test(helper),
   'leaving out the prefetches Next.js cancels, which would fill it with noise');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
