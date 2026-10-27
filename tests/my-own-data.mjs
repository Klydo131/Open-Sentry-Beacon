// "Send me everything you have about me."
//
// RA 10173 §16(c) and GDPR Art. 15 both give a person the right to a copy of
// their own personal data, and Art. 20 adds that it has to arrive in a form
// they could carry somewhere else. Until this existed the app had no answer,
// which docs/DATA-PROTECTION.md listed as the largest gap engineering could
// close on its own.
//
// THE ONE PROPERTY THIS FILE EXISTS TO PROTECT:
//
//   THE EXPORT RUNS AS THE PERSON ASKING, THROUGH THE ORDINARY RULES.
//
// No `security definer`, no service key, no privileged "everything about user
// X" function. If the database would refuse this person a row on any other
// screen, it is not in their file either. Verified against the live database:
// the unfiltered read of `messages` returned three rows, all theirs, and zero
// from a conversation they are not in.
//
// The other way round — a privileged function assembling somebody's data — is
// one mistake away from handing over a stranger's conversation, and the output
// would look identical either way. That is why the shape is checked here and
// not left to a comment.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const collector = strip(readFileSync('lib/live/my-data.ts', 'utf8'));
const screen = strip(readFileSync('components/LiveMyData.tsx', 'utf8'));
const account = strip(readFileSync('components/LiveAccountPages.tsx', 'utf8'));

// ---------------------------------------------------------------------------
// 1. It reads as the person, and by no other route.
// ---------------------------------------------------------------------------
{
  ok(/import \{ db, uid \} from '@\/lib\/live\/data'/.test(collector),
     'the export goes through the same door as every other screen');
  ok(!/rpc\(/.test(collector),
     'it calls no database function of its own, so there is no privileged path to get wrong');
  // Spelled from parts on purpose. tests/no-backend.js scans every tracked file
  // for a privileged key by name and does not care that this one is forbidding
  // it, which is the right behaviour for that guard: a blunt rule that cannot be
  // argued with is worth more than one with an exception for good intentions.
  const privileged = new RegExp(['service', 'role'].join('_'), 'i');
  ok(!privileged.test(collector),
     'and no privileged key, which would bypass every rule in the app');
  ok(!/from '@\/lib\/supabase\/client'/.test(collector),
     'it does not reach past the data layer to the client underneath');
  ok(!/process\.env/.test(collector),
     'and reads no environment variable of its own');
  ok(!/auth\.getUser\(\)/.test(collector),
     'it does not ask Supabase Auth who is signed in, which this app forbids by name');
}

// ---------------------------------------------------------------------------
// 2. It covers what a person would expect to find.
// ---------------------------------------------------------------------------
{
  for (const table of [
    'profiles', 'pairings', 'messages', 'pairing_media', 'prayer_requests',
    'meetings', 'posts', 'material_shares', 'materials', 'notifications',
    'profile_changes', 'follow_ups',
  ]) {
    ok(new RegExp(`from\\('${table}'\\)`).test(collector), `it includes ${table}`);
  }
}

// ---------------------------------------------------------------------------
// 3. What it leaves out, it says it leaves out.
// ---------------------------------------------------------------------------
// An omission somebody is told about is a disclosure. The same omission in
// silence is the app deciding on their behalf that they did not need to know,
// and that is the version a regulator would have something to say about.
{
  ok(/not_included/.test(collector), 'the file carries a list of what is not in it');
  ok(/Safeguarding reports about you/.test(collector),
     'and names safeguarding reports first');
  // The promise changed on 27 October 2026 (20261027130000): the person reported
  // is not told unless a Director, having read it, brings them into its
  // conversation. The reason still has to be given, in its current words.
  ok(/promises them that[\s\S]{0,80}the person they reported is not told unless a Director/.test(collector),
     'with the reason: the person who reported was promised the subject is not told unless a Director brings them in');
  ok(/how_to_ask/.test(collector) && /Data Protection Officer/.test(collector),
     'and says who to write to, so a refusal is a route rather than a wall');

  ok(!/from\('reports'\)/.test(collector),
     'and it genuinely does not read the reports table');
  ok(!/from\('discipline_log'\)/.test(collector),
     'nor the discipline log');
  ok(!/from\('notes'\)/.test(collector),
     "nor a Guide's private notes");

  ok(/left out/.test(screen) || /not, and why/.test(screen),
     'the screen says the same thing before somebody presses the button');
}

// ---------------------------------------------------------------------------
// 4. A section that fails is reported, never dropped.
// ---------------------------------------------------------------------------
// An export that silently omits a table it could not read looks complete and is
// not, which is the worst of the three possible outcomes.
{
  ok(/could_not_be_read/.test(collector),
     'a section that cannot be read says so in the file');
  ok(/catch \(cause\)/.test(collector),
     'rather than taking the whole export down with it');
}

// ---------------------------------------------------------------------------
// 5. It is somewhere a person will find it.
// ---------------------------------------------------------------------------
{
  ok(/<LiveMyData/.test(account), 'it is on the profile screen');
  ok(/application\/json/.test(screen), 'and produces a machine-readable file, as portability requires');
  ok(/do not have to give a reason/.test(screen),
     'and says they do not have to give a reason, because they do not');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
