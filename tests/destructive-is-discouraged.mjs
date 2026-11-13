// The most damaging button on a screen is never the most inviting one.
//
// THE REPORT, from a Director's pairings screen: 
//
// Disconnecting two people, or removing somebody from the church, is something
// a Director must be able to do and should almost never want to. It was drawn
// as an ordinary `ghost` button: same height, same weight, same everything as
// the controls around it, which is precisely how a screen says "this action is
// routine". Four other places had already noticed and patched a red TEXT colour
// on top of a ghost button, which made them red and left them full size.
//
// So: one `danger` variant, smaller than an ordinary button and the only red
// thing in the app, and a rule that destructive actions use it.
//
// WHY THE RULE IS ON THE SOURCE. Nothing renders here — these are live screens
// behind a database session this sandbox does not have. And the failure is not
// a crash: it is a button that looks a little too willing, which nobody notices
// until a Director taps the wrong one and somebody's conversation is gone.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.tsx$/.test(name) ? [full.split(path.sep).join('/')] : [];
});
const files = [...walk('components'), ...walk('app')];

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// 1. The variant exists, and is smaller and red.
// ---------------------------------------------------------------------------
{
  const ui = readFileSync('components/ui.tsx', 'utf8');
  ok(/variant\?: .*'danger'/.test(ui), 'Button offers a danger variant');
  ok(/danger:\s*'[^']*text-red-700/.test(ui), 'and it is red');
  ok(/danger:\s*'[^']*bg-white/.test(ui),
     'on white rather than filled, so it reads as a warning and not a call to action');

  // SMALLER. `tap` is 56px; `tap-sm` is 44. The point of the whole change.
  const size = ui.slice(ui.indexOf('const size ='), ui.indexOf('const size =') + 220);
  ok(/danger/.test(size) && /tap-sm/.test(size),
     'a danger button is 44px, not the 56px of an ordinary one');
  ok(/tap px-5 text-lg/.test(size), 'and an ordinary button keeps its full size');
  // Still pressable. Discouraged is not the same as fiddly, and 44px is the
  // floor for a touch target.
  const css = readFileSync('app/globals.css', 'utf8');
  ok(/\.tap-sm\s*\{[^}]*min-height:\s*44px/s.test(css),
     'and 44px is still a real touch target, not a trap');
}

// ---------------------------------------------------------------------------
// 2. Nothing patches red onto an ordinary button any more.
// ---------------------------------------------------------------------------
// That was the shape a danger button took before there was one: `variant=ghost`
// plus `className="text-red-700"`. Red, and full size.
{
  const offenders = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    if (/variant="ghost"[\s\S]{0,80}className="text-red-700"/.test(src)) offenders.push(file);
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these paint an ordinary button red instead of using the variant:\n        ${offenders.join('\n        ')}`
      : 'nothing paints an ordinary button red instead of using the variant');
}

// ---------------------------------------------------------------------------
// 3. Every destructive action uses it.
// ---------------------------------------------------------------------------
// The words a person reads on the button. If it says Delete, Remove, Disconnect
// or Disapprove and it is a <Button>, it is destructive and must look it.
{
  // ANY LABEL CONTAINING ONE OF THESE WORDS, not a list of the exact labels
  // that existed when this was written.
  //
  // It WAS that list. A new group board then shipped a button reading "Delete
  // my post", which is destructive, is drawn as an ordinary ghost button, and
  // was never checked — because "Delete my post" was not one of the eight
  // strings the rule knew. A rule that has to be edited every time somebody
  // writes a new label is a rule that is out of date the moment it passes.
  const WORDS = /\b(Delete|Remove|Disconnect|Disapprove|Erase|Wipe|Revoke)\b/i;
  const offenders = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    // FOUND FROM THE LABEL BACKWARDS, not from the opening tag forwards.
    //
    // The first version matched `<Button([\s\S]*?)>` for the props, and that
    // is wrong in a way that made this whole rule useless: an onClick contains
    // an arrow function, so the lazy match stopped at the `>` inside `=>`.
    // Props came out as `variant="ghost" onClick={() =`, the label as the rest
    // of the handler, and a ghost Delete button sailed through. The control
    // that was meant to prove this rule works did not fail, which is how it
    // was caught.
    // BOTH <Button> AND A RAW <button>. "Remove Explorer" was a hand-rolled
    // <button> with red classes and small padding, and it escaped a rule that
    // only looked at the shared component. It rendered at 56px anyway: every
    // button in the app has a 56px floor in globals.css, so padding cannot make
    // one smaller. Only tap-sm can, and only the danger variant sets it.
    // PUNCTUATION AND INTERPOLATION COUNT. The first version of this only
    // matched labels made of letters and spaces, so `Yes, remove them` and
    // `Yes, remove {m.full_name}` — the two buttons in the trial room that
    // actually carry out the removal — were invisible to it. The label the
    // person reads is not always a bare word, and the most dangerous ones
    // never are: they name the person.
    for (const m of src.matchAll(/>([^<>]{1,90})<\/(Button|button)>/g)) {
      const label = m[1].replace(/\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
      const tag = m[2];
      if (!label || !WORDS.test(label)) continue;
      const opening = src.lastIndexOf(`<${tag}`, m.index);
      if (opening === -1) continue;
      const props = src.slice(opening, m.index);
      if (/variant="danger"/.test(props)) continue;
      // A HAND-ROLLED CONTROL IS ALLOWED IF IT IS VISIBLY RED.
      //
      // Not everything destructive should be a boxed button. The library's
      // file rows and the playlist's track rows are dense, and a red block on
      // each would shout; what matters there is that the irreversible control
      // is not drawn in the same grey as a caption, which is how several of
      // them were. So the rule is the principle, not a shape: red text, or a
      // red background, by class or by inline style.
      //
      // Written this way after stacking two narrow exemptions for the same
      // idea — an underlined red link, then a specific inline hex. A rule made
      // of special cases is one nobody can predict.
      const red = /text-red-\d{3}|bg-red-\d{3}|backgroundColor:\s*'#[Bb]4/.test(props);
      if (tag === 'button' && red) continue;
      const line = src.slice(0, opening).split('\n').length;
      offenders.push(`${file}:${line}  "${label}" (${tag === 'button' ? 'a hand-rolled button' : 'shared Button'})`);
    }
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these destructive buttons are drawn as ordinary ones:\n        ${offenders.join('\n        ')}`
      : 'every destructive button uses the danger variant');
}

// ---------------------------------------------------------------------------
// 4. The pairing row, which is where this was reported.
// ---------------------------------------------------------------------------
{
  const admin = stripComments(readFileSync('components/live/AdminPage.tsx', 'utf8'));
  ok(/variant="danger"[\s\S]{0,900}Disconnect/.test(admin),
     'Disconnect on the pairings row is a danger button');

  // AND THE THING BESIDE IT IS NOT A BUTTON. The second journey stage is
  // called "Connect", so a grey pill reading "Connect" sat next to a large
  // button reading "Disconnect" and the two read as a choice. That is exactly
  // how it was reported. It now says what it is.
  ok(/Stage · \{stageInfo/.test(admin) || /Stage · \{stageInfo/.test(admin),
     'the journey stage says it is a stage, so it cannot be read as a button');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
