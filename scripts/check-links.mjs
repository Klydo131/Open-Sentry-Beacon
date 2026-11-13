// Does every resource on the shelf still open?
//
// WHY THIS EXISTS. The starter kit is nineteen links to other people's websites.
// Nothing in this repository controls them. A publisher reorganises, a PDF moves,
// a ministry lets a domain lapse — and the church finds out when an Explorer taps
// a resource on their first day and gets a 404. That is the worst possible moment
// for it, and nothing else in the test suite would ever notice, because every
// other check reads the source rather than the internet.
//
// It could not be written to run where it was written: that sandbox has no route
// out, so `curl` to any of these hosts fails at the proxy. GitHub Actions does
// have a route out, which is why this runs there rather than in `npm run verify`.
//
//   node scripts/check-links.mjs
//
// WHAT COUNTS AS BROKEN, AND WHY THAT DISTINCTION IS THE WHOLE JOB.
//
// The first run of this checker called four links dead. Three of them open fine
// in a browser. `kingjamesbibleonline.org`, `adventistarchives.org` and
// `gcyouthministries.org` answer 403 to a request from a GitHub runner, and
// `hopetv.org` answered 429 after we had made nineteen requests in ten seconds.
// None of those is a wrong address. They are sites declining a robot, and one of
// them we provoked ourselves.
//
// A wrong address does not answer 403. It answers 404 or 410, or the hostname
// does not resolve, or nothing accepts the connection. Those are the failures
// this check exists to catch, and those are the only ones that turn the build
// red. Anything else is reported and passed, because a check that cries wolf at
// Cloudflare is a check people learn to click past — and the next time it goes
// red for a real 404, nobody will look.
//
// So: fail on DEAD, report REFUSED, and never invent a third meaning for either.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'lib/starter-kit.ts'), 'utf8');

const links = [...src.matchAll(/id:\s*'([^']+)',[\s\S]{0,600}?external_url:\s*\n?\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], url: m[2] }));

if (links.length === 0) {
  console.error('No links found in lib/starter-kit.ts — the parse is wrong, not the shelf.');
  process.exit(2);
}

const pause = (ms) => new Promise((go) => setTimeout(go, ms));

// Ask the way a phone would. Several of these publishers sit behind a bot filter
// that turns away anything without a browser's headers, and the church member
// tapping the link IS a browser — so asking as one is the honest test, not a
// trick. It is still truthfully identified in the comment header of this file
// and the request rate below is deliberately gentle.
const BROWSER = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// A live server that will not talk to a robot. Distinct from a wrong address.
const REFUSALS = new Set([401, 403, 405, 406, 409, 429, 503]);

export async function ask(url, method, extra = {}) {
  return fetch(url, {
    method,
    redirect: 'follow',
    headers: { ...BROWSER, ...extra },
    signal: AbortSignal.timeout(25000),
  });
}

// HEAD first: it is the polite request, and most of these are large PDFs there is
// no reason to download. Some servers refuse HEAD outright, so fall back to a
// ranged GET asking for one byte, and then to a plain GET for the servers that
// refuse Range too. Only after all three does a status get believed.
export async function reach(url) {
  let last = null;
  for (const attempt of [
    () => ask(url, 'HEAD'),
    () => ask(url, 'GET', { Range: 'bytes=0-0' }),
    () => ask(url, 'GET'),
  ]) {
    try {
      const res = await attempt();
      if (res.ok) return { verdict: 'OK', detail: res.status };
      last = res.status;
    } catch (cause) {
      last = cause?.name === 'TimeoutError' ? 'timed out' : String(cause?.message ?? cause);
      // A DNS failure or a refused connection will not be fixed by another verb.
      if (typeof last === 'string') break;
    }
  }
  if (typeof last === 'number' && REFUSALS.has(last)) {
    return { verdict: 'REFUSED', detail: last };
  }
  return { verdict: 'DEAD', detail: last };
}

// ONE MORE CHANCE FOR A SITE THAT DID NOT ANSWER AT ALL, and only for that.
//
// bibleinfo.com answered 200 on 21 September and timed out on the 28th, and the
// whole shelf went red for it. A timeout or a dropped connection says nothing
// about the address -- a busy server on a Monday morning looks the same -- so it
// is asked again after a pause. A status code is an answer and is believed the
// first time: a 404 is a wrong address however often it is asked, and a lapsed
// domain fails to resolve twice. So this can only ever turn a slow site green,
// never hide a wrong one.
export async function verdictFor(url, { once = reach, wait = 5000 } = {}) {
  const first = await once(url);
  if (first.verdict !== 'DEAD' || typeof first.detail === 'number') return first;
  await pause(wait);
  return once(url);
}

// Importing this file must not fire twenty requests at other people's servers,
// so the sweep runs only when the file is the thing that was executed. That is
// what lets `tests/dead-is-not-refused.mjs` exercise `reach` against a local
// server that answers 403 and 404 on demand — the classification above is the
// part that got it wrong last time, so it is the part with a test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await sweep();
}

async function sweep() {
console.log(`Checking ${links.length} links…\n`);

const dead = [];
const refused = [];
for (const link of links) {
  const { verdict, detail } = await verdictFor(link.url);
  console.log(`${verdict.padEnd(7)} ${link.id.padEnd(24)} ${detail}  ${link.url}`);
  if (verdict === 'DEAD') dead.push({ ...link, detail });
  if (verdict === 'REFUSED') refused.push({ ...link, detail });
  // One second between requests. Twenty links is nothing to a publisher spread
  // over twenty seconds, and it is how we earned a 429 the first time.
  await pause(1000);
}

if (refused.length) {
  console.log(`\n${refused.length} link(s) answered but would not serve a robot:\n`);
  for (const r of refused) console.log(`  ${r.id}  ${r.url}  (${r.detail})`);
  console.log('\nThese are not failures. The site is up; it declined an automated');
  console.log('request. Open one in a browser if you want to be sure.');
}

if (dead.length) {
  console.log(`\n${dead.length} of ${links.length} links are DEAD:\n`);
  for (const d of dead) console.log(`  ${d.id}  ${d.url}  (${d.detail})`);
  console.log('\nFix the address in lib/starter-kit.ts, or remove the resource.');
  process.exit(1);
}

console.log(
  `\nRESULT: no dead links. ${links.length - refused.length} of ${links.length} opened; ` +
    `${refused.length} declined a robot.`,
);
}
