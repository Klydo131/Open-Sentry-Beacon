// Emoji are suggested while you type, and never offered to somebody who did not ask.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS. Type a colon and two letters -- `:pra` -- and the matches
// appear above the box. Asked for as part of typing rather than
// as a button, which is the better shape: a grid of four hundred pictures is a
// thing to go hunting in, and the point is to stay in the sentence.
//
// THE TRIGGER HAS TO BE NARROW, AND THIS APP MAKES THAT SHARPER THAN USUAL.
// A colon is punctuation people already type, so a loose rule fires constantly
// in the middle of ordinary writing. The false positive that matters most here
// is a VERSE REFERENCE: `Luke 4:18` must never open a menu. `10:30` and
// `https://` are the same rule and equally unwelcome.
//
// AND NOTHING IS EVER SUGGESTED UNASKED. The obvious "smarter" version watches
// ordinary words and offers a folded-hands when somebody types "pray". That
// would be wrong here and the reason belongs in a test rather than only in a
// comment: this box is where somebody tells their Guide about an illness, a
// marriage in trouble, a bereavement. An app that pops a cheerful picture up
// beside those words has made a joke of them. A colon is a deliberate act.
//
// EVERY CHARACTER IS A REAL EMOJI, and components/Glyph.tsx is why: the
// sign-out button was once an empty tofu box on every Android phone because it
// used a character from Miscellaneous Technical that LOOKS like an emoji. That
// is invisible on the machine this was written on, so it is checked here.
//
//   node tests/emoji-are-suggested-as-you-type.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOJI, suggest, tokenAt, replaceToken, SUGGESTION_LIMIT } from '../lib/live/emoji.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. THE TRIGGER REFUSES THE THINGS PEOPLE ACTUALLY TYPE
// ---------------------------------------------------------------------------
{
  const refuses = [
    ['Luke 4:18', 'a verse reference, the one that matters most here'],
    ['see you at 10:30', 'a time'],
    ['https://example.org', 'a URL'],
    ['a:pray', 'a colon in the middle of a word'],
    ['what : is', 'a colon standing on its own'],
    [':p', 'a single letter, which would match half the list'],
    ['', 'an empty box'],
  ];
  for (const [text, why] of refuses) {
    ok(tokenAt(text, text.length) === null, `no menu for ${why}: ${JSON.stringify(text)}`);
  }

  ok(tokenAt('hello :pra', 10)?.query === 'pra',
     'but a colon starting a word, with two letters after it, does open one');
  ok(tokenAt(':pra', 4)?.query === 'pra',
     'including at the very start of the box');
}

// ---------------------------------------------------------------------------
// 2. WHAT IS OFFERED IS WORTH OFFERING
// ---------------------------------------------------------------------------
{
  ok(suggest('pra')[0]?.names.includes('pray'),
     'typing :pra offers praying hands first');

  // STARTS-WITH BEATS CONTAINS. Without the ordering, a word that merely has
  // the letters somewhere in the middle can outrank the obvious answer.
  const hay = suggest('ca');
  const firstIsStart = hay[0]?.names.some((n) => n.startsWith('ca'));
  ok(firstIsStart, 'and a name that starts with what was typed comes before one that merely contains it');

  ok(suggest('').length === 0, 'nothing is offered for nothing');
  ok(suggest('zzzz').length === 0, 'and nothing for a word that matches nothing');

  const many = EMOJI.flatMap((e) => e.names).filter((n) => n.includes('a'));
  ok(many.length > SUGGESTION_LIMIT && suggest('a').length <= SUGGESTION_LIMIT,
     `the list is capped at ${SUGGESTION_LIMIT}, so it never becomes a wall`);
}

// ---------------------------------------------------------------------------
// 3. CHOOSING REPLACES WHAT WAS TYPED
// ---------------------------------------------------------------------------
//
// The half that is easy to get wrong: appending the emoji and leaving `:pra`
// sitting in the message is worse than having no feature at all.
{
  const { text, caret } = replaceToken('hello :pra', 6, 10, '\u{1F64F}');
  ok(!text.includes(':pra'), 'the typed token is gone, not left beside the emoji');
  ok(text.startsWith('hello \u{1F64F}'), 'and the emoji is where the token was');
  ok(text.endsWith(' '), 'with a space after it, so the next word is not typed onto it');
  ok(caret === text.length, 'and the caret lands after the space');

  // Mid-sentence, with words after the caret that must survive.
  const mid = replaceToken('say :pra then go', 4, 8, '\u{1F64F}');
  ok(mid.text === 'say \u{1F64F} then go', 'text after the caret is kept exactly');
}

// ---------------------------------------------------------------------------
// 4. EVERY CHARACTER IS AN EMOJI, NOT A SYMBOL THAT LOOKS LIKE ONE
// ---------------------------------------------------------------------------
//
// THE TOFU RULE, from components/Glyph.tsx. A character from Miscellaneous
// Technical or Geometric Shapes draws as an empty box on any device whose text
// font lacks it -- which was every Android phone, for the sign-out button.
// Emoji proper are safe. The ones that default to TEXT presentation must carry
// U+FE0F to ask for the colour glyph.
{
  const needsSelector = [];
  const suspicious = [];
  for (const e of EMOJI) {
    const cps = [...e.char].map((c) => c.codePointAt(0));
    const first = cps[0];
    // EVERY ENTRY, NOT ONLY THE OLD ONES. This check first read
    // `first < 0x1F000 && !cps.includes(0xFE0F)`, matching the rule the list
    // was built with -- and both were wrong together, which is the worst kind
    // of agreement. The dove U+1F54A and the rain cloud U+1F327 sit well above
    // U+1F000 and still default to a monochrome text shape, so neither the list
    // nor the check that blessed it would have caught the two entries that
    // actually needed asking. The rule is now the blunt one: everything carries
    // it. See lib/live/emoji.ts for why cheap beats clever here.
    if (!cps.includes(0xFE0F)) needsSelector.push(e.char);
    // The blocks that burned this project before.
    if ((first >= 0x2300 && first <= 0x23FF) || (first >= 0x25A0 && first <= 0x25FF)) {
      suspicious.push(`${e.char} U+${first.toString(16).toUpperCase()}`);
    }
  }
  ok(needsSelector.length === 0,
     `every older character asks for its colour glyph${
       needsSelector.length ? ` (missing on: ${needsSelector.join(' ')})` : ''}`);
  ok(suspicious.length === 0,
     `nothing from the blocks that gave Android a tofu box${
       suspicious.length ? ` (found: ${suspicious.join(', ')})` : ''}`);

  // NAMES ARE TYPEABLE. A name with a space or a capital in it can never be
  // reached, because the token is matched as lowercase letters only.
  const unreachable = EMOJI.flatMap((e) => e.names).filter((n) => !/^[a-z]{2,20}$/.test(n));
  ok(unreachable.length === 0,
     `every name can actually be typed${unreachable.length ? ` (bad: ${unreachable.join(', ')})` : ''}`);

  const dupes = EMOJI.map((e) => e.char).filter((c, i, a) => a.indexOf(c) !== i);
  ok(dupes.length === 0, 'and no emoji is in the list twice');
}

// ---------------------------------------------------------------------------
// 5. ENTER TAKES THE EMOJI INSTEAD OF SENDING THE MESSAGE
// ---------------------------------------------------------------------------
//
// THE ONE THAT WOULD HURT SOMEBODY. On a desktop Enter sends. With a list open,
// reaching for an emoji would otherwise fire off a half-written message -- to
// their Guide, about something that mattered. So the suggestion branch has to
// come BEFORE the send branch, and that order is what is checked.
{
  const box = read('components/MessageBox.tsx');
  // Comments blanked, THEN whitespace collapsed -- and the second half is not
  // tidiness, it is what makes a distance-based check mean anything. Blanking a
  // comment to spaces preserves its LENGTH, so a paragraph explaining a branch
  // pushes the two things being related hundreds of characters apart and the
  // check goes red over prose. That is exactly how the Escape assertion below
  // first failed, and it is the same fault that turned
  // tests/live-conversation-mobile.mjs red in the chunk before this one. The
  // repair there and here is the same: measure the code, not the essay.
  const code = box
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');

  const guard = code.indexOf('if (open) {');
  const send = code.indexOf("if (event.key !== 'Enter') return;");
  ok(guard !== -1 && send !== -1 && guard < send,
     'the open suggestion list gets the Enter key before the send path does');

  ok(/if \(event\.key === 'Enter' \|\| event\.key === 'Tab'\)[\s\S]{0,120}take\(picks\[chosen\]\)/.test(code),
     'and Enter takes the highlighted emoji');

  ok(/event\.key === 'Escape'[\s\S]{0,160}closeSuggestions\(\)/.test(code),
     'Escape dismisses the list without deleting what was typed');

  // ON POINTER-DOWN, NOT CLICK. Blur closes the list, and blur happens first --
  // so a click handler would be on a button that no longer exists.
  ok(/onMouseDown=\{\(event\) => \{ event\.preventDefault\(\); take\(e\); \}\}/.test(code),
     'tapping a suggestion works, because it fires before the box loses focus');

  // A COMBOBOX, ANNOUNCED. A menu appearing under somebody's fingers is
  // invisible to a screen reader unless the box says so.
  for (const attr of ['role="combobox"', 'aria-expanded', 'aria-activedescendant', 'role="listbox"']) {
    ok(code.includes(attr), `the box announces itself properly (${attr})`);
  }
}

// ---------------------------------------------------------------------------
// 6. AND NOTHING IS SUGGESTED FROM ORDINARY WORDS
// ---------------------------------------------------------------------------
//
// The product decision, kept as a check so it cannot be "improved" away by
// somebody who has not thought about who is typing into this box.
{
  const plain = 'my mother died on Tuesday and I am struggling to pray';
  ok(tokenAt(plain, plain.length) === null,
     'a sentence about something hard is never interrupted with a picture');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
