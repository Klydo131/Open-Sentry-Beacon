// An appointment offers the places and links you have used before.
//
// ---------------------------------------------------------------------------
// ASKED FOR AS: "Can we have a drop down of places like Google earth can do
// for the users, there is a prediction of places while typing... Same with
// online call, it will have some save files of links so that users can just
// click it right away."
//
// THE LINK HALF IS EXACTLY THAT. The places half deliberately is NOT a search
// service, and this file is where that decision is held rather than left to
// memory. Predictions from one would mean every partial address a Guide types
// about meeting an Explorer -- sometimes a minor, sometimes at their home --
// leaving for a third party AS THEY TYPE. It would need a billed key in the
// browser, a new origin in a connect-src built to refuse them, and a fourth
// name in a privacy notice that lists three. That is a decision about members'
// data and it belongs to the church, not to a convenience.
//
// What is here instead costs nothing and covers what recurs: a church meets at
// the hall, that one cafe, somebody's front room, and calls on the same room
// every week.
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

// Both fields, not just the one that was easy.
const lists = (page.match(/list="appointment-history"/g) ?? []).length;
ok(lists === 2, `both the place and the link field offer the history (${lists} of 2)`);
ok(/<datalist id="appointment-history">/.test(page),
   'and there is a list for them to draw from');

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

// THE DECISION. No third-party lookup crept in beside it.
const whole = read('components/LiveMeetings.tsx');
ok(!/googleapis|places\.googleapis|nominatim|mapbox|autocomplete\?/i.test(whole),
   'and nothing is sent to a search service to do it');

// The CSP guardrail is the other half of that promise, so it must still be
// there to be read: a connect-src that admits a places API would pass every
// check above while breaking the reason for them.
const conf = read('next.config.mjs');
ok(/connect-src/.test(conf) && !/googleapis/.test(conf),
   'the connect-src still names no lookup service');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
