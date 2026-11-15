// The Mission pulse adds up.
//
// The leaders' dashboard opens on lib/mission-pulse.ts: lead measures to act
// on (waiting for a Guide, unanswered requests, stalled journeys) and outcomes
// against the period before. Numbers a leader acts on must be right, so this
// feeds it a made-up church whose answers are known and checks each one, and
// that no name or id ever comes out.
//
//   node tests/the-mission-pulse-adds-up.mjs
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

let mp;
try {
  mp = await import(pathToFileURL(path.join(root, 'lib/mission-pulse.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.PULSE_RETRY === '1') { console.error(`BAD could not load lib/mission-pulse.ts: ${err && err.message}`); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, PULSE_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { missionPulse, measure, change, median, DAY } = mp;

const NOW = Date.UTC(2026, 10, 15, 12);
const ago = (d) => new Date(NOW - d * DAY).toISOString();

// A small church whose answers are known.
const input = {
  now: NOW,
  members: [
    { id: 'secret-e1', role: 'ds', approved: true, joinedAt: ago(2) },   // paired
    { id: 'secret-e2', role: 'ds', approved: true, joinedAt: ago(10) },  // waiting 10 days (overdue)
    { id: 'secret-e3', role: 'ds', approved: true, joinedAt: ago(1) },   // waiting 1 day
    { id: 'secret-e4', role: 'ds', approved: true, joinedAt: ago(40) },  // paired, joined in the period before
    { id: 'secret-e5', role: 'ds', approved: false, joinedAt: ago(3) },  // not approved: not counted as an Explorer
    { id: 'secret-g1', role: 'dm', approved: true, joinedAt: ago(100) },
  ],
  pairings: [
    { id: 'p1', dsId: 'secret-e1', stage: 'connect', status: 'active', createdAt: ago(2) },
    { id: 'p4', dsId: 'secret-e4', stage: 'care', status: 'active', createdAt: ago(40) },
    { id: 'p9', dsId: 'gone', stage: 'call', status: 'archived', createdAt: ago(200) },
  ],
  moves: [
    { pairingId: 'p1', from: 'create', to: 'connect', at: ago(1) },       // a step this period
    { pairingId: 'p4', from: 'connect', to: 'care', at: ago(35) },         // a step the period before; p4 now stalled
    { pairingId: 'p4', from: 'care', to: 'connect', at: ago(36) },         // a step BACK: never counted as a step
    { pairingId: 'p9', from: 'cultivate', to: 'commission', at: ago(5) },  // commissioned this period
  ],
  meetings: [
    { at: ago(3), done: true, cancelled: false },
    { at: ago(45), done: true, cancelled: false },
    { at: new Date(NOW + 3 * DAY).toISOString(), done: false, cancelled: false },
    { at: new Date(NOW + 4 * DAY).toISOString(), done: false, cancelled: true },
  ],
  requests: [{ pending: true, createdAt: ago(5) }, { pending: false, createdAt: ago(9) }],
  invites: [
    { createdAt: ago(4), joinedAt: ago(2), expiresAt: null },
    { createdAt: ago(6), joinedAt: null, expiresAt: new Date(NOW + DAY).toISOString() },
    { createdAt: ago(20), joinedAt: null, expiresAt: ago(1) },
  ],
  feedback: [{ createdAt: ago(1), open: true }, { createdAt: ago(9), open: false }],
  activity: [
    { days: 7, role: 'ds', active: 2, approved: 4 }, { days: 30, role: 'ds', active: 4, approved: 4 },
    { days: 7, role: 'dm', active: 1, approved: 1 }, { days: 30, role: 'dm', active: 0, approved: 1 },
  ],
};

const p = missionPulse(input, 30);
ok(p.explorers === 4 && p.guides === 1, 'only approved people are counted as Explorers and Guides');
ok(p.newExplorers.now === 4 && p.newExplorers.before === 1, `new Explorers counts this period against the one before (${p.newExplorers.now} vs ${p.newExplorers.before})`);
ok(p.unpaired === 2 && p.waitOverdue === 1, 'two Explorers wait for a Guide, one of them for more than a week');
ok(p.waitMedianDays !== null && Math.abs(p.waitMedianDays - 5.5) < 0.01, `the middle wait is the median, not the mean (${p.waitMedianDays})`);
ok(p.requestsPending === 1 && Math.round(p.requestOldestDays) === 5, 'one pairing request waits, for five days');
ok(p.steps.now === 2 && p.steps.before === 1, `a step back is never a step forward (${p.steps.now} this period, ${p.steps.before} before)`);
ok(p.commissioned.now === 1, 'reaching the last stage counts as commissioned');
ok(p.meetingsHeld.now === 1 && p.meetingsHeld.before === 1 && p.meetingsAhead === 1, 'meetings held, and only the uncancelled one ahead');
ok(p.stalled === 1 && p.pathway.find((r) => r.stage === 'care').stalled === 1, 'a journey with no step in thirty days is stalled, at its own stage');
ok(p.activeJourneys === 2 && p.pathway.find((r) => r.stage === 'call').count === 0, 'the pathway counts active journeys only (an archived one is not on it)');
ok(p.invitesWaiting === 1 && p.invitesExpired === 1 && p.invitesJoined.now === 1, 'invitations: one waiting, one expired, one used');
ok(p.feedbackOpen === 1, 'only open feedback is counted');
const ds = p.stickiness.find((s) => s.role === 'ds');
ok(ds.ratio === 0.5, 'back this week is weekly active out of monthly active');
ok(p.stickiness.find((s) => s.role === 'dm').ratio === null, 'with nobody active this month the ratio is unknown, not zero or infinity');
ok(p.pairedShare === 1 / 3, 'of the three Explorers who joined this period, one has a Guide');
const keys = p.attention.map((a) => `${a.key}:${a.tone}`).join(' ');
ok(/waiting:act/.test(keys) && /requests:act/.test(keys) && /stalled:watch/.test(keys) && /invites:watch/.test(keys) && /feedback:watch/.test(keys), `what needs attention, with the right urgency (${keys})`);
ok(!JSON.stringify(p).includes('secret-'), 'no name or id of a person ever comes out, only counts');

const quiet = missionPulse({ ...input, members: [], pairings: [], moves: [], requests: [], invites: [], feedback: [] }, 7);
ok(quiet.attention.length === 1 && quiet.attention[0].tone === 'good', 'a quiet church says all clear rather than nothing');

const m = measure([ago(0.5), ago(6.5), ago(8), ago(20), 'not a date', null, new Date(NOW + DAY).toISOString()], 7, 7, NOW);
ok(m.now === 2 && m.before === 1 && m.series.length === 7 && m.series[6] === 1 && m.series[0] === 1, 'a period is split into its buckets, oldest first, and junk or the future is ignored');
ok(change({ now: 3, before: 0, series: [] }).pct === null && change({ now: 6, before: 4, series: [] }).pct === 50, 'a percentage is only given against a period that had something');
ok(median([]) === null && median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5, 'median of nothing, odd and even');
for (const days of [7, 30, 90, 365]) ok(missionPulse(input, days).periodDays === days, `the ${days}-day period is honoured`);

console.log(bad ? `\n${bad} problem(s).` : '\nThe mission pulse adds up.');
process.exit(bad ? 1 : 0);
