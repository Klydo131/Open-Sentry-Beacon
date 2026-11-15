// The Mission pulse warns, and its automations do only what they say.
//
// lib/pulse-alerts.ts holds the warning rules a leader can tune and the four
// automations the app can carry out with a leader's own permissions. This
// checks each rule fires over its line and not under it, that percentage rules
// stay quiet on a small base, that settings are tidied, that automatic runs
// respect their quiet period, that follow-ups are never doubled, and that
// nothing a rule or automation writes carries a name or an id.
//
//   node tests/the-pulse-warns-and-acts.mjs
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

let al; let mp; let ma;
try {
  al = await import(pathToFileURL(path.join(root, 'lib/pulse-alerts.ts')).href);
  mp = await import(pathToFileURL(path.join(root, 'lib/mission-pulse.ts')).href);
  ma = await import(pathToFileURL(path.join(root, 'lib/mission-analysis.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.ALERTS_RETRY === '1') { console.error(`BAD could not load the alerts: ${err && err.message}`); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, ALERTS_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { evaluate, defaultSettings, tidySettings, tidyAutomations, due, planFollowUps, guidesMessage, notification, briefing, AUTOMATIONS, RULES } = al;
const { missionPulse, DAY } = mp;
const { journeyRows } = ma;

const NOW = Date.UTC(2026, 10, 15, 12);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const base = {
  now: NOW,
  members: [
    { id: 'secret-e1', role: 'ds', approved: true, joinedAt: ago(10) },  // waiting 10 days
    { id: 'secret-e2', role: 'ds', approved: true, joinedAt: ago(2) },   // waiting 2 days
    { id: 'secret-e3', role: 'ds', approved: true, joinedAt: ago(90) },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `secret-x${i}`, role: 'ds', approved: true, joinedAt: ago(200) })),
    { id: 'secret-g1', role: 'dm', approved: true, joinedAt: ago(300) },
  ],
  pairings: [
    { id: 'secret-p-stalled', dsId: 'secret-e3', dmId: 'secret-g1', stage: 'care', status: 'active', createdAt: ago(90) },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `secret-p${i}`, dsId: `secret-x${i}`, dmId: 'secret-g1', stage: 'connect', status: 'active', createdAt: ago(5) })),
  ],
  moves: [{ pairingId: 'secret-p-stalled', from: 'connect', to: 'care', at: ago(45) }],
  meetings: [], requests: [{ pending: true, createdAt: ago(5) }],
  invites: [{ createdAt: ago(40), joinedAt: null, expiresAt: ago(10) }],
  feedback: Array.from({ length: 5 }, () => ({ createdAt: ago(1), open: true })),
  activity: [{ days: 7, role: 'ds', active: 2, approved: 9 }, { days: 30, role: 'ds', active: 8, approved: 9 }],
};
const run = (input, settings = defaultSettings(), ms = 500, period = 30) => {
  const pulse = missionPulse(input, period);
  return { pulse, w: evaluate(pulse, journeyRows(input), input, settings, ms) };
};
const keys = (w) => w.map((x) => x.key).sort().join(' ');

const { pulse, w } = run(base);
ok(keys(w) === 'explorers-back feedback invites load request stalled wait', `every rule over its line fires (${keys(w)})`);
ok(w[0].severity === 'critical' && w[w.length - 1].severity !== 'critical', 'urgent warnings come first');
ok(w.find((x) => x.key === 'wait').count === 1, 'waiting fires only for the Explorer past 7 days, not the one at 2');
ok(w.find((x) => x.key === 'stalled').pairingIds.join() === 'secret-p-stalled', 'stalled names the journey for a follow-up, and only that one');
ok(w.find((x) => x.key === 'load').value === 7, 'a Guide with seven people is over a line of five');
ok(w.find((x) => x.key === 'explorers-back').value === 25, 'two of eight back this week is 25%, under 40%');

// Thresholds and switches.
const relaxed = tidySettings({ wait: { on: true, threshold: 14 }, stalled: { on: false, threshold: 30 }, load: { on: true, threshold: 10 } });
const r2 = keys(run(base, relaxed).w);
ok(!/wait|stalled|load/.test(r2), `a higher line or a switched-off rule stays quiet (${r2})`);
ok(keys(run(base, defaultSettings(), 4200).w).includes('slow') && !keys(run(base).w).includes('slow'), 'slow fires over three seconds, not under');

// Noise guards: a percentage on a tiny base never fires.
const tiny = { ...base, moves: [{ pairingId: 'secret-p0', from: 'create', to: 'connect', at: ago(40) }, { pairingId: 'secret-p1', from: 'create', to: 'connect', at: ago(45) }] };
ok(!keys(run(tiny).w).includes('steps-drop'), 'two steps falling to none is too small a base to call a drop');
const busy = { ...base, moves: Array.from({ length: 10 }, (_, i) => ({ pairingId: `secret-p${i % 6}`, from: 'create', to: 'connect', at: ago(35 + i) })) };
ok(keys(run(busy).w).includes('steps-drop'), 'ten steps falling to none is a real drop and fires');
const fewActive = { ...base, activity: [{ days: 7, role: 'ds', active: 0, approved: 9 }, { days: 30, role: 'ds', active: 3, approved: 9 }] };
ok(!keys(run(fewActive).w).includes('explorers-back'), 'three active this month is too few to judge who came back');

// Settings are tidied.
const t = tidySettings({ wait: { on: 'yes', threshold: -4 }, nonsense: { on: true, threshold: 1 }, request: { threshold: 'x' } });
ok(t.wait.on === true && t.wait.threshold === 7 && !('nonsense' in t) && t.request.threshold === 3 && Object.keys(t).length === RULES.length, 'damaged settings fall back to the usual, unknown rules are dropped');
const a = tidyAutomations({ mode: { followups: 'auto', guides: 'launch' }, lastRun: { notify: 'not a date', guides: ago(1) } });
ok(a.mode.followups === 'auto' && a.mode.guides === 'ask' && !a.lastRun.notify && a.lastRun.guides, 'automation settings are tidied the same way');

// Quiet periods.
const def = AUTOMATIONS.find((x) => x.key === 'guides');
ok(due(def, { mode: { ...a.mode, guides: 'auto' }, lastRun: {} }, true, NOW), 'an automatic run with work to do and no last run is due');
ok(!due(def, { mode: { ...a.mode, guides: 'auto' }, lastRun: { guides: ago(3) } }, true, NOW), 'within its week it does not run again');
ok(due(def, { mode: { ...a.mode, guides: 'auto' }, lastRun: { guides: ago(8) } }, true, NOW), 'after its week it may');
ok(!due(def, { mode: { ...a.mode, guides: 'ask' }, lastRun: {} }, true, NOW) && !due(def, { mode: { ...a.mode, guides: 'auto' }, lastRun: {} }, false, NOW), 'never on "Ask first", never with nothing to do');

// Follow-ups are never doubled.
const plan = planFollowUps(w, [], NOW);
ok(plan.length === 1 && plan[0].pairingId === 'secret-p-stalled' && plan[0].dueOn === '2026-11-17', 'one follow-up for the stalled journey, due in two days');
ok(planFollowUps(w, [{ pairing_id: 'secret-p-stalled', title: plan[0].title, done_at: null }], NOW).length === 0, 'not again while that follow-up is open');
ok(planFollowUps(w, [{ pairing_id: 'secret-p-stalled', title: plan[0].title, done_at: ago(1) }], NOW).length === 1, 'but again once the last one was done and it is still stalled');

// What leaves carries no name or id.
const msg = guidesMessage(w, pulse);
const note = notification(w);
const text = briefing(pulse, w, '30 days', 'Sample Church', (k) => k.toUpperCase());
ok(/2 Explorers are waiting for a Guide, 1 of them for more than 7 days/.test(msg), 'the Guides\' room message counts who waits');
ok(guidesMessage([], { ...pulse, unpaired: 0 }) === null, 'nothing is posted when nobody waits');
ok(note && /2 things need a leader/.test(note.title), 'the notification counts the urgent warnings');
ok(notification(w.filter((x) => x.severity !== 'critical')) === null, 'and stays silent when nothing is urgent');
ok(/Mission briefing/.test(text) && /CARE 1/.test(text) && /\[critical\]/.test(text), 'the briefing has the numbers, the stages and the warnings');
ok(![msg, note.title, note.body, text, JSON.stringify(w.map(({ pairingIds, ...rest }) => rest)), plan[0].title].some((s) => /secret/.test(s)), 'no name or id appears in any message, notification, briefing or follow-up title');

// Guide commitments: a Guide without a current signature is an urgent warning.
const signedNone = run({ ...base, guidesSigned: [] }).w.find((x) => x.key === 'commitments');
ok(signedNone && signedNone.severity === 'critical' && signedNone.count === 1, 'a Guide who has not signed their commitments is an urgent warning');
ok(!run({ ...base, guidesSigned: ['secret-g1'] }).w.some((x) => x.key === 'commitments'), 'once they sign, it stops');
ok(!run(base).w.some((x) => x.key === 'commitments'), 'a copy that cannot tell (no table yet) never cries wolf');
let gc;
try { gc = await import(pathToFileURL(path.join(root, 'lib/guide-commitments.ts')).href); } catch { gc = null; }
ok(gc && gc.sameName('  maria   SANTOS ', 'Maria Santos') && !gc.sameName('Maria', 'Maria Santos') && !gc.sameName('', ''), 'a signature must be the person\'s own full name, ignoring case and spaces');
ok(gc && gc.commitmentsCurrent(ago(100), NOW) && !gc.commitmentsCurrent(ago(400), NOW) && !gc.commitmentsCurrent(null, NOW), 'a signature lasts a year');
ok(gc && gc.COMMITMENTS.length === 6 && /^[a-z0-9-]+$/.test(gc.COMMITMENTS_VERSION), 'six commitments, under a version the database accepts');

console.log(bad ? `\n${bad} problem(s).` : '\nThe pulse warns and acts.');
process.exit(bad ? 1 : 0);
