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
  // While a password was one word and ten characters (28 September to 3
  // October 2026) the space was about eight million, and the birthday maths
  // gave roughly half a duplicate per run -- so "all different" would have
  // failed at random about two runs in five. A guardrail that fails on healthy
  // code is worse than no guardrail, because the habit it teaches is to re-run
  // the gate until it goes quiet.
  //
  // So: allow the collisions chance actually produces, and fail on the far
  // larger number a broken picker would produce. A generator stuck on one word
  // would collide thousands of times, not six. At three words the expected
  // count is about three in a thousand runs, and the allowance still holds.
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
//
// THREE DIFFERENT WORDS AND A TWO-DIGIT NUMBER, JOINED BY DASHES, chosen by
// the owner on 3 October 2026 after that day's security audit. Before
// it, from 28 September, one word and digits made exactly ten characters.
{
  const sample = Array.from({ length: 2000 }, () => firstPassword());

  // The app refuses anything under ten characters, in lib/live/data.ts. A
  // generator that can emit a nine-character password would create accounts
  // whose own password the app would not accept as a replacement.
  const shortest = Math.min(...sample.map((p) => p.length));
  const longest = Math.max(...sample.map((p) => p.length));
  ok(shortest >= 10, `never shorter than the app's own 10-character rule (${shortest})`);
  ok(longest <= 29, `and never longer than three of the longest words and a number (${longest})`);

  const wrong = sample.filter((p) => !/^[a-z]{3,8}-[a-z]{3,8}-[a-z]{3,8}-[1-9][0-9]$/.test(p));
  ok(wrong.length === 0,
     wrong.length ? `every password is three words then a number (bad: ${wrong[0]})` : 'three words, then a two-digit number, joined by dashes');

  // THREE DIFFERENT WORDS, so nobody reads `river-river-lamp` as a typo.
  const repeats = sample.filter((p) => new Set(p.split('-').slice(0, 3)).size !== 3);
  ok(repeats.length === 0, repeats.length ? `a password repeats a word (${repeats[0]})` : 'and the three words are always different');

  // ALL LOWERCASE. Every capital is a shift key on a phone and a place to get
  // it wrong, and there is nothing here that needs the extra alphabet.
  ok(!sample.some((p) => /[A-Z]/.test(p)), 'nothing needs the shift key');
  // The dash is the only character that is not a letter or a digit.
  ok(!sample.some((p) => /[^a-z0-9-]/.test(p)), 'and no symbol but the dash, which the e-mail names');

  // Every word is a real one from the list, not a fragment of one.
  const known = new Set(WORDS);
  const unknown = sample.filter((p) => !p.split('-').slice(0, 3).every((w) => known.has(w)));
  ok(unknown.length === 0,
     unknown.length ? `a password used something that is not a word (${unknown[0]})` : 'and every word is one from the list');

  // The e-mail describes the shape the generator makes, in both its forms.
  const email = read('supabase/functions/invite/email.ts');
  ok((email.match(/Three words and a number, joined by dashes\. No spaces, no capitals\./g) ?? []).length === 2
     && !/ten characters/.test(email),
     'the e-mail says what the password looks like, in the HTML and the plain text');
}

// ---------------------------------------------------------------------------
// 4. How hard it is to guess, computed rather than asserted
// ---------------------------------------------------------------------------
//
// The number is printed so shrinking the word list can never quietly weaken
// every invitation the church sends.
{
  // RAISED ON PURPOSE, 3 OCTOBER 2026. One word and digits was about 23 bits,
  // accepted because sign-in is rate-limited. The audit found that limit is per
  // internet address, which a guesser can rent many of, and that the app's own
  // sign-in reaches Supabase from the server's addresses, not the guesser's. So
  // the password itself has to carry the weight: about 30.5 bits, roughly 180
  // times harder, for three days instead of seven.
  const bits = entropyBits();
  ok(bits >= 30, `roughly ${bits.toFixed(1)} bits to guess, the floor under a temporary password`);
  ok(bits < 34, 'and the report above is not claiming more than three words can give');
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
  ok(/while \(2 \*\* \(8 \* size\) < limit\) size \+= 1/.test(src), 'and the draw widens to reach any list, instead of hanging');

  // A CHEAP EVENNESS CHECK. Not a statistical proof -- it is here to catch a
  // picker that always returns the same index, or one that never reaches the
  // end of the list, which is what a modulo bug actually looks like.
  const seen = new Map();
  const draws = 6000;
  for (let i = 0; i < draws; i += 1) {
    for (const w of firstPassword().split('-').slice(0, 3)) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  ok(seen.size > WORDS.length * 0.95, `the whole list is reachable (${seen.size} of ${WORDS.length} words seen)`);
  const fairShare = (draws * 3) / WORDS.length;
  const most = Math.max(...seen.values());
  ok(most < fairShare * 2,
     `and no single word dominates (most common appeared ${most} times; each expects about ${Math.round(fairShare)})`);
}

// ---------------------------------------------------------------------------
// 6. Every password is as likely as every other
// ---------------------------------------------------------------------------
//
// FOUND ON 28 SEPTEMBER 2026: a picker that chose a word and then its digits
// made some passwords ten times as likely as the rest, and the strength it
// reported was then only true for the unlikely ones. A password is one place in
// a single list, and the draw is one even draw over the places. This checks the
// list really is one place per password.
{
  const total = 2 ** entropyBits();
  const count = Math.round(total);
  ok(Math.abs(total - count) < 1e-3 && count === WORDS.length * (WORDS.length - 1) * (WORDS.length - 2) * 90,
     `the strength is a count of real passwords (${count.toLocaleString('en')})`);

  const W = WORDS;
  ok(passwordAt(0) === `${W[0]}-${W[1]}-${W[2]}-10`, `the list starts with the first three words and 10 (${passwordAt(0)})`);
  ok(passwordAt(count - 1) === `${W[W.length - 1]}-${W[W.length - 2]}-${W[W.length - 3]}-99`,
     `and ends with the last three and 99 (${passwordAt(count - 1)})`);
  let past = false;
  try { passwordAt(count); } catch { past = true; }
  let before = false;
  try { passwordAt(-1); } catch { before = true; }
  ok(past && before, 'and there is nothing past either end');

  // ONE PLACE PER PASSWORD, BOTH WAYS. Reading a password back into its place
  // gives the place it came from, for places all along the list: so no two
  // places make the same password, and one even draw over the places is one
  // even draw over the passwords.
  const placeOf = (pw) => {
    const parts = pw.split('-');
    const left = [...W];
    let place = 0;
    for (let i = 0; i < 3; i += 1) {
      const at = left.indexOf(parts[i]);
      place = place * left.length + at;
      left.splice(at, 1);
    }
    return place * 90 + (Number(parts[3]) - 10);
  };
  let mismatch = '';
  for (let i = 0; i < 4000 && !mismatch; i += 1) {
    const at = Math.floor((i / 4000) * count) + (i % 97);
    if (placeOf(passwordAt(at)) !== at) mismatch = `${at} -> ${passwordAt(at)} -> ${placeOf(passwordAt(at))}`;
  }
  ok(!mismatch, mismatch ? `a password does not read back to its place (${mismatch})` : 'every place reads back to itself, so each password has exactly one place');

  const src = read('supabase/functions/invite/password.ts');
  ok(/return passwordAt\(below\(allPasswords\(\)\)\);/.test(src),
     'a password is ONE even draw over all of them, not words and then digits');

  // THE SAME THING, SEEN IN THE OUTPUT: the number is even across 10 to 99.
  const numbers = Array.from({ length: 4000 }, () => Number(firstPassword().split('-')[3]));
  const high = numbers.filter((n) => n >= 55).length / numbers.length;
  ok(Math.abs(high - 0.5) < 0.05, `numbers 55 to 99 come up half the time, as they should (${(high * 100).toFixed(1)}%)`);
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
