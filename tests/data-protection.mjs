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

  const composer = strip(readFileSync('components/talk/ChatView.tsx', 'utf8'));
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

// ---------------------------------------------------------------------------
// EVERYBODY IS TOLD WHO LOOKS AFTER THE APP, BEFORE THEY AGREE TO ANYTHING
// ---------------------------------------------------------------------------
// Everybody is told, before they agree to anything, what this app is and who
// looks after it, in the same true words everywhere.
//
// The owner, 7 October 2026: "Make sure when a user is invited, the email
// invitation has transparency letting all users know that this app is well
// monitored by the church because we don't want any legal troubles when it
// comes to policies. This is a 1 on 1 discipleship private app and only used
// for ministry." The Data Privacy Act asks for the same thing before personal
// information is collected (RA 10173 section 16), and for consent to sensitive
// personal information to be specific and informed (section 13; NPC Circular
// 2023-04). Being in a church's discipleship app is a religious affiliation.
//
// What is held here: the three places a person is told (the invitation
// e-mail, the real sign-up, the sample church's welcome) carry the same four
// statements, the sign-up's permission says specifically what it covers, and
// nothing anywhere promises a privacy the database does not keep.
{
const read = (p) => readFileSync(p, 'utf8');
// The four statements, as they read with the church's name taken out.
const STATEMENTS = [
  'is a private app for one-to-one discipleship and the ministry of',
  'It is overseen by the church.',
  "Directors and Executive Directors approve who joins, decide who walks with whom, and can see how the app is being used: who is paired with whom, where each person is on the journey, and counts and dates of meetings and messages.",
  "What you write to the person you walk with stays between the two of you. Nobody else can read it, the church\\'s leaders included, unless one of you reports a message; a reported message goes to leadership so they can keep everybody safe.",
  'keeps your information under the Data Privacy Act of 2012 (Republic Act 10173). You can ask for a copy of it, have it corrected, or have your account removed.',
];

const app = read('lib/oversight.ts');
const email = read('supabase/functions/invite/email.ts');
for (const sentence of STATEMENTS) {
  ok(app.includes(sentence), `the app says: "${sentence.slice(0, 60)}…"`);
  ok(email.includes(sentence), '  and so does the invitation e-mail, word for word');
}

// The e-mail carries them in both its versions, not only in a helper nobody calls.
ok(/const oversight = oversightLines\(churchName, appUrl\);/.test(email) && /oversight\.lines\.map/.test(email),
   'the e-mail\'s HTML version shows them');
ok(/oversightLines\(churchName, appUrl\)\.lines\.flatMap/.test(email),
   'and so does its plain-text version');
ok(/\$\{appUrl\}\/privacy/.test(email), 'and it links the full privacy notice');

// The real sign-up: told first, then asked, specifically.
const door = read('components/live/DoorPages.tsx');
const told = door.indexOf('{oversightPoints(churchName).map');
const asked = door.indexOf('checked={consent}');
ok(told > 0 && asked > told, 'the sign-up says who looks after the app before the permission box');
ok(/href="\/privacy"/.test(door.slice(told, asked)), 'and links the full privacy notice there');
const permission = door.slice(asked, door.indexOf('</label>', asked));
ok(/one-to-one discipleship/.test(permission) && /what I\s+choose to share with my Guide/.test(permission)
   && /my place on the journey/.test(permission) && /connection with the church/.test(permission),
   'the permission names what it covers: discipleship, what is shared with the Guide, the journey, and the connection with the church');
ok(/useState\(false\)/.test(door.slice(door.indexOf('const [consent'), door.indexOf('const [consent') + 60)),
   'and the box starts unticked');

// The sample church says the same, and no longer promises what is not true.
const sample = read('components/ConsentNotice.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
ok(/oversightPoints\(db\.church_name\)/.test(sample), 'the sample church\'s welcome uses the same words');
ok(!/counts only/i.test(sample) && !/Never your name/i.test(sample),
   'and no longer says leaders see "counts only, never your name", which a Director approving people by name disproves');

}

// ---------------------------------------------------------------------------
// WHAT IS DELETED LEAVES NO FILE BEHIND
// ---------------------------------------------------------------------------
// The owner, 7 October 2026: "Make sure we have a system of in and out (exit)
// of data when it's deleted." A row deleted, its file queued; the `erase`
// function removes queued files with the Storage API, the only way that
// removes both halves. supabase/tests/what-is-deleted-leaves-no-file-behind.sql
// proves the queue as invented people on every fresh install; these lines keep
// that proof running and the function narrow.
{
  const mig = readFileSync('supabase/migrations/20261007150000_what_is_deleted_leaves_no_file_behind.sql', 'utf8');
  for (const table of ['pairing_media', 'materials', 'lesson_files', 'report_files', 'profiles']) {
    ok(new RegExp(`create trigger zz_queue_file_for_erasure after delete[^;]*on public\\.${table}\\b`).test(mig),
       `deleting a ${table} row queues its file for erasure`);
  }
  ok(/revoke all on private\.files_to_erase from public, anon, authenticated/.test(mig)
     && /grant execute on function public\.files_waiting_to_be_erased\(integer\) to service_role;/.test(mig)
     && !/files_waiting_to_be_erased\(integer\) to authenticated/.test(mig),
     'only the service role reads the list');
  ok(/cron\.schedule\('erase-deleted-files'/.test(mig), 'and the database asks for it to be emptied every night');
  const fn = readFileSync('supabase/functions/erase/index.ts', 'utf8');
  ok(/bearer !== SERVICE_KEY/.test(fn), 'the erase function answers only the database');
  ok(/files_waiting_to_be_erased/.test(fn) && !/await req\.json\(\)/.test(fn),
     'and removes only what the list names, taking no path from the request');
  ok(/what-is-deleted-leaves-no-file-behind\.sql/.test(readFileSync('scripts/fresh-install.sh', 'utf8')),
     'and CI proves the queue on every fresh install');
  ok(/deploy erase/.test(readFileSync('docs/PRIVACY-MANUAL.md', 'utf8')),
     'and the privacy manual tells the church how to switch it on');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
