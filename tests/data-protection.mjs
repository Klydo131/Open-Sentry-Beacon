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
  // Since 28 October 2026 the controller and the officer are the church's own
  // record, filled in by its Director (components/ChurchLegal.tsx), where they
  // were blanks in the source. Still never invented: no name or address is
  // written here, and a church that has not filled them in is said to have not.
  const legal = strip(readFileSync('components/ChurchLegal.tsx', 'utf8'));
  ok(/<ChurchLegalLine church=\{church\} loading=\{loading\} \/>/.test(notice)
     && /useChurchLegal\(\)/.test(notice)
     && /data-church-legal="missing"/.test(legal) && /has not yet filled in its legal name, its\s+address and its Data Protection Officer/.test(legal)
     && /data-legal-missing/.test(notice)
     && !/@[\w-]+\.[\w.]+/.test(notice),
     'the controller and the Data Protection Officer come from the church\'s own record, and are said to be missing rather than invented');
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
// 5. The record says what each church must complete before real people.
// ---------------------------------------------------------------------------
{
  const doc = readFileSync('docs/DATA-PROTECTION.md', 'utf8');
  ok(/## 4\. What each church must complete/.test(doc), 'the record says what each church must complete');
  ok(/privacy notice/i.test(doc) && /Data Protection Officer/.test(doc),
     'and names the privacy notice and the Data Protection Officer');
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
  "leaders approve who joins, decide who walks with whom, and can see how the app is being used: who is paired with whom, where each person is on the journey, and counts and dates of meetings and messages.",
  "What you write to the person you walk with stays between the two of you. Nobody else can read it, the church\\'s leaders included, unless one of you reports a message; a reported message goes to leadership so they can keep everybody safe.",
  'keeps your information under the Data Privacy Act of 2012 (Republic Act 10173). You can ask for a copy of it, have it corrected, or have your account removed.',
];

const app = read('lib/oversight.ts');
const email = read('supabase/functions/invite/email.ts');
for (const sentence of STATEMENTS) {
  ok(app.includes(sentence), `the app says: "${sentence.slice(0, 60)}…"`);
  ok(email.includes(sentence), '  and so does the invitation e-mail, word for word');
}

// With no church name yet, neither copy reads "the ministry of Your church".
for (const [src, where] of [[app, 'the app'], [email, 'the e-mail']]) {
  ok(/\|\| 'your church'/.test(src) && /\$\{Church\}'s leaders/.test(src) && /\$\{Church\} keeps your information/.test(src),
     `${where} says "your church" mid-sentence and "Your church" only to start one`);
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
// The link carries the church since 28 October 2026, so the notice can name it.
ok(/href=\{legalHref\('privacy', churchId\)\}/.test(door.slice(told, asked)), 'and links the full privacy notice there');
// The words live in components/live/ConsentWording.tsx since 13 October 2026,
// so the consent step for members who never signed up asks the same thing.
const permission = door.slice(asked, door.indexOf('</label>', asked));
const permissionWords = read('components/live/ConsentWording.tsx');
ok(/<ConsentWording churchName=\{churchName\} \/>/.test(permission)
   && /one-to-one discipleship/.test(permissionWords) && /what I\s+choose to share with my Guide/.test(permissionWords)
   && /my place on the journey/.test(permissionWords) && /connection with the church/.test(permissionWords),
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
  ok(/!\(await sameKey\(bearer, SERVICE_KEY\)\)/.test(fn), 'the erase function answers only the database');
  ok(/files_waiting_to_be_erased/.test(fn) && !/await req\.json\(\)/.test(fn),
     'and removes only what the list names, taking no path from the request');
  ok(/what-is-deleted-leaves-no-file-behind\.sql/.test(readFileSync('scripts/fresh-install.sh', 'utf8')),
     'and CI proves the queue on every fresh install');
  ok(/deploy erase/.test(readFileSync('docs/PRIVACY-MANUAL.md', 'utf8')),
     'and the privacy manual tells the church how to switch it on');
}

// ---------------------------------------------------------------------------
// QUESTIONS PEOPLE ASK, BEFORE AND AFTER SIGNING IN
// ---------------------------------------------------------------------------
// The owner, 7 October 2026: "I want a complete FAQ in the app too please
// before users login and inside the app in settings." The law's side of the
// same thing: a person is told what is done with their information before it
// is collected (RA 10173 §16). So the answers are one list (lib/faq.ts), open
// to anybody at /faq, linked from every screen a signed-out person sees, and in
// both halves' Settings, Help; and the answers about privacy say no more and no
// less than the notice does. The browser half is
// tests/e2e/questions-answered.js.
{
  const faq = readFileSync('lib/faq.ts', 'utf8');
  const code = strip(faq);
  ok(existsSync('app/faq/page.tsx'), 'the questions have a page of their own');
  const page = strip(readFileSync('app/faq/page.tsx', 'utf8'));
  ok(!/AppShell|useLiveSession|useDemo/.test(page) && /<Faq \/>/.test(page),
     'and it needs nobody to be signed in');
  for (const [file, where] of [
    ['components/live/DoorPages.tsx', 'a real church\'s front door, sign-in and invitation pages link to it'],
    ['app/page.tsx', 'the sample front door links to it'],
    ['app/login/page.tsx', 'the sample sign-in links to it'],
    ['app/privacy/page.tsx', 'the privacy notice links to it'],
  ]) {
    ok(/href="\/faq"/.test(readFileSync(file, 'utf8')), where);
  }
  const door = readFileSync('components/live/DoorPages.tsx', 'utf8');
  ok((door.match(/href="\/faq"/g) || []).length >= 3, 'all three of the real church\'s signed-out pages, not one');
  for (const [file, where] of [['app/settings/page.tsx', 'the sample church'], ['components/LiveAccountPages.tsx', 'a real church']]) {
    const src = strip(readFileSync(file, 'utf8'));
    const help = src.slice(src.indexOf("room === 'help'"));
    ok(/<FaqCard \/>/.test(help.slice(0, 600)), `Settings, Help, in ${where}, holds the same answers`);
    ok(/faq: 'help'/.test(src), `and /settings#faq lands on that folder in ${where}`);
  }

  // One source for what the app is and who sees what: the oversight words the
  // invitation and the sign-up use, not a third version of them.
  ok(/oversightPoints\(null\)/.test(code), 'the answers about the app and its oversight are the invitation\'s own words');
  // Numbers read from the code that enforces them.
  ok(/\$\{POST_FILES_MOST\}/.test(code) && /CLIP_MOST_BYTES/.test(code) && !/up to 10 photos/.test(code),
     'the limits on a post are read from the code that enforces them');
  // Nothing promised that the app does not keep.
  ok(!/runs the server|owns the server/.test(faq), 'no answer promises that nobody running the server could reach a conversation');
  ok(/not end-to-end encrypted/.test(faq), 'and the answer about encryption says what it is not');
  const notice = readFileSync('app/privacy/page.tsx', 'utf8').replace(/\s+/g, ' ');
  ok(!/not the person who runs the server/.test(notice) && /not end to end/.test(notice),
     'the privacy notice says the same about the server');
  ok(/one short clip on a post/.test(notice), 'and no longer says video is never kept, now a post carries a clip');
  ok(!/dangerouslySetInnerHTML/.test(readFileSync('components/Faq.tsx', 'utf8')), 'the answers are drawn as text, never as HTML');

  // Every link goes somewhere real: a page in this app, or the source code.
  const links = [...code.matchAll(/href: ('[^']*'|SOURCE_URL)/g)].map((m) => m[1]);
  ok(links.length >= 5, `the answers carry links (${links.length})`);
  for (const href of new Set(links)) {
    if (href === 'SOURCE_URL') continue;
    const path = href.replace(/^'|'$/g, '');
    ok(path.startsWith('/') && existsSync(`app${path}/page.tsx`), `${href} is a page that exists`);
  }
  // Every question can be linked to, so its id is unique.
  const ids = [...code.matchAll(/^\s+id: '([a-z0-9-]+)'/gm)].map((m) => m[1]);
  ok(ids.length >= 55 && new Set(ids).size === ids.length, `every group and question has its own address (${ids.length})`);
}

// ---------------------------------------------------------------------------
// CONSENT IS ASKED OF EVERYBODY, NOT ONLY OF THOSE WHO SIGNED UP (13 October 2026).
// Consent was asked on the sign-up page alone, and a member who signed in with
// the password from their invitation never saw it: on the beta service 42 of
// its 43 tester accounts had none on record. The signed-in app now stops anybody without a
// record at a consent step, in the sign-up's own words.
// ---------------------------------------------------------------------------
{
  const src = (p) => readFileSync(p, 'utf8');
  const shell = strip(src('components/LiveAppShell.tsx'));
  const step = strip(src('components/live/ConsentStep.tsx'));
  const door = strip(src('components/live/DoorPages.tsx'));
  const wording = src('components/live/ConsentWording.tsx');

  // The same step asks about the Terms of Use and Privacy Notice now in force
  // (28 October 2026); a missing permission still stops the person, and is
  // still what the step asks for.
  const gate = shell.search(/if \(!profile\.consent_at \|\| needsTerms\) \{\s*return <ConsentStep needsConsent=\{!profile\.consent_at\}/);
  ok(gate > 0, 'the signed-in app stops anybody with no consent on record at the consent step');
  ok(gate > 0 && gate < shell.indexOf('if (!profile.is_approved)'),
    'before anything else, the waiting-for-approval screen included');

  ok(/<ConsentWording churchName=\{churchName\} \/>/.test(step) && /<ConsentWording churchName=\{churchName\} \/>/.test(door),
    'the step and the sign-up ask in the same words, from one place');
  ok(!/I give permission for/.test(door), 'and the sign-up no longer carries a second copy of them');
  ok(/my name and contact details, what I\s+choose to share with my Guide, and my place on the journey/.test(wording)
    && /shows my connection with the church/.test(wording),
    'the words say specifically what is kept, and that it shows a connection with the church');

  ok(/const \[agreed, setAgreed\] = useState\(false\);/.test(step) && /checked=\{agreed\}/.test(step),
    'the box starts unticked (Circular 2023-04: a ticked box is not consent)');
  ok(/const ready = \(!needsConsent \|\| agreed\) && /.test(step) && /disabled=\{busy \|\| !ready\}/.test(step)
    && /if \(needsConsent && !agreed\) \{ setError/.test(step),
    'and the agree button waits for it, and agreeing checks it again');
  ok(/\.\.\.\(needsConsent \? \{ consent_at: new Date\(\)\.toISOString\(\) \} : \{\}\)/.test(step)
    && /live\.updateMyProfile\(\{/.test(step),
    'agreeing records when, on the account, in the column the sign-up writes');
  ok(/I do not agree, sign me out/.test(step) && /signOut\(\)/.test(step),
    'saying no is a real button, and it signs the person out');
  const told = step.indexOf('oversightPoints(churchName)');
  ok(told > 0 && told < step.indexOf('checked={agreed}')
    && /href=\{legalHref\('privacy', churchId\)\}/.test(step.slice(told, step.indexOf('checked={agreed}'))),
    'the step says who looks after the app, and links the full notice, before asking');
}

// ---------------------------------------------------------------------------
// A MESSAGE HISTORY OPENS ONLY FOR A REPORT (13 October 2026).
// What a withdrawn or edited message said is kept for safeguarding, so reading
// it is bound to safeguarding: a report on that conversation, and an entry in
// the church's security record each time. supabase/tests/a-message-history-
// needs-a-report.sql proves it as invented people; this keeps the shape.
// ---------------------------------------------------------------------------
{
  const mig = readFileSync('supabase/migrations/20261013130000_a_message_history_opens_only_for_a_report.sql', 'utf8')
    .replace(/--[^\n]*/g, '');
  ok(/from public\.reports r\s+where r\.pairing_id = p_pairing/.test(mig)
     && /if v_report\.id is null then\s+raise exception 'A message history is opened only for a conversation somebody has reported\.'/.test(mig),
    'a message history needs a safeguarding report on that conversation');
  ok(/public\.leads_church\(v_church\)/.test(mig), 'and a reader who leads that church');
  ok(/church_of\(p\.ds_id\)/.test(mig) && !/p\.church_id/.test(mig),
    'the conversation\'s church comes from its Explorer, as its own rules find it');
  ok(/'message_history_read', 'review'/.test(mig), 'every opening is written to the security record for review');
  ok(/a-message-history-needs-a-report\.sql/.test(readFileSync('scripts/fresh-install.sh', 'utf8')),
    'and the fresh install proves it as invented people');
}

// ---------------------------------------------------------------------------
// THE READINESS CHECK ONLY READS (13 October 2026).
// supabase/tests/ready-for-real-members.sql is pasted into a production SQL
// editor by a church's custodian. It must never change anything there, and its
// output must never carry a member's details or a secret's value.
// ---------------------------------------------------------------------------
{
  const sql = readFileSync('supabase/tests/ready-for-real-members.sql', 'utf8').replace(/--[^\n]*/g, '');
  // Quoted text (the hints it prints) is words, not statements.
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  const writes = code.match(/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s|alter\s|truncate\s|grant\s|revoke\s|create\s+(?!or\s+replace\s+function\s+pg_temp\.)\w+)/gi) || [];
  ok(writes.length === 0, `the readiness check writes nothing${writes.length ? ` (found: ${writes.join(', ')})` : ''}`);
  ok(/create or replace function pg_temp\.readiness\(\)/.test(sql), 'its one creation is a function in pg_temp, gone with the session');
  ok(!/decrypted_secret|vault\.decrypted_secrets/.test(sql) && /from vault\.secrets where name/.test(sql),
    'it reads Vault entry names, never a secret\'s value');
  ok(!/select[^;]*\b(email|full_name|phone)\b[^;]*from auth\.users/i.test(sql.replace(/where[^;]*/gi, '')),
    'it counts addresses, never lists them');
  ok(/ready-for-real-members\.sql/.test(readFileSync('docs/GOING-LIVE.md', 'utf8')), 'and the going-live guide tells a custodian to run it');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
