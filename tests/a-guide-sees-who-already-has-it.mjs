// A Guide can see who already has a resource, without opening anything.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The chip that says "Maria has this" was on the row the whole
// time, fenced behind `pairings.length === 1`. So the only Guide it ever spoke
// to was one carrying a single Explorer. A Guide at the cap of five -- exactly
// the person who cannot hold it in their head -- saw nothing, and had to open
// the picker on every row in turn to answer .
//
// The answer was already in memory. `alreadyShared` is loaded for EVERY pairing
// on the screen, not just the first; the fence was the only thing stopping it
// being read. This is a condition removed, not a feature added, which is why
// the check below is about the condition.
//
// WHY THIS IS SAFE AND A CHURCH-WIDE COUNT IS NOT, since the two look alike.
// This is built from `listShares` per pairing, which reads through the
// `shares_read` policy -- `in_pairing(pairing_id)` -- so it can only ever
// contain pairings this person is part of. It is arithmetic on what the browser
// already fetched, not a new disclosure.
//
// A "shared 7 times across the church" badge would be different in kind.
// Migration 0008 states the boundary in its own words: a Director "is shown
// that a Guide is active, never what they sent to whom". In a church with two
// pairings, a Guide who shared something once and sees the count read two has
// learned what the other pairing received. That is the rule this file must not
// be quietly widened into breaking.
//
//   node tests/a-guide-sees-who-already-has-it.mjs
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

// ---------------------------------------------------------------------------
// 1. THE FENCE IS GONE
// ---------------------------------------------------------------------------
//
// THE ACTUAL FAULT, stated as itself. A check that the chip merely EXISTS
// passes just as happily with the fence back in place -- that is the state this
// replaces, and it is the reason this check names the condition rather than the
// component.
{
  ok(!/pairings\.length === 1 && \(alreadyShared\.get/.test(lib),
     'the row no longer hides who has it from a Guide with more than one Explorer');

  ok(/const haveIt = pairings\.filter\(/.test(lib),
     'and it answers by counting every pairing on the screen, not just the first');
}

// ---------------------------------------------------------------------------
// 2. IT READS ONLY THIS GUIDE'S OWN SHARES
// ---------------------------------------------------------------------------
//
// The boundary. `alreadyShared` must keep coming from the per-pairing read,
// because that is what the policy scopes. If this is ever fed by a definer
// function returning church-wide totals, the chip stops being arithmetic on
// your own data and starts being a disclosure -- and it will look identical on
// screen, which is what makes it worth a check.
{
  ok(/live\.listShares\(p\.id\)/.test(lib),
     "the history is built from the Guide's own pairings, through the shares_read policy");

  ok(!/share_counts|shared_times|library_share_count/i.test(lib),
     'and no church-wide share total is read anywhere on this screen');
}

// ---------------------------------------------------------------------------
// 3. IT SAYS NAMES WHILE THEY FIT, AND A COUNT WHEN THEY DO NOT
// ---------------------------------------------------------------------------
//
// "1 of 5 have this" makes somebody open the picker to find out WHICH one,
// which is the exact work this chip exists to remove. A name answers it.
{
  ok(/has this/.test(lib) && /have this/.test(lib),
     'it is written for one person and for several');
  ok(/and \$\{first\(haveIt\[1\]\)\} have this/.test(lib),
     'two people are both named rather than counted');
  ok(/\$\{haveIt\.length\} of \$\{pairings\.length\} have this/.test(lib),
     'and a count takes over once the names would not fit');
  ok(/All \$\{pairings\.length\} have this/.test(lib),
     'with everybody having it said as everybody, not as five of five');
}

// ---------------------------------------------------------------------------
// 4. AND IT IS SILENT WHEN NOTHING HAS BEEN SHARED
// ---------------------------------------------------------------------------
//
// A "Not shared yet" badge on every row would decorate a whole fresh shelf to
// announce that nothing has happened, which is the one thing somebody can
// already see.
{
  ok(/if \(haveIt\.length === 0\) return null;/.test(lib),
     'a row nobody has yet carries no chip at all');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
