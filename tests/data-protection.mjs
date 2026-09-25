// The promises a privacy notice makes have to be true in the code.
//
// A notice is the easiest document in a product to let drift, because nothing
// breaks when it does. It says photographs are stripped of location; if
// somebody removes the line that does that, the notice becomes a false
// statement to a regulator rather than a stale comment.
//
// WHY ANY OF THIS EXISTS. Under the Philippine Data Privacy Act (RA 10173,
// §3(l)) a person's age, marital status and religious affiliation are SENSITIVE
// personal information. This app records a birthday, a life status, and the
// whole of somebody's participation in a church, so every row in it is
// sensitive whether the column looks it or not. docs/DATA-PROTECTION.md is the
// map; this file holds the handful of claims that are the code's job to keep.

import { readFileSync, existsSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// 1. The documents exist and are reachable.
// ---------------------------------------------------------------------------
{
  ok(existsSync('docs/DATA-PROTECTION.md'), 'the record of what is processed exists');
  ok(existsSync('app/privacy/page.tsx'), 'and a member can read a notice in the app');

  const source = strip(readFileSync('components/SourceCard.tsx', 'utf8'));
  ok(/href="\/privacy"/.test(source),
     'linked from Settings, beside the conduct policy, rather than buried');

  const notice = strip(readFileSync('app/privacy/page.tsx', 'utf8'));
  ok(/not legal advice/i.test(notice),
     'and it says plainly that it is not legal advice');
  ok(/<Blank what="\[church name and address\]"/.test(notice)
     && /<Blank what="\[name and email\]"/.test(notice),
     'the controller and the Data Protection Officer are marked as blanks rather than invented');
}

// ---------------------------------------------------------------------------
// 2. A photograph loses its location, which is the notice's strongest claim.
// ---------------------------------------------------------------------------
// A phone writes GPS coordinates into a photo. Sending a picture of a Bible
// page to your Guide should not tell them where you live. Re-encoding through a
// canvas keeps the pixels and drops every tag, so the privacy property and the
// storage saving are the same line of code, and losing one loses the other.
{
  const shrink = strip(readFileSync('lib/live/shrink-image.ts', 'utf8'));
  ok(/canvas\.toBlob/.test(shrink), 'the shrinker re-encodes through a canvas, which drops EXIF');
  ok(/imageOrientation: 'from-image'/.test(shrink),
     "and applies the camera's rotation first, or the photo arrives on its side");
  // Never bigger than it was given -- UNLESS the photo says where it was taken:
  // since 25 September 2026 losing the location outranks a few kilobytes.
  ok(/if \(blob\.size >= file\.size && !located\) return file/.test(shrink),
     'it never returns something bigger than it was given, unless that is the price of dropping a location');
  ok(/catch \{[\s\S]{0,120}return fallback\(\);/.test(shrink)
     && /const fallback = \(\) => \(located \? withoutLocation\(file\) : Promise\.resolve\(file\)\)/.test(shrink),
     'and every failure sends the original rather than nothing -- with its location cut out, if it had one');

  const data = strip(readFileSync('lib/live/data.ts', 'utf8'));
  ok(/await shrinkImage\(original\)/.test(data),
     'a conversation attachment goes through it');
  ok(/await shrinkImage\(chosen\)/.test(data),
     'and so does a profile picture, which is the one most likely to be taken at home');
  // And the two uploads added on 25 September 2026, which at first did not.
  const fnBody = (name) => data.slice(data.indexOf(`export async function ${name}(`),
    data.indexOf('\nexport ', data.indexOf(`export async function ${name}(`) + 10));
  for (const [name, what] of [['addMaterialFile', 'a file added to Resources'], ['attachLessonFile', 'a study handout']]) {
    const body = fnBody(name);
    ok(body.indexOf('await shrinkImage(chosen)') !== -1 && body.indexOf('await shrinkImage(chosen)') < body.indexOf('.upload('),
      `${what} goes through it before it is uploaded`);
  }

  const notice = readFileSync('app/privacy/page.tsx', 'utf8');
  ok(/location your camera\s*\n?\s*recorded in it is removed/.test(notice.replace(/\s+/g, ' '))
     || /location your camera recorded/.test(notice.replace(/\s+/g, ' ')),
     'and the notice tells people it happens');

  const composer = strip(readFileSync('components/live/shared.tsx', 'utf8'));
  ok(/location your camera recorded is removed/.test(composer.replace(/\s+/g, ' ')),
     'as does the composer, where the decision is actually made');
}

// ---------------------------------------------------------------------------
// 3. The retention the notice promises is the retention the code enforces.
// ---------------------------------------------------------------------------
{
  const notice = readFileSync('app/privacy/page.tsx', 'utf8').replace(/\s+/g, ' ');
  ok(/record of shared links: 30 days/i.test(notice),
     'the notice states the one retention period that is actually automatic');

  const sql = readFileSync('supabase/migrations/20260901090000_the_library_belongs_to_everybody.sql', 'utf8');
  ok(/interval '30 days'/.test(sql), 'and the database deletes at 30 days');

  ok(/kept\s*permanently/i.test(notice) || /kept permanently/i.test(notice),
     'the notice says the safeguarding record is permanent');
  // `reports` has no delete policy at all, deliberately. If one ever appears,
  // the notice above becomes untrue.
  const reports = readFileSync('supabase/migrations/0021_safeguarding_reports.sql', 'utf8');
  ok(!/create policy [a-z_]* on public\.reports\s+for delete/i.test(reports),
     'and there is still no way to delete a safeguarding report');
}

// ---------------------------------------------------------------------------
// 4. The claims about who can see what.
// ---------------------------------------------------------------------------
{
  const notice = readFileSync('app/privacy/page.tsx', 'utf8').replace(/\s+/g, ' ');
  ok(/Nobody who is not signed in sees anything at all/i.test(notice),
     'the notice claims nothing is public');
  // That claim is held up by an existing check, named here so the connection
  // between the sentence and the guard is not lost.
  ok(existsSync('tests/security-invariants.mjs'),
     'and tests/security-invariants.mjs is what makes it true');

  ok(/30-day record of which links people\s*shared/i.test(notice) || /30-day record/i.test(notice),
     'it tells members that Directors see the library record');
  ok(/They do not see conversations/i.test(notice),
     'and that Directors do not see conversations');
}

// ---------------------------------------------------------------------------
// 5. The gap list is honest about what is missing.
// ---------------------------------------------------------------------------
// This is the check most likely to be quietly deleted, because a document with
// no gaps reads better. The gaps are the point of the document.
{
  const doc = readFileSync('docs/DATA-PROTECTION.md', 'utf8');
  ok(/## 4\. What is missing/.test(doc), 'the record has a section for what is missing');
  ok(/No way for a member to get a copy of their own data/i.test(doc),
     'and names the right neither law is currently honoured for');
  ok(/72 hours/.test(doc), 'and the breach notification window');
  ok(/RA 10173/.test(doc) && /GDPR/.test(doc), 'and says which laws it was read against');
  ok(/not legal advice/i.test(doc), 'while saying it is not legal advice');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
