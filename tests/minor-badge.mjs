// Who counts as a minor, and what the badge says about them.
//
// THE BUG CLASS THIS EXISTS FOR. A safeguarding mark that is stored rather than
// computed is right on the day it is set and wrong from the morning of the
// person's eighteenth birthday, with nothing to announce that it has gone
// stale. So the rule is tested at the boundary, on both sides and on the day
// itself, because "roughly eighteen" is not a thing a safeguarding control may
// be.
//
//   node tests/minor-badge.mjs

import { isMinor, minorState } from '../lib/minor.ts';

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const on = (y, m, d) => new Date(y, m - 1, d);

// ------------------------------------------------------------- the boundary --
// Somebody born 25 August 2008, asked across their eighteenth birthday.
const B = '2008-08-25';
ok(isMinor(B, on(2026, 8, 24)) === true,  'the day before their eighteenth, still a minor');
ok(isMinor(B, on(2026, 8, 25)) === false, 'ON their eighteenth birthday, no longer a minor');
ok(isMinor(B, on(2026, 8, 26)) === false, 'the day after, no longer a minor');

// A year out either way, so an off-by-one-year cannot hide.
ok(isMinor(B, on(2025, 8, 25)) === true,  'a year earlier they are seventeen');
ok(isMinor(B, on(2027, 8, 25)) === false, 'a year later they are nineteen');

// ------------------------------------------------------------ missing data --
// A MISSING BIRTHDAY IS NOT A CHILD. Treating it as one puts a MINOR badge on
// adults who skipped an optional question, which is both wrong and insulting.
ok(isMinor(undefined) === false, 'no birthday is not a minor');
ok(isMinor(null) === false, 'a null birthday is not a minor');
ok(isMinor('') === false, 'an empty birthday is not a minor');
ok(isMinor('not a date') === false, 'a birthday that will not parse is not a minor');

// ------------------------------------------------------------ the timezone --
// `new Date('2008-08-25')` is UTC midnight, which is already the 25th in Manila
// and still the 24th in New York. On the one day it matters, that is a
// wrong answer, so the parse is deliberately local.
ok(isMinor('2008-08-25', on(2026, 8, 25)) === false,
   'the boundary does not move with the reader’s timezone');

// ------------------------------------------------------------- what it says --
const child = { birthday: '2012-01-01' };
const adult = { birthday: '1990-01-01' };

ok(minorState(adult) === 'none', 'an adult gets no badge at all');
ok(minorState(child) === 'missing',
   'a minor with no recorded consent is flagged as MISSING, not quietly fine');
ok(minorState({ ...child, guardian_consent_at: '2026-08-01T00:00:00Z' }) === 'ok',
   'a minor with recorded consent is marked, but settled');

// An adult with a consent record on file is still not a minor. The badge keys
// off age, not off paperwork somebody once filed.
ok(minorState({ ...adult, guardian_consent_at: '2020-01-01T00:00:00Z' }) === 'none',
   'a stale consent record does not make an adult a minor');

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
