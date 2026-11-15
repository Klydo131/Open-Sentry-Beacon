// The appointment record says how every appointment ended (lib/meeting-record.ts).
//
// Asked for on 16 November 2026: a Guide and an Explorer both keep a record of
// what was called off, what was deleted, and what took place. This holds the
// one function both halves of the app use to decide that.
//
//   node tests/a-meeting-keeps-its-record.mjs
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

let mr;
try {
  mr = await import(pathToFileURL(path.join(root, 'lib/meeting-record.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.RECORD_RETRY === '1') { console.error(`BAD could not load the record: ${err && err.message}`); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, RECORD_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { outcomeOf, recordRow, meetingRecord, RECORD_FILTERS } = mr;

const now = Date.UTC(2026, 10, 16, 12);
const day = 86_400_000;
const at = (d) => new Date(now + d * day).toISOString();
const m = (id, status, d, extra = {}) => ({ id, title: id, startsAt: at(d), mode: 'online', status, ...extra });

ok(outcomeOf(m('a', 'done', -3), now) === 'held', 'marked as met: took place');
ok(outcomeOf(m('b', 'missed', -3), now) === 'missed', 'marked as not: did not happen');
ok(outcomeOf(m('c', 'confirmed', -3), now) === 'agreed', 'agreed and passed, not marked: asks whether you met');
ok(outcomeOf(m('d', 'confirmed', 2), now) === 'ahead', 'agreed and still to come: coming up');
ok(outcomeOf(m('e', 'proposed', -3), now) === 'unanswered', 'proposed and passed: never answered');
ok(outcomeOf(m('f', 'proposed', 2), now) === 'ahead', 'proposed and to come: coming up');
ok(outcomeOf(m('g', 'cancelled', 2, { note: 'Moved to Friday.' }), now) === 'moved', 'called off with "Moved to": moved');
ok(outcomeOf(m('h', 'cancelled', 2, { note: 'Sick.' }), now) === 'called-off', 'called off for another reason: called off');
ok(outcomeOf(m('i', 'declined', 2), now) === 'declined', 'declined: declined');
ok(outcomeOf(m('j', 'confirmed', new Date(now - 30 * 60_000).getTime() / day - now / day), now) === 'ahead', 'one that began half an hour ago is not history yet');

const off = recordRow(m('k', 'cancelled', -1, { byName: 'Grace', at: at(-2), note: 'Working late.' }), now);
ok(/Grace called it off/.test(off.detail) && /Reason: Working late\./.test(off.detail), `a called-off one says who and why ("${off.detail}")`);
const nameless = recordRow(m('l', 'declined', -1, { byName: null }), now);
ok(/^Could not make it/.test(nameless.detail), `with no name kept it still reads ("${nameless.detail}")`);

const rec = meetingRecord([m('a', 'done', -9), m('c', 'confirmed', -3), m('b', 'missed', -5), m('h', 'cancelled', -4, { note: 'Sick.' }),
  m('g', 'cancelled', 1, { note: 'Moved to Friday.' }), m('i', 'declined', -2), m('e', 'proposed', -6), m('d', 'confirmed', 4)], now);
ok(rec.rows.map((r) => r.id).join('') === 'dgichbea', `newest first (${rec.rows.map((r) => r.id).join('')})`);
ok(rec.met === 2, `met counts the marked and the agreed-and-passed (${rec.met})`);
ok(rec.counts['called-off'] === 1 && rec.counts.moved === 1 && rec.counts.declined === 1 && rec.counts.unanswered === 1 && rec.counts.missed === 1,
   'each other ending is counted once');
const every = new Set(RECORD_FILTERS.find((f) => f.key === 'all').takes);
ok(rec.rows.every((r) => every.has(r.outcome)), 'All shows every kind of ending');
ok(RECORD_FILTERS.filter((f) => f.key !== 'all').every((f) => f.takes.length > 0), 'every other filter takes something');

console.log(bad ? `\n${bad} check(s) failed` : '\nThe appointment record holds.');
process.exit(bad ? 1 : 0);
