// A Director can see when two people were connected, and when they stopped.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for from the roster screen: "EDs and Directors should
// know when did the Guide and Explorer connected so we there would be a track
// record."
//
// TWO HALVES, AND THEY FAILED FOR DIFFERENT REASONS.
//
// 1. THE START DATE WAS ALREADY IN THE BROWSER. `pairings.created_at` has
//    existed since the table did, `listPairings` does `select('*')`, and the
//    type has always carried it. The roster drew two names and a stage and no
//    date at all -- so it answered "who" and never "since when", and three
//    weeks and three months are different questions about the same two names.
//
// 2. THE END DATE WAS NEVER RECORDED ANYWHERE. A pairing ends by setting
//    status = 'archived' and nothing wrote down when. Fifty-three of this
//    church's pairings are archived and not one can say what day it stopped.
//
// AND `updated_at` IS NOT THAT DATE. It is written by `advanceStage` and
// `stepBackStage` only -- there is no trigger, and `endPairing` has never
// touched it. lib/live/data.ts already warns about this in another context:
// "updated_at moves for reasons that are not a journey step and the chart would
// quietly count them." Reading it as an ending would put a confident wrong day
// in front of a Director making a pastoral judgement, which is worse than
// showing nothing. This file exists largely to keep that substitution from
// looking like an improvement to somebody later.
//
// NOTHING WAS BACKFILLED. The information was never captured; there is no
// honest source. The fifty-three keep a null and the screen says the date was
// not recorded, because an invented date is indistinguishable from a real one
// forever after.
//
//   node tests/a-pairing-has-a-track-record.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** Comments blanked AND whitespace collapsed. Six checks in this project have
 *  passed on prose; blanking alone preserves length and breaks distance. */
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const adminSrc = read('components/live/AdminPage.tsx');
const admin    = strip(adminSrc);
const types    = strip(read('lib/types.ts'));
const data     = strip(read('lib/live/data.ts'));

const migration = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((f) => f.includes('a_pairing_records_when_it_ended'));
const sql = migration ? read(`supabase/migrations/${migration}`) : '';

// ---------------------------------------------------------------------------
// 1. WHEN THEY WERE CONNECTED
// ---------------------------------------------------------------------------
{
  ok(/created_at: string;/.test(types), 'the start date is on the pairing');
  ok(/select\('\*'\)\.order\('created_at'/.test(data)
     || /from\('pairings'\)\.select\('\*'\)/.test(data),
     'and the roster reads the whole row, so it arrives in the browser');
  ok(/since \{onDay\(pairing\.created_at\)\}/.test(admin),
     'and the roster finally draws it');
}

// ---------------------------------------------------------------------------
// 2. WHEN THEY STOPPED, RECORDED BY THE DATABASE
// ---------------------------------------------------------------------------
{
  ok(!!migration, 'a migration adds the end date');
  ok(/add column if not exists ended_at timestamptz/.test(sql),
     'as a column of its own rather than a reading of another one');

  // SET BY A TRIGGER, NOT BY THE BROWSER. A client's clock is not a record, and
  // the date must arrive however the row is archived -- from the app, a script,
  // or by hand in SQL.
  ok(/create trigger stamp_pairing_end/.test(sql),
     'set by the database, so it does not depend on which client did the archiving');
  ok(/before update of status on public\.pairings/.test(sql),
     'and it fires on the status change itself');

  // ONLY ON THE TRANSITION IN. Re-archiving an archived row must not move the
  // date: the day it stopped is the day it stopped.
  ok(/old\.status is distinct from 'archived'/.test(sql),
     'only the first archiving stamps it, so the date cannot drift later');

  // AND A PAIR CAN BE MADE AGAIN -- tests/a-pair-can-be-made-again.mjs is about
  // exactly that -- so a live pairing must never carry a stale ending.
  ok(/if new\.status <> 'archived' then\s*new\.ended_at := null;/.test(sql),
     'and reconnecting clears it, so an active pairing never shows an end date');
}

// ---------------------------------------------------------------------------
// 3. THE TRACK RECORD IS VISIBLE
// ---------------------------------------------------------------------------
//
// The list of active pairings filters to `status === 'active'`, so before this
// an ended pairing stopped existing on the screen entirely.
{
  ok(/\.filter\(\(p\) => p\.status !== 'active'\)/.test(admin),
     'pairings that ended are gathered rather than filtered away');
  ok(/pairings that have ended/.test(adminSrc),
     'and shown under a heading that says what they are');
  ok(/<details/.test(admin) && /<summary/.test(admin),
     'folded shut, because the roster is about who is walking together now');
  ok(/walked with/.test(adminSrc),
     'in the past tense, so a glance cannot mistake it for the live list');
}

// ---------------------------------------------------------------------------
// 4. A DATE THAT WAS NEVER CAPTURED SAYS SO
// ---------------------------------------------------------------------------
//
// THE CHECK THAT MATTERS MOST HERE. Fifty-three rows predate the column. The
// tempting repair is to show `updated_at` for those, which would look complete
// and be wrong, and nobody downstream could ever tell the difference.
{
  ok(/end date not recorded/.test(adminSrc),
     'a pairing archived before the column existed says its date is unknown');

  ok(!/updated_at/.test(admin),
     'and the roster never falls back to updated_at, which is a stage change');

  ok(!/update .*pairings.*set ended_at/i.test(sql.replace(/--[^\n]*/g, '')),
     'and nothing was backfilled, because there was no honest source');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
