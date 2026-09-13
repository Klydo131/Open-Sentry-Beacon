// A Director can see when two people connected, when they stopped, and when
// somebody was approved.
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

// ---------------------------------------------------------------------------
// 5. AND AN APPROVAL IS A DATED DECISION TOO
// ---------------------------------------------------------------------------
//
// Asked for in the same breath as the pairing dates: "approvals should have a
// date too please, make sure the connection of Guide and Explorer pairing and
// approval must have a live date record."
//
// `is_approved` was a BARE BOOLEAN. Every other consequential thing on a
// profile already carried a timestamp and the two heaviest carried an actor as
// well -- `suspended_at` with `suspended_by`, guardian consent with the person
// who gave it. So the app could say exactly when access was TAKEN AWAY from
// somebody and by whom, and could not say when it was GRANTED or by whom. That
// is the wrong way round: approval is what lets a stranger into a church's
// private conversations.
//
// AND IT WAS NOT AUDITED EITHER, which is why nothing could be backfilled.
// `record_profile_change` watches eight fields -- full_name, preferred_contact,
// preferred_language, birthday, gender, life_status, city_of_residence,
// work_industry -- and `is_approved` is not among them. Checked from the
// function definition rather than by reading anybody's change history.
{
  const approval = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .find((f) => f.includes('an_approval_is_a_dated_decision'));
  ok(!!approval, 'a migration gives approval a date');
  const asql = approval ? read(`supabase/migrations/${approval}`) : '';

  ok(/add column if not exists approved_at timestamptz/.test(asql),
     'as a column of its own');
  ok(/add column if not exists approved_by uuid references public\.profiles/.test(asql),
     'and records who made the decision, the way suspension already did');

  ok(/create trigger stamp_approval/.test(asql)
     && /before update of is_approved on public\.profiles/.test(asql),
     'stamped by the database on the change itself, not by a browser clock');

  ok(/old\.is_approved is distinct from true/.test(asql),
     'only the transition into approved stamps it, so re-saving cannot move the date');

  ok(/if not new\.is_approved then[\s\S]{0,120}approved_at := null/.test(asql),
     'and taking approval away clears it, so the roster cannot contradict itself');

  // ON DELETE SET NULL, because an approver can leave the church. The date is
  // still true when the person who made it is gone.
  ok(/on delete set null/.test(asql),
     'and an approver leaving does not erase the date they set');

  ok(/approved_at\?: string \| null;/.test(types),
     'the profile carries it into the browser');

  ok(/approved \$\{onDay\(member\.approved_at\)\}/.test(admin),
     'and the approved list finally shows when');

  // THE HONEST NULL AGAIN. Everybody in that list IS approved, so a missing
  // date is never "not yet decided" -- it is a decision made before the column
  // existed. Showing created_at or updated_at instead would be a confident
  // guess about somebody's access.
  // THE WHOLE PHRASE, NOT A SUBSTRING OF SOMEBODY ELSE'S. This asked for
  // `/date not recorded/` and stayed green when the approval line was stripped
  // of it -- because the PAIRING section a few hundred lines up says "end date
  // not recorded", and that contains the shorter phrase. A check satisfied by a
  // different feature's wording is not checking this feature at all, and it is
  // the seventh time this project has caught that shape.
  ok(/access approved · date not recorded/.test(adminSrc),
     'and says so when the date was never captured, rather than guessing');

  // BOUNDED, BECAUSE `admin` IS ONE LINE. The first version of this used `.*`
  // between the two names -- and with whitespace collapsed the whole file is a
  // single line, so `.*` ran the length of it and matched an `approved_at` here
  // against a `created_at` four hundred lines away. An unbounded wildcard on
  // collapsed source is not a proximity test at all; it asks whether two
  // strings both exist in the file.
  ok(!/approved_at[^;]{0,40}(\?\?|\|\|)[^;]{0,40}(created_at|updated_at)/.test(admin),
     'with no fallback to another column standing in for it');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
