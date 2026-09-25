// A series can carry the line that explains it, and one page has one name.
//
// ---------------------------------------------------------------------------
// TWO REPORTS, ONE CAUSE: a screen that did not say what its boxes and its
// doors were for.
//
// ONE. "I still can't see the area of interest here", with two screenshots: a
// series created, the second box typed into, Save pressed, and the row exactly
// as it was -- while the two seeded series above it each carry a line of their
// own underneath the title.
//
// Nothing was broken. `lesson_series.description` is that line. It has existed
// since the table was created, addLessonSeries has accepted one since the day
// it was written, and the row draws one when it is there. NO FORM EVER OFFERED
// A BOX TO TYPE IT IN. So the only series carrying that line are the ones that
// were seeded, and a Guide writing their own could not have it however hard
// they tried. The box that WAS there is the grouping -- it becomes the heading
// the series is filed under -- so typing a description into it changed the
// heading and left the row alone, which is precisely what was reported.
//
// AND RENAMING ERASED IT. updateLessonSeries wrote `description: null`
// whenever the caller left it out, and the Rename form left it out. Renaming
// one of the seeded series would have silently deleted the sentence under it,
// with nothing on screen to say so.
//
// TWO. Looking for what an Explorer had shared, under the sidebar "Resources",
// and not finding it. THREE screens were called Resources and only two of them
// hold anything anybody handed you: the church shelf in the Office, and the
// Resources tab on one Explorer's page. The sidebar door is neither -- it
// opens a person's own media on their own device. It also had two names for
// one page: an Explorer saw "My Library", everybody else saw "Resources".
//
//   node tests/a-series-can-say-what-it-is.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const studies = strip(read('components/LiveStudies.tsx'));
const data = strip(read('lib/live/data.ts'));

// ---------------------------------------------------------------------------
// 1. THE BOX THAT WAS NEVER THERE
// ---------------------------------------------------------------------------
{
  // Since 25 September 2026 a series is written in ONE form (NewSeries): the
  // name, its studies, their handouts, and the line under the name folded into
  // "More options". The line must still be asked for and still be sent.
  const form = studies.slice(studies.indexOf('function NewSeries('), studies.indexOf('export function LiveStudies('));
  ok(/value=\{desc\}/.test(form),
     'a new series can be given the line that appears under its title');
  ok(/live\.addLessonSeries\(\{ title, topic, description: desc \}\)/.test(form),
     'and the line is actually sent when it is created');
  const saved = studies.slice(studies.indexOf('onSaved={(id, said) => {'), studies.indexOf('onSaved={(id, said) => {') + 200);
  ok(/setCreating\(false\)/.test(saved),
     'and the form closes once saved, so the next one starts empty');
}

// ---------------------------------------------------------------------------
// 2. AND ON THE FORM THAT EDITS ONE
// ---------------------------------------------------------------------------
//
// A line you can only set at creation is a line most series will never have,
// because nobody writes the description of a thing before they have written
// the thing.
{
  const rename = studies.slice(studies.indexOf('placeholder="Series title"'));
  const upTo = rename.slice(0, rename.indexOf('Cancel'));
  ok(/value=\{newDesc\}/.test(upTo), 'an existing series can be given one too');
  ok(/description: newDesc/.test(upTo), 'and Save sends it');
  ok(/setNewDesc\(s\.description \|\| ''\)/.test(studies),
     'the form opens with the line that is already there, not an empty box');
}

// ---------------------------------------------------------------------------
// 3. THE BOX THAT WAS THERE NOW SAYS WHAT IT DOES
// ---------------------------------------------------------------------------
//
// "Area of interest" reads like a description, so it was typed into as one.
// It is the heading the series is filed under, and the row it sits on does not
// change when it is edited -- which from the outside is indistinguishable from
// a Save that did nothing.
{
  ok(!/placeholder="Area of interest"/.test(studies),
     'the grouping box no longer reads like a description');
  // SAID ON A LABEL THAT STAYS, not in a placeholder that vanishes on the
  // first keystroke. It was "Files it under… (e.g. Prayer)" in the box; on
  // 25 September 2026 the owner asked for these screens to be less technical,
  // and "files it under" is a filing clerk's phrase. The rule is the same:
  // both forms say the box GROUPS the series, both give an example.
  ok((studies.match(/>\s*Topic\s*<span[^>]*>\([^)]*groups it on the shelf\)<\/span>/g) ?? []).length === 2,
     'both forms say what that box actually does');
  // BOTH of them. A single loose match passes happily while one of the two
  // forms still asks the old, misreadable question -- and the form somebody
  // hits second is the one that teaches them what the box is.
  ok((studies.match(/e\.g\. Prayer/g) ?? []).length === 2,
     'both with an example, so neither needs explaining');
}

// ---------------------------------------------------------------------------
// 4. RENAMING SOMETHING DOES NOT EMPTY IT
// ---------------------------------------------------------------------------
//
// The dangerous half. `description: m.description?.trim() || null` ran on every
// update, and the Rename form sent no description, so renaming one of the
// seeded series deleted the sentence underneath it in silence.
{
  const fn = data.slice(data.indexOf('export async function updateLessonSeries'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  ok(/if \(m\.description !== undefined\) patch\.description/.test(body),
     'the line is written only when a line was offered');
  ok(!/update\(\{[\s\S]*?description: m\.description/.test(body),
     'and never blanked by a caller that simply did not mention it');
  ok(/\.select\('id'\)/.test(body),
     'and the update still asks for the row back, so a silent no-op cannot return "Saved"');
}

// ---------------------------------------------------------------------------
// 5. ONE PAGE, ONE NAME
// ---------------------------------------------------------------------------
{
  const rails = strip(read('components/RoomRails.tsx'));
  const doors = (rails.match(/href: '\/library'/g) ?? []).length;
  ok(doors >= 1, 'the sidebar still has a door to that page');
  ok(!/label: 'Resources'/.test(rails),
     'and it is no longer called Resources, which is where sharing was looked for');
  ok(!/label: 'My Library'/.test(rails),
     'nor called something different depending on who is reading');
  ok(/label: 'My Files'/.test(rails), 'it is My Files');
  ok((rails.match(/label: 'My Files'/g) ?? []).length === 1,
     'written once, so the three roles cannot drift apart again');

  // The two rooms that DO hold what somebody handed you keep their name. The
  // point was never to spend the word; it was to stop spending it on the one
  // room where nothing is shared.
  ok(/label: 'Resources'/.test(strip(read('components/live/GuidePages.tsx'))),
     'the tab where sharing actually lands is still called Resources');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
