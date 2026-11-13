// A Guide can say why they are sending something.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Every part of this feature was built except the one that
// takes the input, and nothing noticed for as long as it shipped:
//
//   material_shares.note    the column, capped at 1000  -- migration 0008
//   shareMaterial(..., note)  the data layer takes one  -- lib/live/data.ts
//   {s.note && <span>"{s.note}"</span>}  the Explorer's card DRAWS it
//   live.shareMaterial(m.id, p.id)       the Guide's screen never passed it
//
// So every share ever written carried an empty note. Not because Guides
// skipped it -- because there was no box. The receiving half of the feature had
// been rendering a field that could not be filled, which is the kind of fault
// that never produces an error and never appears in a log. It was found by
// counting: twenty-two shares in the church, twenty-two empty notes.
//
// AND IT IS THE PART THAT CARRIES THE MEANING. "Here is a link" and  are the
// same row in the database and not remotely the same thing to receive. A
// discipleship app that drops the second one is a bookmark list.
//
//   node tests/a-share-can-say-why.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const lib = read('components/LiveLibrary.tsx');
const data = read('lib/live/data.ts');

// ---------------------------------------------------------------------------
// 1. THE WHOLE PATH IS CONNECTED, END TO END
// ---------------------------------------------------------------------------
//
// Checked as a CHAIN rather than as four separate facts, because three of the
// four were already true while the feature did nothing. The link that was
// missing is the one between the screen and the data layer, so that is the one
// stated first and most plainly.
{
  ok(/shareMaterial\s*\(\s*materialId:\s*string,\s*pairingId:\s*string,\s*note\?:\s*string/.test(data),
     'the data layer takes a note');

  ok(/note:\s*note\?\.trim\(\)\s*\|\|\s*null/.test(data),
     'and writes it, or null when it is blank rather than a row of spaces');

  // THE LINK THAT WAS MISSING. A third argument, from the screen.
  ok(/live\.shareMaterial\([^)]*,[^)]*,[^)]*\)/.test(lib),
     "the Guide's screen passes a note when it shares");

  ok(/{s\.note\s*&&/.test(lib),
     "and the Explorer's card draws it when there is one");
}

// ---------------------------------------------------------------------------
// 2. THERE IS SOMEWHERE TO TYPE IT
// ---------------------------------------------------------------------------
//
// The check that would have caught the original fault. A handler that accepts
// a note is worth nothing if no control ever produces one, which is exactly
// the state this replaces.
{
  ok(/const \[shareNote, setShareNote\] = useState\(''\)/.test(lib),
     'the picker holds what the Guide typed');

  ok(/value=\{shareNote\}/.test(lib),
     'and an input is bound to it');

  ok(/maxLength=\{1000\}/.test(lib),
     'capped at the column’s own limit, so a long note is stopped by the box '
     + 'and not by an error after the tap');

  // A LABEL, BECAUSE A BARE BOX IS A GUESS. Screen readers get nothing from a
  // placeholder; it is not a label and disappears as soon as anybody types.
  ok(/htmlFor=\{`share-note-\$\{m\.id\}`\}/.test(lib) && /id=\{`share-note-\$\{m\.id\}`\}/.test(lib),
     'and the box is labelled, per row, rather than left for a placeholder to explain');
}

// ---------------------------------------------------------------------------
// 3. THE NOTE DOES NOT FOLLOW YOU TO THE NEXT RESOURCE
// ---------------------------------------------------------------------------
//
// THE BUG THIS SHAPE INVITES, written down so the fix is not undone. One note
// for the whole picker means one piece of state for the whole screen, and state
// that outlives the row it was typed on would attach "watch the first ten
// minutes" to somebody else's completely different link -- a wrong sentence in
// a real person's hands, with the Guide's name on it.
//
// So it is cleared on OPEN as well as on close. Clearing only on close leaves
// it behind whenever the picker is abandoned by opening another row.
{
  ok(/setSharing\(m\.id\);[^}]*setShareNote\(''\)/.test(lib),
     'opening a row starts with an empty note');
  ok(/setSharing\(''\);\s*setShareNote\(''\)/.test(lib),
     'and closing the picker clears it too');
}

// ---------------------------------------------------------------------------
// 4. IT IS OPTIONAL, AND SHARING STILL COSTS TWO TAPS
// ---------------------------------------------------------------------------
//
// The rule the add form already states in its own words: making it required
// would stop somebody sharing a link they are in a hurry about, and a link with
// no note still beats no link. If this ever becomes required, this check is
// where the argument should be had.
{
  ok(!/required/.test(lib.slice(lib.indexOf('share-note-') - 600,
                                lib.indexOf('share-note-') + 600)),
     'the note is not required, so a hurried share is still one tap');

  ok(/shareNote\.trim\(\)/.test(lib) && /\|\|\s*undefined/.test(lib),
     'and an untouched box sends nothing at all, not an empty string');
}

// ---------------------------------------------------------------------------
// 5. THE COLUMN IT LANDS IN STILL EXISTS, AND STILL HAS A CEILING
// ---------------------------------------------------------------------------
{
  const zero = read('supabase/migrations/0008_library.sql');
  ok(/note\s+text\s+check\s*\(note is null or length\(note\) <= 1000\)/.test(zero),
     'the column is there with its 1000-character check, which is where maxLength came from');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
