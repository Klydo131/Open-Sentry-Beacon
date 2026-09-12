// An appointment can say why, a silence is broken, and what happened is kept.
//
// ---------------------------------------------------------------------------
// THREE FAULTS IN THE APPOINTMENTS CARD, none of them reportable from outside
// and all three found by counting against the live database.
//
// 1. THE NOTE NOBODY COULD WRITE. `meetings.notes` has existed since migration
//    0009 with a 2000-character check, `scheduleMeeting` has accepted one since
//    it was written, `listMeetings` selects it and the Meeting type carries it.
//    The screen never passed one and never drew one. So all thirty-six
//    appointments this church has arranged carry an EMPTY note -- not because
//    nobody had anything to say, but because there was nowhere to say it.
//    Identical in shape to the library's share note, found a day earlier, which
//    is why it is worth a check rather than only a fix.
//
// 2. A SILENCE DELIVERED ON SOMEBODY'S BEHALF. The card drew only meetings less
//    than an hour past, so a proposal nobody answered simply STOPPED BEING
//    DRAWN once its date went by. Three of this church's are in that state. The
//    person who suggested the time watched their appointment disappear and had
//    no way to tell "they said no" from "they never saw it" -- and in this
//    church the second is overwhelmingly likelier, because forty-two Explorers
//    have not opened the app in a week.
//
// 3. EVERYTHING THAT ACTUALLY HAPPENED, THROWN AWAY. Thirty-three of the
//    thirty-six are in the past, and not one was visible to the two people it
//    happened between. For an app about walking with somebody over months,
//    "when did we last meet, and how often" is close to the only question a
//    Guide needs answered, and the card answered it for one hour and forgot.
//
//   node tests/an-appointment-is-remembered.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** Comments blanked AND whitespace collapsed. Five checks in this project have
 *  passed on prose; blanking alone preserves length and breaks distance. */
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const src  = read('components/LiveMeetings.tsx');
const code = strip(src);
const data = strip(read('lib/live/data.ts'));

// ---------------------------------------------------------------------------
// 1. THE WHOLE NOTE PATH IS CONNECTED
// ---------------------------------------------------------------------------
//
// Checked as a chain, because three of the four links were already there while
// the feature did nothing at all. The one that was missing is named first.
{
  ok(/notes\?: string/.test(data), 'the data layer takes a note');
  ok(/notes: \(meeting\.notes \|\| ''\)\.trim\(\) \|\| null/.test(data),
     'and writes it, or null rather than a row of spaces');
  ok(/select\('id, pairing_id, title, starts_at, mode, location, notes, status, created_by'\)/.test(data),
     'and reads it back');

  // THE LINK THAT WAS MISSING, TWICE OVER: nowhere to type it, nowhere it showed.
  ok(/const \[notes, setNotes\] = useState\(''\)/.test(code),
     'the screen holds what was typed');
  ok(/mode, location, notes, \}\)/.test(code),
     'and passes it when the appointment is proposed');
  // BOTH PLACES A NOTE CAN APPEAR, COUNTED. The first version of this check
  // asked only whether `{m.notes && (` occurred at all -- and there are two
  // sites, the upcoming row and the history below it. Breaking one on purpose
  // left the other matching and the check stayed green, which is the same
  // "present somewhere" weakness that has now bitten this project six times.
  {
    const drawn = (code.match(/\{m\.notes && \(/g) ?? []).length;
    ok(drawn === 2,
       `the note is drawn on what is ahead AND on what already happened (${drawn} of 2)`);
  }

  ok(/maxLength=\{2000\}/.test(code),
     'capped at the column’s own limit, so a long note is stopped by the box');
  ok(/htmlFor="meeting-notes"/.test(code) && /id="meeting-notes"/.test(code),
     'and the box is labelled rather than left for a placeholder to explain');
  ok(/setNotes\(''\)/.test(code),
     'the box empties after proposing, so the next appointment starts clean');
}

// ---------------------------------------------------------------------------
// 2. A PROPOSAL THAT RAN OUT OF TIME SAYS SO
// ---------------------------------------------------------------------------
{
  ok(/const missed = all\.filter\(\(m\) => m\.status === 'proposed' && past\(m\)\)/.test(code),
     'a proposal whose time has passed unanswered is found rather than dropped');
  ok(/missed\.length > 0 && \(/.test(code),
     'and it is drawn');

  // NO BLAME IN THE WORDING. The commonest reason by far is that the other
  // person never opened the app -- which in this church is measurably true.
  ok(/nobody answered before it came round/.test(src),
     'and it says the time passed, not that somebody ignored you');

  ok(/Tidy this away/.test(src),
     'with a way to clear it that does not read as cancelling on somebody');
}

// ---------------------------------------------------------------------------
// 3. WHAT HAPPENED IS KEPT, AND COUNTED
// ---------------------------------------------------------------------------
{
  ok(/const met = all \.filter\(\(m\) => m\.status === 'confirmed' && past\(m\)\)/.test(code),
     'meetings that happened are gathered instead of being filtered away');

  // CONFIRMED ONLY. A cancelled meeting is not a meeting that happened, and a
  // list of things that did not happen is not a history.
  ok(!/met = all \.filter\(\(m\) => past\(m\)\)/.test(code),
     'and a cancelled one is not counted as a meeting that took place');

  ok(/You have met \$\{met\.length\} times before/.test(src),
     'the count is said out loud, which is the number a Guide actually wants');
  ok(/You have met once before/.test(src),
     'and it reads properly when there has only been one');

  // FOLDED SHUT. A diary is about what is next; the history opens when somebody
  // asks the question it answers.
  ok(/<details/.test(code) && /<summary/.test(code),
     'the history is folded away rather than pushing the next appointment down');

  ok(/newest first/.test(src) || /b\.starts_at\.localeCompare\(a\.starts_at\)/.test(code),
     'and the most recent meeting is at the top of it');
}

// ---------------------------------------------------------------------------
// 4. THE THINGS THAT WERE ALREADY RIGHT
// ---------------------------------------------------------------------------
//
// The hour of grace exists so a meeting IN PROGRESS does not vanish off the
// card while two people are sitting in it. Splitting the list three ways is
// exactly the change that could have lost it.
{
  ok(/STILL_ON = 60 \* 60 \* 1000/.test(code),
     'a meeting already under way stays on the card for an hour');
  ok(/upcoming = all\.filter\(\(m\) => m\.status !== 'cancelled' && !past\(m\)\)/.test(code),
     'and what is ahead is still what the card leads with');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
