// An Explorer is told what to do, and never left on a dead end.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Twenty-one studies published in this church, two read. The
// pairings were made, nobody was unpaired, nine materials were shared: supply
// was healthy and demand was near zero. What was missing was the sentence that
// tells an Explorer what to do when they open the app today. My Journey opened
// on four folders and not one of them opened with a next step.
//
// TWO RULES, AND THEY ARE THE WHOLE OF PHASES 1 AND 2.
//
//   1. The first screen names the next study. By NAME -- "you have 13 left" is
//      a chore, a title is a thing somebody might want to read -- and opening
//      it lands on the right series rather than on a shelf of closed folders.
//
//   2. No waiting screen is a dead end. Not-approved, no-Guide-yet and
//      Guide-has-not-written are the first three screens a new member can meet,
//      and each has to say what has already happened and what they can do now.
//
// WHAT THIS DELIBERATELY DOES NOT ASSERT: the journey stage. The stage is a
// note the church keeps about a person and a seeker never sees it. Showing it
// is a product decision for the owner, not a side effect of adding a number, so
// this checks that the study progress is SEPARATE from it rather than merged
// into it.
//
//   node tests/an-explorer-is-told-what-to-do-next.mjs
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

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const explorer = strip(read('components/live/ExplorerPage.tsx'));
const card = strip(read('components/live/NextStudy.tsx'));
const shell = strip(read('components/LiveAppShell.tsx'));
const shared = strip(read('components/live/shared.tsx'));

// ---------------------------------------------------------------------------
// 1. THE NEXT STUDY, BY NAME, ON THE FIRST SCREEN
// ---------------------------------------------------------------------------
{
  ok(/<NextStudy/.test(explorer),
     'My Journey draws the next study');

  // ON THE DEFAULT FOLDER, which is the one somebody lands on. A card in the
  // Study folder would only be found by whoever went looking, which is the
  // problem rather than the fix.
  const guideBlock = /room === 'guide' &&([\s\S]*?)\n        \{room === 'study'/.exec(explorer);
  ok(!!guideBlock && /<NextStudy/.test(guideBlock[1]),
     'and draws it on the folder an Explorer lands on, not a folder they must find');

  ok(/next_title/.test(card),
     'the card names the study rather than counting what is left');

  ok(/chooseRoom\('study'\)/.test(explorer) && /setOpenSeries/.test(explorer),
     'opening it goes to the shelf AND says which series to open');
  ok(/openSeries/.test(strip(read('components/LiveStudies.tsx'))),
     'and the shelf opens where it was sent');
}

// ---------------------------------------------------------------------------
// 2. THE NUMBER IS THE EXPLORER'S OWN, AND SEPARATE FROM THE STAGE
// ---------------------------------------------------------------------------
{
  const dir = path.join(root, 'supabase/migrations');
  const file = fs.readdirSync(dir).find((f) => f.includes('the_next_thing_to_read'));
  ok(!!file, 'the migration is present');
  const sql = file ? read(`supabase/migrations/${file}`) : '';

  ok(/lesson_reads/.test(sql) && /r\.user_id = \(select auth\.uid\(\)\)/.test(sql),
     'progress counts what THIS person read');

  // THE ONE THAT KEEPS A PRODUCT DECISION FROM LEAKING. A seeker never sees
  // their stage; if the word appeared in this function it would be on screen.
  ok(!/journey_stage/.test(sql),
     'and never returns the journey stage, which a seeker does not see');

  ok(/s\.is_published/.test(sql) && /is_hidden/.test(sql),
     'and only counts studies an Explorer can actually open');
}

// ---------------------------------------------------------------------------
// 3. NO WAITING SCREEN IS A DEAD END
// ---------------------------------------------------------------------------
//
// Each of the three has to do two things: say what has already happened, so
// somebody knows they are not shouting into a room, and say what they can do
// now, so the screen is not a full stop.
{
  const review = /Your account is being reviewed([\s\S]{0,900})/.exec(shell);
  ok(!!review, 'the account-review screen exists');
  ok(review ? /been told/.test(review[1]) : false,
     'waiting for approval says somebody has been told');
  ok(review ? /nothing else for you to do|do not need to/i.test(review[1]) : false,
     'and says what is not expected of them');

  const waiting = /Your Guide is being arranged([\s\S]{0,900})/.exec(explorer);
  ok(!!waiting, 'the pairing-wait screen exists');
  ok(waiting ? /can see that you are waiting/.test(waiting[1]) : false,
     'waiting for a Guide says the church can see them waiting');
  ok(waiting ? /do not have to wait|open to you now/.test(waiting[1]) : false,
     'and gives them something to do meanwhile');

  // THE ONE THAT WAS SPEAKING TO THE WRONG PERSON. "Start with a welcome" is
  // the Guide's job, and an Explorer was being told to do it.
  ok(/emptyLine/.test(shared),
     'an empty conversation can say different things to different readers');
  ok(/emptyLine=/.test(explorer),
     'and the Explorer gets their own line rather than the Guide\'s instruction');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
