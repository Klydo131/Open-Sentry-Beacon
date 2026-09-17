// An empty picker says which kind of empty it is.
//
// ---------------------------------------------------------------------------
// REPORTED AS A BUG, WITH A SCREENSHOT: "Pair a Guide and Explorer" with the
// Explorer box reading "No explorers to choose yet" and Create pairing greyed
// out.
//
// THE CONTROL WAS RIGHT AND THE SENTENCE WAS WRONG. The picker offers only
// Explorers who have no Guide, and in that church every approved Explorer
// already had one, so the list was correctly empty. But "no Explorers to choose
// YET" means none exist, and a Director looking at a roster of fourteen
// Explorers and a picker saying there are none concludes the screen is broken.
// There was no way to tell a fully-paired church from a failed load.
//
// WHAT THIS HOLDS. That the two cases produce different words, and that the
// filtered case explains what to do instead. Asserted against the source rather
// than a running church, because the state that triggers it -- every Explorer
// paired -- is a state a browser walk cannot arrange without a church in it.
//
//   node tests/a-picker-says-why-it-is-empty.mjs
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

const stripTs = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const picker = stripTs(read('components/live/shared.tsx'));
const admin = stripTs(read('components/live/AdminPage.tsx'));

// ---------------------------------------------------------------------------
// 1. THE CONTROL CAN SAY SOMETHING OTHER THAN "yet"
// ---------------------------------------------------------------------------
{
  ok(/emptyLabel\??:\s*string/.test(picker),
     'a picker can be given different words for an empty list');
  ok(/emptyLabel \?\? `No \$\{noun\}s to choose yet`/.test(picker),
     'and falls back to the old sentence when nothing better is offered');
  ok(/emptyNote/.test(picker),
     'and can carry a line saying what to do about it');

  // THE NOTE ONLY APPEARS WHEN THERE IS NOTHING TO CHOOSE. A hint under a
  // working control is noise, and noise under every picker is how people stop
  // reading the one that matters.
  ok(/!loading && people\.length === 0 && emptyNote/.test(picker),
     'the explanation appears only when the list is actually empty');
}

// ---------------------------------------------------------------------------
// 2. THE PAIRING FORM DISTINGUISHES THE TWO EMPTINESSES
// ---------------------------------------------------------------------------
{
  const form = admin.slice(admin.indexOf('Pair a Guide and Explorer'));
  const explorerPicker = form.slice(form.indexOf('label="Explorer"'), form.indexOf('label="Explorer"') + 1400);

  ok(/Everybody already has a Guide/.test(explorerPicker),
     'a church where everybody is paired says so, rather than "none yet"');
  ok(/explorers\.length === 0/.test(explorerPicker),
     'and a church with no Explorers at all is told apart from it');
  ok(/end their pairing/i.test(explorerPicker),
     'and the note says what to do to pair somebody differently');

  // THE GUIDE SIDE HAS THE SAME FAILURE AVAILABLE TO IT. A church with no
  // Guides is a real state on day one, and the picker there would have read the
  // same way.
  const guidePicker = form.slice(form.indexOf('label="Guide"'), form.indexOf('label="Guide"') + 700);
  ok(/emptyNote/.test(guidePicker), 'the Guide picker explains an empty list too');
}

// ---------------------------------------------------------------------------
// 3. AND THE RULE BEHIND IT IS STILL THE RULE
// ---------------------------------------------------------------------------
//
// One Guide per Explorer is why the list filters at all. If that ever stops
// being true the filter should go, and this assertion should be what notices.
{
  ok(/freeExplorers/.test(admin),
     'the pairable list is named rather than computed inline twice');
  ok(/!pairings\.some\(\(p\) => p\.ds_id === explorer\.id && p\.status === 'active'\)/.test(admin),
     'and it is still "an Explorer who has no active Guide"');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
