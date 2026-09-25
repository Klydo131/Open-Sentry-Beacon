// The library shelf can be described, searched, and shared without a wall of buttons.
//
// THREE THINGS, and the first is a real gap rather than a polish item.
//
//   ONE. THE FORM NEVER ASKED WHAT A LINK IS FOR. `addMaterial` has taken a
//   description since the day it was written, `updateMaterial` takes one, and
//   the row draws one -- and no screen ever offered a box to type it in. So
//   every resource added by a real person is a bare title over a grey address,
//   and the only items with a line explaining themselves are seeded ones. A
//   link handed to somebody hesitant, with nothing saying why it is worth their
//   time, is a link nobody taps.
//
//   TWO. EIGHT CONTROLS UNDER EVERY ROW. A Guide carrying five Explorers saw
//   five "Share with ..." buttons on every item, plus share-outside, edit and
//   remove. The title somebody came to read was buried under the things they
//   might do with it, and it got worse as the church grew.
//
//   THREE. NO WAY TO FIND ANYTHING. The shelf only grows and there was no
//   search at any length.
//
// AND THE BACK BUTTON, which is a different screen and the same kind of
// mistake: it had moved to the right-hand side of the library page.
//
//   node tests/the-library-is-easy-to-use.mjs
//
// Reads the screens. Needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Comments explain the bugs at length; a check that cannot tell an explanation
// from the thing it explains fails on its own documentation.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const ui = strip(read('components/LiveLibrary.tsx'));
const data = strip(read('lib/live/data.ts'));

// ---------------------------------------------------------------------------
// 1. A RESOURCE CAN SAY WHAT IT IS FOR
// ---------------------------------------------------------------------------
{
  // The data layer always could. This is about the question being asked.
  ok(/description\?: string;/.test(data), 'the data layer accepts a description');

  ok(/id="mat-note"/.test(ui), 'the add form has a box for it');
  ok(/description: note/.test(ui), 'and passes what was typed');
  ok(/id=\{`edit-note-\$\{m\.id\}`\}/.test(ui), 'the edit form has one too');
  ok(/description: editNote/.test(ui), 'and passes that');
  ok(/setEditNote\(m\.description \?\? ''\)/.test(ui),
     'and opening the editor shows the description already there, rather than blanking it');

  // OPTIONAL ON PURPOSE. Requiring it would stop somebody adding a link they
  // are in a hurry about, and a link with no note still beats no link.
  ok(/optional/i.test(ui), 'it is marked optional');
  ok(!/!note\.trim\(\)/.test(ui), 'and nothing refuses to save without one');

  // A placeholder that shows the shape of a good answer teaches more than a
  // sentence describing one.
  ok(/Who is it for, or why it helps/.test(ui), 'the placeholder shows what a useful line looks like');

  // The row has always drawn it; if that stopped, the box would be pointless.
  ok(/m\.description &&/.test(ui), 'and the row still shows it');
}

// ---------------------------------------------------------------------------
// 2. ONE SHARE CONTROL, NOT ONE PER PERSON
// ---------------------------------------------------------------------------
{
  ok(/const \[sharing, setSharing\]/.test(ui), 'a row can be opened for sharing');
  ok(/sharing === m\.id \?/.test(ui), 'and the list of people appears only then');
  ok(/setSharing\(m\.id\)/.test(ui), 'one control opens it');
  ok(/setSharing\(''\)/.test(ui), 'and it closes again');

  // THE REGRESSION THIS PINS. `pairings.map` drawing a button per person at the
  // TOP level of the row is the thing that was removed. Inside the opened
  // picker it is correct and expected.
  const rowStart = ui.indexOf('{shown.map((m) => (');
  const picker = ui.indexOf('sharing === m.id ?', rowStart);
  const firstMap = ui.indexOf('pairings.map', rowStart);
  ok(rowStart !== -1 && picker !== -1, 'the row draws a picker');
  ok(firstMap > picker,
     'and no button-per-person is drawn before the picker opens');

  // THE PICKER STAYS OPEN NOW, AND THIS CHECK USED TO SAY THE OPPOSITE.
  //
  // It pinned "choosing somebody shares and closes the picker", which was a
  // reasonable thing to want when a Guide had one Explorer. With two or more it
  // is the bug: share with the first, the list vanishes, find the row again for
  // the second. And tapping a name that already had it was refused with "That
  // is already shared with them", so the control read as "sometimes it works,
  // most of the time it doesn't" -- which is how it was reported.
  //
  // So the requirement changed rather than the test being wrong before. What
  // has to stay true is that the picker can still be CLOSED, and that is
  // checked on line 84 above.
  ok(!/void share\(m\.id, p\.id, p\.ds_name\); setSharing\(''\)/.test(ui),
     'choosing somebody does NOT close the picker, so several people can be given it');
  ok(/Done/.test(ui), 'and there is a way to close it when finished');

  // Somebody who already has it is shown as having it rather than offered a tap
  // that will be refused. Without this the "stays open" change above would make
  // the duplicate refusal EASIER to hit, not harder.
  ok(/alreadyShared\.get\(m\.id\)\?\.has\(p\.id\)/.test(ui),
     'the picker knows who already has each resource');
  ok(/disabled=\{has\}/.test(ui), 'and does not offer a tap that would be refused');

  // One person is named: "Send to John" says who. With several it says
  // "Send" and the panel names them -- "Send to 2 people" was too wide to share
  // a phone's row with Edit and Delete (25 September 2026). Whether there is
  // anybody to send to at all is answered by the button existing: with nobody,
  // the row offers "Share outside the app" instead.
  ok(/pairings\.length === 1 \? `Send to \$\{pairings\[0\]/.test(ui),
     'one person is named rather than counted');
  ok(/\{pairings\.length === 0 \? \(\s*<SendOut/.test(ui),
     'and with nobody to send to, the row offers the share sheet instead of a Send that goes nowhere');

  // Opening the share picker must not leave a half-finished delete underneath
  // it, which is how somebody taps Yes on the wrong thing.
  ok(/setSharing\(m\.id\); setConfirming\(''\)/.test(ui),
     'and opening it clears any pending removal');
}

// ---------------------------------------------------------------------------
// 3. THE SHELF CAN BE SEARCHED, ONCE THERE IS SOMETHING TO SEARCH
// ---------------------------------------------------------------------------
{
  ok(/const \[find, setFind\]/.test(ui), 'there is a search box');
  ok(/type="search"/.test(ui), 'of the right input type, so a phone offers the right keyboard');
  ok(/aria-label="Search the library/.test(ui), 'named for a screen reader');

  // BELOW A HANDFUL OF ROWS A BOX IS NOISE. Same rule as Approved accounts.
  ok(/\(items\?\.length \?\? 0\) > 6/.test(ui),
     'and it stays hidden until the shelf is longer than a screen');

  // WHAT IT MATCHES. People remember a resource as "the one about baptism" or
  // "that youtube video" as often as by its title.
  ok(/m\.title\.toLowerCase\(\)\.includes\(needle\)/.test(ui), 'it matches the title');
  ok(/\(m\.description \?\? ''\)\.toLowerCase\(\)\.includes\(needle\)/.test(ui), 'and the description');
  ok(/\(m\.external_url \?\? m\.file_name \?\? ''\)\.toLowerCase\(\)\.includes\(needle\)/.test(ui),
    'and the address, or for a file its name');

  // A COUNT, so a search that finds nothing says so rather than looking broken.
  //
  // THIS USED TO ASSERT THE LITERAL PHRASE "nothing by that name", which was
  // right while the search box was the only way to narrow the shelf. It is not
  // any more: a kind filter can empty the list too, and a message naming only
  // the search would send somebody hunting for words they never typed. The
  // check now asks for the BEHAVIOUR, and asks for more of it than the phrase
  // did -- an empty result must say which filter emptied it AND offer the way
  // out, because an empty list with no explanation reads as a broken library.
  ok(/\{shown\.length\} of \{items\?\.length \?\? 0\}/.test(ui),
     'a narrowed shelf says how much of itself is showing');
  ok(/shelfKind && `/.test(ui) && /needle && `/.test(ui),
     'and an empty result names which of the two controls emptied it');
  ok(/Show everything again/.test(ui),
     'and offers the way back instead of showing a blank shelf');
  ok(/\{shown\.length\} of \{items\?\.length \?\? 0\}/.test(ui), 'with how many of how many');

  // The list drawn must be the filtered one, or the box does nothing.
  ok(/\{shown\.map\(\(m\) => \(/.test(ui), 'and the shelf draws the filtered list');
  ok(!/\{items\?\.map\(\(m\) => \(/.test(ui), 'not the unfiltered one');
}

// ---------------------------------------------------------------------------
// 4. BACK IS ON THE LEFT
// ---------------------------------------------------------------------------
//
// Reported: "It's not good for the muscle memory for users to swap and click
// the lost back button if my eyes will go to another direction."
//
// That is the whole argument and it is correct. Back is top-LEFT on every
// phone anybody owns -- iOS, Android, and the browser's own control -- and a
// way out that MOVES is worse than one that is slightly harder to find,
// because somebody who has learned where it is stops looking and starts
// reaching. The arrow already pointed left while the button sat on the right,
// which was the giveaway.
{
  const page = read('app/library/page.tsx');
  const header = page.slice(page.indexOf('<header'), page.indexOf('</header>'));
  const backAt = header.indexOf('Back to app');
  const markAt = header.indexOf('SentryBeaconWordmark');
  ok(backAt !== -1, 'the library page has a way back to the app');
  ok(markAt !== -1, 'and the wordmark');
  ok(backAt < markAt, 'and Back comes FIRST, so it draws on the left where a thumb expects it');
  ok(/←\s*Back to app/.test(header), 'with an arrow that points the way it goes');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
