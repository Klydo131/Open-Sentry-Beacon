// The library can be narrowed by name and by kind, and says what it did.
//
// ---------------------------------------------------------------------------
// WHY. The shelf is one list, newest first. At twelve items that is fine; the
// church is adding roughly one a week and at sixty it is unusable, and the
// person who suffers first is a Guide hunting for the video they shared once.
//
// Search already existed and covers title, description and address. What was
// missing was the other question. "Video" typed into a search box reads the
// WORD video in a title and a description, which is not the same question as
// "show me the videos" and answers it wrong in both directions -- it misses a
// video called "Baptism explained" and finds an article about videos.
//
// THE FAILURE THIS GUARDS AGAINST is a filter that empties the screen with no
// explanation. An empty list reads as a broken library, not as a narrow search,
// and somebody who does not know which of two controls did it has no way back.
//
//   node tests/the-shelf-can-be-narrowed.mjs
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

const ui = read('components/LiveLibrary.tsx');

// ---------------------------------------------------------------------------
// 1. BOTH QUESTIONS, AND THEY NARROW TOGETHER
// ---------------------------------------------------------------------------
{
  ok(/type="search"/.test(ui), 'the shelf still has its search box');
  ok(/const \[shelfKind, setShelfKind\]/.test(ui), 'and a kind to filter by');

  // AND, NOT OR. A person who typed a word and then tapped Videos is narrowing
  // twice on purpose; an OR widens the list at the moment they asked for less.
  ok(/matchesText\(m\) && \(!shelfKind \|\| m\.kind === shelfKind\)/.test(ui),
     'the two narrow together rather than widening each other');

  // The search still reads all three fields it used to.
  ok(/m\.title\.toLowerCase\(\)\.includes\(needle\)/.test(ui)
     && /description \?\? ''\)\.toLowerCase\(\)\.includes\(needle\)/.test(ui)
     && /\(m\.external_url \?\? m\.file_name \?\? ''\)\.toLowerCase\(\)\.includes\(needle\)/.test(ui),
     'and the search still covers name, description and address (or a file\'s name)');
}

// ---------------------------------------------------------------------------
// 2. NO CHIP THAT CAN ONLY EVER EMPTY THE SCREEN
// ---------------------------------------------------------------------------
{
  ok(/kindsPresent/.test(ui) && /kindCounts/.test(ui),
     'the chips are built from what is actually on the shelf');
  ok(/kindsPresent\.length > 1 &&/.test(ui),
     'and are drawn only when there is more than one kind to choose between');

  // THE COUNTS MUST NOT FOLLOW THE SEARCH BOX. A chip whose number changed as
  // somebody typed would be measuring the search rather than the shelf, and the
  // point of it is to say what is there.
  const counts = ui.slice(ui.indexOf('const kindCounts'), ui.indexOf('const kindsPresent'));
  ok(!/needle/.test(counts), 'the counts describe the shelf, not the current search');
}

// ---------------------------------------------------------------------------
// 3. IT SAYS WHAT IT DID, AND OFFERS THE WAY BACK
// ---------------------------------------------------------------------------
//
// The whole point of the file.
{
  ok(/\{shown\.length\} of \{items\?\.length \?\? 0\}/.test(ui),
     'the result line says how much of the shelf is showing');
  ok(/shelfKind && `[^`]*KIND_LABEL\[shelfKind\]/.test(ui),
     'and names the kind when one is chosen');
  ok(/needle && `[^`]*matching/.test(ui),
     'and the words when something was typed');

  ok(/Show everything again/.test(ui),
     'an empty result offers the way back rather than looking like a broken shelf');
  const back = ui.slice(ui.indexOf('Show everything again') - 400, ui.indexOf('Show everything again'));
  ok(/setFind\(''\)/.test(back) && /setShelfKind\(''\)/.test(back),
     'and that way back clears BOTH controls, not the one somebody remembers');
}

// ---------------------------------------------------------------------------
// 4. THE CHIPS ARE REAL CONTROLS
// ---------------------------------------------------------------------------
{
  ok(/aria-pressed=\{shelfKind === ''\}/.test(ui) && /aria-pressed=\{shelfKind === k\}/.test(ui),
     'each chip says whether it is the one currently on');
  ok(/tap-sm/.test(ui.slice(ui.indexOf('kindsPresent.length > 1'), ui.indexOf('kindsPresent.length > 1') + 1600)),
     'and is a real touch target rather than a word to poke at');
  // Tapping the chip that is already on turns it off, which is what a person
  // expects of a thing drawn as pressed.
  ok(/setShelfKind\(shelfKind === k \? '' : k\)/.test(ui),
     'tapping the chosen kind again shows everything, rather than trapping them in it');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
