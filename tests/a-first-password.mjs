// The password an invitation e-mails somebody.
//
// WHY THE INVITATION CARRIES ONE AT ALL. It used to carry a one-time link, and
// a one-time link is fragile in ways nobody invited to a church app should have
// to understand. It expires. It is spent by the first thing that opens it,
// which on many mail systems is a scanner and not a person. It works once, so a
// second tap fails. Twenty-three people were once stuck at the same moment,
// each holding an account with no password and a link already used.
//
// WHAT IT HAS TO BE. Readable off a phone screen, typable on a phone keyboard
// by somebody in their seventies, and sayable down a telephone to a person who
// is stuck. That rules out `xK7#pQ2v` on all three counts.
//
//   node tests/a-first-password.mjs
//
// Runs the real generator. Needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDS, entropyBits, firstPassword, passwordAt } from '../supabase/functions/invite/password.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---------------------------------------------------------------------------
// 1. The word list
// ---------------------------------------------------------------------------
ok(WORDS.length >= 200, `there are enough words to draw from (${WORDS.length})`);
ok(new Set(WORDS).size === WORDS.length, 'and none of them is in the list twice');
{
  const wrong = WORDS.filter((w) => !/^[a-z]{3,8}$/.test(w));
  ok(wrong.length === 0,
     wrong.length
       ? `every word is 3-8 plain lowercase letters (bad: ${wrong.join(', ')})`
       : 'every word is 3-8 plain lowercase letters, so there is nothing to spell wrong');
}

// ---------------------------------------------------------------------------
// 2. IT TERMINATES
// ---------------------------------------------------------------------------
//
// THE BUG THIS PINS, WHICH WAS REAL AND WAS MINE. The picker drew ONE random
// byte and rejected values that would bias the choice. One byte cannot address
// more than 256 things, and the list shipped with 272 words: the rejection
// ceiling computed to zero, nothing was ever accepted, and `firstPassword()`
// LOOPED FOREVER. Not a weak password -- no password at all, and an edge
// function that never answers the Director who pressed Send.
//
// It was caught by running the thing rather than reading it, which is the only
// reason it is not in the repository. So this test runs it, many times, and any
// regression hangs here instead of in production.
{
  const started = Date.now();
  const seen = new Set();
  const N = 3000;
  for (let i = 0; i < N; i += 1) seen.add(firstPassword());
  const ms = Date.now() - started;
  ok(true, `${N} passwords generated in ${ms}ms without hanging`);

  // NOT "ALL OF THEM WERE DIFFERENT", WHICH IS THE WRONG TEST AND WAS FLAKY.
  //
  // It was right while a password was three words and a number: fifteen billion
  // possibilities, so a repeat in three thousand draws really would have meant
  // the randomness was broken. At ten characters the space is about eight
  // million, and the birthday maths gives roughly half a duplicate per run --
  // so that check would have failed at random about two runs in five. A
  // guardrail that fails on healthy code is worse than no guardrail, because
  // the habit it teaches is to re-run the gate until it goes quiet.
  //
  // So: allow the collisions chance actually produces, and fail on the far
  // larger number a broken picker would produce. A generator stuck on one word
  // would collide thousands of times, not six.
  const space = 2 ** entropyBits();
  const expected = (N * (N - 1)) / (2 * space);
  const allowed = Math.max(5, Math.ceil(expected * 10));
  const duplicates = N - seen.size;
  ok(duplicates <= allowed,
     `duplicates stay near what chance gives (${duplicates}, expected about ${expected.toFixed(2)}, allowed ${allowed})`);
}

// ---------------------------------------------------------------------------
// 3. The shape, on real output
// ---------------------------------------------------------------------------
{
  const sample = Array.from({ length: 2000 }, () => firstPassword());

  // The app refuses anything under ten characters, in lib/live/data.ts. A
  // generator that can emit a nine-character password would create accounts
  // whose own password the app would not accept as a replacement.
  const shortest = Math.min(...sample.map((p) => p.length));
  ok(shortest >= 10, `never shorter than the app's own 10-character rule (${shortest})`);

  // EXACTLY TEN, NOT AT LEAST TEN. Asked for directly: "just make a word with
  // numbers in a 10 letter password." A generator that sometimes emitted
  // eleven would still pass a `>= 10` check while quietly ignoring the ask.
  const lengths = new Set(sample.map((p) => p.length));
  ok(lengths.size === 1 && lengths.has(10),
     `every password is exactly ten characters (saw: ${[...lengths].join(', ')})`);

  const wrong = sample.filter((p) => !/^[a-z]{5,6}[1-9][0-9]{3,4}$/.test(p));
  ok(wrong.length === 0,
     wrong.length ? `every password is one word then digits (bad: ${wrong[0]})` : 'one word, then digits');

  // NO HYPHEN. At ten characters a separator costs a tenth of the whole
  // password and buys nothing, and it is a character people leave out.
  ok(!sample.some((p) => p.includes('-')), 'and nothing to leave out, because there is no hyphen');

  // ALL LOWERCASE. Every capital is a shift key on a phone and a place to get
  // it wrong, and there is nothing here that needs the extra alphabet.
  ok(!sample.some((p) => /[A-Z]/.test(p)), 'nothing needs the shift key');
  // No character a person has to be told the name of.
  ok(!sample.some((p) => /[^a-z0-9]/.test(p)), 'and no symbol anybody has to describe out loud');

  // A NUMBER THAT NEVER STARTS WITH A ZERO. `047` gets typed as `47`, and the
  // person then cannot sign in and has no idea why.
  const leadingZero = sample.filter((p) => /^[a-z]+0/.test(p));
  ok(leadingZero.length === 0, 'the number never starts with a zero, which people drop when typing');

  // The word is a real one from the list, not a fragment of one.
  const known = new Set(WORDS);
  const unknown = sample.filter((p) => !known.has(p.replace(/[0-9]+$/, '')));
  ok(unknown.length === 0,
     unknown.length ? `a password used something that is not a word (${unknown[0]})` : 'and the word is always one from the list');
}

// ---------------------------------------------------------------------------
// 4. How hard it is to guess, computed rather than asserted
// ---------------------------------------------------------------------------
//
// The number is printed so shrinking the word list can never quietly weaken
// every invitation the church sends. It is a TEMPORARY credential on a
// rate-limited online sign-in, not a secret meant to survive an offline attack
// -- the email says to change it and the app asks again.
{
  // THIS FLOOR WAS LOWERED ON PURPOSE, AND THE NUMBER IS THE POINT.
  //
  // Three hyphenated words and three digits was about 34 bits. One word and a
  // number, at ten characters, is about 23 -- roughly eight million
  // possibilities rather than fifteen billion. That is a real reduction and it
  // was made knowingly, because a twenty-two character password wraps in a mail
  // client and is a long way to look between reading and typing.
  //
  // What keeps it defensible is what the credential is: temporary, on a
  // rate-limited online sign-in, for an account that must also be approved, with
  // the e-mail and the app both asking the person to change it. The check stays
  // here so that shrinking the word list further can never quietly take another
  // few bits off every invitation the church sends.
  const bits = entropyBits();
  ok(bits >= 22, `roughly ${bits.toFixed(1)} bits to guess, the floor under a temporary password`);
  ok(bits < 30, 'and the report above is not silently claiming the old strength');
}

// ---------------------------------------------------------------------------
// 5. The draw is even, and sizes itself
// ---------------------------------------------------------------------------
{
  const src = read('supabase/functions/invite/password.ts');
  ok(/crypto\.getRandomValues/.test(src), 'the randomness is the cryptographic kind');
  ok(!/Math\.random/.test(src), 'and not Math.random, which is predictable');
  // Rejection rather than a remainder: `byte % 200` makes the first 56 words
  // more likely than the rest.
  ok(/ceiling/.test(src) && /% limit/.test(src), 'out-of-range draws are rejected rather than folded');
  // The fix for the hang above: the draw widens instead of assuming one byte.
  ok(/limit > 256/.test(src), 'and the draw widens for a list of more than 256, instead of hanging');

  // A CHEAP EVENNESS CHECK. Not a statistical proof -- it is here to catch a
  // picker that always returns the same index, or one that never reaches the
  // end of the list, which is what a modulo bug actually looks like.
  // STRIP THE DIGITS, DO NOT SPLIT ON A HYPHEN. This used to say
  // `firstPassword().split('-')[0]`, which was correct while passwords had
  // hyphens in them. Without one it returns the WHOLE password, so the map
  // counted six thousand distinct passwords instead of the words inside them --
  // and then cheerfully reported that the word list was reachable and no word
  // dominated. Both assertions passed, neither measured anything, and a picker
  // jammed on a single word would have sailed through.
  const usable = WORDS.filter((w) => w.length === 5 || w.length === 6);
  const first = new Map();
  for (let i = 0; i < 6000; i += 1) {
    const w = firstPassword().replace(/[0-9]+$/, '');
    first.set(w, (first.get(w) ?? 0) + 1);
  }
  ok(first.size > usable.length * 0.95,
     `the whole list is reachable (${first.size} of ${usable.length} usable words seen)`);
  // A five-letter word has ten times the numbers after it that a six-letter
  // one has, so it is drawn ten times as often (section 6). "Dominates" is
  // measured against what a five-letter word should get, with room to spare: a
  // picker jammed on one word would give it all six thousand.
  const total = 2 ** entropyBits();
  const fairShare = 6000 * 90000 / total;
  const most = Math.max(...first.values());
  ok(most < fairShare * 2,
     `and no single word dominates (most common appeared ${most} times in 6000; a five-letter word expects about ${Math.round(fairShare)})`);
}

// ---------------------------------------------------------------------------
// 6. Every password is as likely as every other
// ---------------------------------------------------------------------------
//
// FOUND ON 28 SEPTEMBER 2026, BY THE REPEAT COUNT IN SECTION 2 FAILING ON ONE
// RUNNER. The picker chose a word evenly and then its digits, so a password
// after a six-letter word (9,000 numbers) was ten times as likely as one after
// a five-letter word (90,000). The repeat count expected about 0.54 in three
// thousand and the real rate was about 1.6; and the "23 bits" above was the
// count of possibilities, which is only the strength when each is equally
// likely. For the likeliest passwords it was about 20.6.
{
  const usable = WORDS.filter((w) => w.length === 5 || w.length === 6);
  const total = 2 ** entropyBits();
  ok(Number.isInteger(Math.round(total)) && Math.abs(total - Math.round(total)) < 1e-6,
     `the strength is a count of real passwords (${Math.round(total).toLocaleString('en')})`);

  // Walk the whole list by its runs: each word's first and last place hold that
  // word with its smallest and largest number, and the runs add up to the
  // count the strength is worked out from. So every password has one place,
  // and one draw over the places is one draw over the passwords.
  let at = 0;
  let wrongRun = '';
  for (const word of usable) {
    const digits = 10 - word.length;
    const run = 9 * 10 ** (digits - 1);
    if (passwordAt(at) !== `${word}${10 ** (digits - 1)}`
        || passwordAt(at + run - 1) !== `${word}${10 ** digits - 1}`) {
      wrongRun = `${word}: ${passwordAt(at)} .. ${passwordAt(at + run - 1)}`;
      break;
    }
    at += run;
  }
  ok(!wrongRun, wrongRun ? `a word's run of numbers is wrong (${wrongRun})` : 'every word owns a run of numbers, from its smallest to its largest');
  ok(at === Math.round(total), `and the runs add up to the whole count (${at.toLocaleString('en')})`);
  let past = false;
  try { passwordAt(at); } catch { past = true; }
  ok(past, 'and there is nothing past the last password');

  const src = read('supabase/functions/invite/password.ts');
  ok(/return passwordAt\(below\(allPasswords\(\)\)\);/.test(src),
     'a password is ONE even draw over all of them, not a word and then digits');
  ok(/limit > 65536 \? 4/.test(src), 'and the draw widens to four bytes to reach eight million');

  // THE SAME THING, SEEN IN THE OUTPUT. When every password is equally likely,
  // six-letter words carry their share of the count, about one in ten. The old
  // picker gave them their share of the WORDS, about one in two.
  const sixShare = usable.filter((w) => w.length === 6).length * 9000 / total;
  const draws = Array.from({ length: 3000 }, () => firstPassword());
  const six = draws.filter((p) => /^[a-z]{6}[0-9]/.test(p)).length / draws.length;
  ok(Math.abs(six - sixShare) < 0.05,
     `six-letter words come up at their share of the passwords (${(six * 100).toFixed(1)}%, expected ${(sixShare * 100).toFixed(1)}%)`);
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
