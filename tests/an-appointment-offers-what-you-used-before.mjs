// An appointment offers the places and links you have used before.
//
// ---------------------------------------------------------------------------
// ASKED FOR AS: "Can we have a drop down of places like Google earth can do
// for the users, there is a prediction of places while typing... Same with
// online call, it will have some save files of links so that users can just
// click it right away."
//
// THE LINK HALF IS EXACTLY THAT. The places half was first deliberately NOT a
// search service: predictions from one would mean every partial address a
// Guide types about meeting an Explorer -- sometimes a minor, sometimes at
// their home -- leaving for a third party AS THEY TYPE.
//
// ON 26 SEPTEMBER 2026 THE CHURCH DECIDED OTHERWISE, and asked plainly: "I
// need to see the destination name, like auto name in google search, then just
// click or tap it to secure the location." What was built is the version that
// sends the least, and this file now holds THAT promise instead:
//
//   * the browser never talks to a search service -- it asks the church's own
//     server (supabase/functions/places), so a member's internet address, name
//     and account never go with the words;
//   * the Content-Security-Policy still names no lookup service;
//   * the history still comes first, costs nothing and sends nothing.
//
// tests/place-search.mjs holds the search itself.
//
// TWO PROPERTIES WORTH PINNING:
//
//   1. It reads the meetings ALREADY on the screen. No second query, nothing
//      new stored, and no way to surface a place from a pairing somebody cannot
//      already see -- those rows arrived through the same policy as the list.
//   2. It is filtered BY MODE. Without that, a Zoom link is offered as a place
//      to meet and an address as a link to join, which is worse than nothing
//      because both look like an answer.
//
//   node tests/an-appointment-offers-what-you-used-before.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const page = strip(read('components/LiveMeetings.tsx'));

// Both fields, not just the one that was easy. The link field through the
// browser's own list; the place field through the place box, which puts the
// places met before at the top of its suggestions.
const lists = (page.match(/list="appointment-history"/g) ?? []).length;
ok(lists === 1 && /<datalist id="appointment-history">/.test(page),
   'the link field offers the links used before');
ok(/<PlaceSearch[\s\S]{0,200}history=\{history\}/.test(page),
   'and the place field offers the places met before');

// The history itself.
const src = /const history = useMemo\(([\s\S]*?)\n  \}, \[rows, mode\]\);/.exec(page);
ok(!!src, 'the history is built from the meetings already loaded');
const body = src ? src[1] : '';

ok(/m\.mode !== mode/.test(body),
   'filtered by mode, so a link is never offered as a place to meet');
ok(/seen\.has\(key\)/.test(body) && /toLowerCase\(\)/.test(body),
   'the same place twice is offered once');
ok(/starts_at/.test(body),
   'most recent first, because the last place used is the likeliest next one');

// THE DECISION, AS IT NOW STANDS. The browser asks the church's own server and
// nothing else; no search service's address appears in anything a browser runs.
const whole = read('components/LiveMeetings.tsx');
const box = read('components/PlaceSearch.tsx');
for (const [file, src] of [['LiveMeetings', whole], ['PlaceSearch', box], ['the data layer', read('lib/live/data.ts')]]) {
  ok(!/googleapis|nominatim|mapbox|photon|komoot/i.test(src),
     `${file} names no search service -- the browser never talks to one`);
}
ok(/functions\.invoke\('places'/.test(read('lib/live/data.ts')),
   'the search goes through the church\'s own places function');

// The CSP guardrail is the other half of that promise, so it must still be
// there to be read: a connect-src that admits a places API would pass every
// check above while breaking the reason for them.
const conf = read('next.config.mjs');
ok(/connect-src/.test(conf) && !/googleapis|photon|komoot|nominatim|mapbox/i.test(conf),
   'the connect-src still names no lookup service');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
