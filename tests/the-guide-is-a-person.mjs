// An Explorer must be able to see that their Guide is a real person.
//
// THE REPORT: 
//
// The Explorer's home screen said "Walking with you" and then a name on a line.
// Everything else on that screen is generated — the greeting, the stages, the
// notifications — so a name in the same typeface as the rest of it is not
// evidence of anybody. The whole product rests on the Explorer believing a
// person is reading what they write.
//
// THE SECOND HALF, and the reason this file exists rather than just a diff: a
// card that shows a person's details is one query away from showing too many of
// them. `pairedProfile` reads a Guide's row from an Explorer's browser, and the
// short column list is the only thing standing between that and a birthday.
// Row-level security decides WHICH row; nothing but this list decides which
// COLUMNS, so the list is checked here and a `select('*')` fails the build.
//
// WHY THE RULE IS ON THE SOURCE. This screen needs a database session the
// sandbox does not have, so it cannot be rendered. The failure is not a crash
// either: it is a screen that quietly goes back to two initials on a circle.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const explorer = stripComments(readFileSync('components/live/ExplorerPage.tsx', 'utf8'));
const data = stripComments(readFileSync('lib/live/data.ts', 'utf8'));
const guides = stripComments(readFileSync('components/live/GuidePages.tsx', 'utf8'));

// ---------------------------------------------------------------------------
// 1. The Explorer's screen draws a face, not only a name.
// ---------------------------------------------------------------------------
{
  ok(/live\s*\.\s*pairedProfile\(/.test(explorer),
     "the Explorer's screen loads their Guide's profile");
  ok(/<Avatar[\s\S]{0,200}photo=\{/.test(explorer),
     'and draws it as a picture, not only initials');
  ok(/live\s*\.\s*avatarUrl\(/.test(explorer),
     'signing the photo at render time, because a stored signed URL expires');

  // The name was already there and must stay there whatever the profile read
  // does. A slow or failed lookup that blanked the name would be a worse
  // screen than the one this replaced.
  ok(/pairing\.dm_name/.test(explorer),
     "the Guide's name comes from the pairing, so it draws before the profile arrives");
  ok(/Only you and your Guide can read this conversation\./.test(explorer),
     'and the line about who can read the conversation is still on the card');
}

// ---------------------------------------------------------------------------
// 2. The column list is the access control.
// ---------------------------------------------------------------------------
{
  const start = data.indexOf('export async function pairedProfile');
  ok(start > -1, 'pairedProfile exists');
  const body = data.slice(start, data.indexOf('\n}', start));

  const columns = /\.select\('([^']*)'\)/.exec(body)?.[1] ?? '';
  ok(columns.length > 0 && !columns.includes('*'),
     `pairedProfile names its columns rather than selecting everything (${columns || 'nothing'})`);

  // The ones that would be a leak. journey_stage is the same mistake
  // getMyPairing was written to avoid: the stage is a judgement about a person
  // and does not belong in the browser of the person it is about, nor does a
  // Guide's private detail belong in an Explorer's.
  const forbidden = [
    'birthday', 'guardian_consent_at', 'preferred_contact', 'journey_stage',
    'gender', 'life_status', 'signup_completed_at', 'email',
  ];
  const leaked = forbidden.filter((c) => columns.split(',').map((s) => s.trim()).includes(c));
  ok(leaked.length === 0,
     leaked.length
       ? `pairedProfile hands the Explorer: ${leaked.join(', ')}`
       : 'and none of them is a detail the Guide did not choose to publish');

  // A control that would fail if the check above could not see the list.
  ok(columns.split(',').map((s) => s.trim()).includes('full_name'),
     'the check is reading a real column list (full_name is in it)');
}

// ---------------------------------------------------------------------------
// 3. There has to be a picture for the card to draw.
// ---------------------------------------------------------------------------
// Of 26 Guides in the live church, one had a photo and none had chosen an
// icon. Shipping the card alone would have shown 25 Explorers a pair of
// initials and proved nothing. The Guide's own home asks them for one, and
// stops asking the moment either is set.
{
  ok(/!profile\.photo_path && !profile\.avatar/.test(guides),
     "the Guide's home asks for a picture only when there is neither photo nor icon");
  ok(/href="\/profile"/.test(guides),
     'and points at the screen where the picker actually is');

  const account = stripComments(readFileSync('components/LiveAccountPages.tsx', 'utf8'));
  ok(/<LiveFacePicker \/>/.test(account),
     'which is where the picker is');
  // The banner on that screen drew initials for somebody who had a photo, with
  // the photo itself visible in the picker directly beneath it.
  ok(/<Avatar[\s\S]{0,200}photo=\{face/.test(account),
     'and the profile banner shows the picture the person actually uploaded');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
