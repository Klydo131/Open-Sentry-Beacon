// A Director can open a member, and record a guardian's permission.
//
// TWO GAPS, and the second one is the serious one.
//
// 1. THE ROSTER SHOWED A NAME, A ROLE AND A STAGE. Everything the app knows
//    about somebody was collected on sign-up and then only ever shown back to
//    them, so the two questions a person running a church actually asks — "is
//    this a real person I meant to let in?" and "does this pairing make any
//    sense?" — could not be answered from any screen.
//
// 2. THE CONSENT WARNING COULD NEVER BE ANSWERED. The guardian columns, the
//    database functions record_guardian_consent and withdraw_guardian_consent,
//    the Directors' roster of minors and the red "MINOR · consent missing"
//    badge were ALL built. No screen ever called the functions. So every
//    Explorer under eighteen sat permanently at "consent missing" with no way
//    to clear it, which is worse than no warning at all: a flag nobody can
//    answer is one everybody learns to scroll past.
//
//   node tests/a-director-can-open-somebody.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Comments are prose, and the comment ABOVE a rule often has to name the thing
// the rule forbids. Checking the raw file made the "not a personnel file" rule
// fail on the paragraph explaining why it exists.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

const panel = read('components/live/MemberProfile.tsx');
const panelCode = stripComments(panel);
const admin = read('components/live/AdminPage.tsx');
const data = read('lib/live/data.ts');

// ---- Opening somebody ----
ok(/export function MemberProfile/.test(panel), 'there is a profile panel');
ok(/<MemberProfile/.test(admin), 'and the Director’s screen renders it');
ok(/onOpen\(person\.id\)/.test(admin), 'a roster name opens it');
ok((admin.match(/openProfile\(pairing\.(dm|ds)_id\)/g) ?? []).length === 2,
   'and BOTH names on a pairing row open, not just one');

// The panel is drawn above the tabs. On a phone the row that opened it can be
// a long scroll below, and a profile that opened off-screen looked like a
// Profile button that did nothing (reported 20 October 2026).
const adminCode = stripComments(admin);
ok(/onOpen=\{openProfile\}/.test(adminCode), 'the roster opens profiles through the one opener');
ok((adminCode.match(/setOpenId\(/g) ?? []).length === 2,
   'and nothing else opens one without it (the opener, and Close)');
ok(/ref=\{profilePanel\}/.test(adminCode)
   && /panel\.scrollIntoView\(/.test(adminCode)
   && /panel\.focus\(/.test(adminCode),
   'opening a profile scrolls it into view and moves focus to it');
ok(/setOpened\(\(n\) => n \+ 1\)/.test(adminCode) && /\}, \[opened\]\);/.test(adminCode),
   'and a second tap on the same person scrolls to it again');

// Sign-in details, Disapprove and Delete answer in the row that was tapped.
// Their results used to go to the invitation card and the notice at the top of
// the page, off-screen on a phone, so the button looked dead (20 October 2026).
const bodyOf = (name) => {
  const at = adminCode.indexOf(`const ${name} = async`);
  return at < 0 ? '' : adminCode.slice(at, adminCode.indexOf('\n  };', at));
};
for (const name of ['showSignIn', 'disapprove', 'deleteAccount']) {
  const body = bodyOf(name);
  ok(body !== '' && !/setError\((?!'')/.test(body) && /setRowNote\(\{ id: member\.id/.test(body),
     `${name} reports a refusal in its own row, not at the top of the page`);
}
ok(/forMember: member\.id/.test(bodyOf('showSignIn')), 'Sign-in details marks its result as that row\'s');
ok(/rowNote\?\.id === member\.id/.test(adminCode) && /handLink\?\.forMember === member\.id && handOverCard/.test(adminCode),
   'and the row draws the refusal or the details under itself');
ok(/handLink && !handLink\.forMember && handOverCard/.test(adminCode),
   'while an invitation\'s details stay in the invitation card');

// The two questions it exists to answer.
ok(/label="Email"/.test(panel), 'it shows the address they were invited at');
ok(/label="Joined"/.test(panel), 'and the day they arrived');
ok(/pairedWith/.test(panel), 'and what it knows about the pairing');
ok(/Same town/.test(panel) && /Same language/.test(panel) && /Both: /.test(panel),
   'naming what the two have in common');
// Two people with nothing written down in common are very often the right
// pairing. A warning here would push Directors to break up working pairs.
ok(/not a problem on its own/i.test(panel),
   'and saying plainly that nothing in common is not a problem');

// ---- A read, not a file ----
// The moment this becomes somewhere to record an opinion, it is a personnel
// file the member cannot see and never agreed to.
ok(!/Add a note|noteFor|assessment/i.test(panelCode),
   'it is a read of what they gave, not somewhere to write about them');
// A blank must be legible as "they declined" rather than "the screen broke".
ok(/Not given/.test(panel), 'an unanswered question says so rather than being blank');

// ---- The consent, which is the part that never existed ----
ok(/live\.recordGuardianConsent\(/.test(panel), 'a Director can record a guardian’s permission');
ok(/live\.withdrawGuardianConsent\(/.test(panel), 'and take it back when a parent changes their mind');
ok(/isMinor\(person\.birthday\)/.test(panel), 'and it is only asked for a minor');
ok(/Parent or guardian’s name/.test(panel), 'the guardian is named');
ok(/Not a member here/.test(panel), 'and linked to their own account when they have one');

// The functions themselves go through the checked RPCs, not a raw update.
ok(/rpc\('record_guardian_consent'/.test(data), 'recording goes through the database function');
ok(/rpc\('withdraw_guardian_consent'/.test(data), 'and so does withdrawing');

// This is the church's note that permission was seen, not the permission.
ok(/not the permission/i.test(panel) || /outside this app/i.test(panel),
   'and the screen says it records permission rather than being it');

// ---- A GUIDE OPENS THE SAME PANEL AND SEES LESS ----
// The Guide is the person actually sitting with this Explorer and had less on
// screen than a Director did: a name, a stage and a badge. What they may see is
// decided by the database — profiles_read_paired serves the profile of somebody
// you are walking with, and nothing else.
const guide = read('components/live/GuidePages.tsx');
ok(/<MemberProfile/.test(guide), 'a Guide can open their Explorer');
ok(/setOpenProfile/.test(guide), 'by tapping their name');
ok(/live\.memberProfile\(/.test(guide), 'reading one profile, not the whole roster');
// canManage is NOT passed, so it defaults to false.
ok(!/canManage/.test(guide), 'and does not claim leadership, so the panel shows less');

// The two leadership-only facts stay leadership-only. Rendering them for a
// Guide would print "Not given" over something the app knows and is
// deliberately not telling them, which is worse than leaving the row out.
ok(/\{canManage && <Row label="Email"/.test(panel), 'the email is shown to leadership only');
ok(/\{canManage && \(\s*\n\s*<Row label="Joined"/.test(panel)
   || /canManage && \(/.test(panel), 'and so is the day they joined');
// But a Guide still sees whether a minor has permission: they are the one
// sitting with them, so they are exactly who needs to know.
ok(/canManage \? \(|!canManage \? \(/.test(panel),
   'a Guide is still told whether a minor has permission');
ok(/Ask a Director to record/.test(panel),
   'and told whose job it is to record it');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
