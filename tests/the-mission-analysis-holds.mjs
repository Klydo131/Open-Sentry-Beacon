// The analysis under the Mission pulse holds: the statistics are right, they
// refuse to speak with too little data, and no name or id leaves.
//
// lib/mission-analysis.ts turns each journey into a numbered row and asks five
// questions of the rows with Spearman's rank correlation. This checks the
// arithmetic against values worked by hand, a made-up church built with a
// known link in it, and the refusals (too few journeys, every value equal,
// meetings a leader may not see).
//
//   node tests/the-mission-analysis-holds.mjs
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

let an; let mp;
try {
  an = await import(pathToFileURL(path.join(root, 'lib/mission-analysis.ts')).href);
  mp = await import(pathToFileURL(path.join(root, 'lib/mission-pulse.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.ANALYSIS_RETRY === '1') { console.error(`BAD could not load the analysis: ${err && err.message}`); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, ANALYSIS_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { ranks, spearman, pearson, strength, chanceLine, journeyRows, findings, countTable, toCsv, MIN_N } = an;
const { missionPulse, DAY } = mp;
const close = (a, b, e = 1e-9) => a !== null && Math.abs(a - b) < e;

// ---- 1. The statistics, against values worked by hand -----------------------
ok(ranks([10, 20, 20, 30]).join() === '1,2.5,2.5,4', 'tied values share the average rank');
ok(close(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1), 'a perfect rising order is +1');
ok(close(spearman([1, 2, 3, 4, 5], [9, 7, 5, 3, 1]), -1), 'a perfect falling order is -1');
ok(close(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]), 1) && pearson([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]) < 1, 'rank correlation sees a curve that only rises as perfect; plain correlation does not');
// Hand-worked: x = 1..5, y = 2,1,4,3,5 -> d = -1,1,-1,1,0, sum d^2 = 4, rho = 1 - 6*4/(5*24) = 0.8
ok(close(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8), 'a worked example gives 0.8 exactly');
ok(spearman([1, 2, 3], [5, 5, 5]) === null, 'a flat column has no correlation, not a zero');
ok(strength(0.05) === 'none' && strength(-0.2) === 'weak' && strength(0.4) === 'moderate' && strength(-0.7) === 'strong', 'strength is named in words, either sign');
ok(close(chanceLine(10), 1.96 / 3) && chanceLine(101) < chanceLine(10), 'the chance line shrinks as journeys grow');

// ---- 2. A made-up church with a known link ----------------------------------
// Twelve active journeys. The longer an Explorer waited for a Guide, the fewer
// steps the journey has taken: a falling link the analysis must find.
const NOW = Date.UTC(2026, 10, 15, 12);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const members = []; const pairings = []; const moves = []; const journeyMeetings = [];
const STAGES = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];
for (let i = 0; i < 12; i += 1) {
  const wait = i * 3;                 // 0, 3, 6 ... 33 days
  const steps = Math.max(0, 4 - Math.floor(i / 3)); // 4,4,4,3,3,3,2,2,2,1,1,1
  members.push({ id: `explorer-secret-${i}`, role: 'ds', approved: true, joinedAt: ago(120 + wait) });
  pairings.push({ id: `pairing-secret-${i}`, dsId: `explorer-secret-${i}`, dmId: `guide-secret-${i % 3}`, track: i % 2 ? 'digital' : 'traditional', stage: STAGES[steps], status: 'active', createdAt: ago(120) });
  for (let s = 0; s < steps; s += 1) moves.push({ pairingId: `pairing-secret-${i}`, from: STAGES[s], to: STAGES[s + 1], at: ago(100 - s * 10) });
  for (let m = 0; m < steps + 1; m += 1) journeyMeetings.push({ pairingId: `pairing-secret-${i}`, done: true });
}
const input = { now: NOW, members, pairings, moves, journeyMeetings, meetings: [], requests: [], invites: [], feedback: [], activity: [] };
const rows = journeyRows(input);
ok(rows.length === 12 && rows[4].waitDays === 12 && rows[4].steps === 3, 'each journey becomes a numbered row with its wait and steps');
ok(rows[0].pace === 1, `pace is steps per month of the journey (4 steps in 120 days = ${rows[0].pace})`);
ok(rows.every((r) => r.guideLoad === 4), 'each Guide carries four journeys');
const f = Object.fromEntries(findings(rows).map((x) => [x.key, x]));
ok(f.wait.r !== null && f.wait.r < -0.9 && f.wait.strength === 'strong' && f.wait.likelyReal, `the built-in link is found: waiting longer goes with slower journeys (r = ${f.wait.r})`);
ok(/moving more slowly/.test(f.wait.reading), 'and it is read out in plain words');
ok(f.meetings.r !== null && f.meetings.r > 0.9, `more meetings go with further stages here (r = ${f.meetings.r})`);
ok(f.load.r === null && f.load.missing === 'flat', 'when every Guide carries the same number there is nothing to compare, and it says so');
ok(f.track.r !== null && f.track.strength === 'none' || !f.track.likelyReal, 'digital against in person, built with no link, is not called real');
const csv = toCsv(['Journey', 'Wait'], rows.map((r) => [r.n, r.waitDays]));
ok(!/secret/.test(JSON.stringify(rows)) && !/secret/.test(JSON.stringify(findings(rows))) && !/secret/.test(csv), 'no name or id leaves: rows, findings and the CSV are numbered');

// ---- 3. Refusals --------------------------------------------------------------
const few = findings(journeyRows({ ...input, pairings: pairings.slice(0, MIN_N - 1) }));
ok(few.every((x) => x.r === null) && /at least 8/.test(few[0].reading), `with fewer than ${MIN_N} journeys nothing is claimed`);
const hidden = Object.fromEntries(findings(journeyRows({ ...input, journeyMeetings: null })).map((x) => [x.key, x]));
ok(hidden.meetings.r === null && /private/.test(hidden.meetings.reading), 'when meetings are private to the pair, that question says why it cannot be answered');
ok(toCsv(['a'], [['=HYPERLINK("x")'], ['+1'], ['plain']]).split('\r\n')[1].startsWith('"='), 'a cell that a spreadsheet would run as a formula is quoted');

// ---- 4. The raw counts agree with the pulse ----------------------------------
const pulse = missionPulse(input, 90);
const table = countTable(input, 90);
const sum = (k) => table.reduce((n, r) => n + r[k], 0);
ok(sum('steps') === pulse.steps.now && sum('pairings') === pulse.newPairings.now, `the raw table adds up to the tiles (${sum('steps')} steps, ${sum('pairings')} pairings in 90 days)`);
ok(table.length === 13, 'ninety days is shown in thirteen rows');

console.log(bad ? `\n${bad} problem(s).` : '\nThe mission analysis holds.');
process.exit(bad ? 1 : 0);
