// A Guide, and a Director above them, can see an Explorer's profile and face.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a
// Guide's list of Explorers, every one of them initials in a circle: "I still
// can't see anyway to see the Explorers profile or their image display for
// Guides and higher up accounts, please make a way to do it."
//
// Two things were true. The only way into a profile was a tap on a name that
// nothing announced. And no list a Guide or a Director reads ever drew a photo:
// the Guide's list did not even ask the database for one.
//
// NOTHING ABOUT WHO MAY SEE WHAT CHANGED. The Guide's list already read each
// Explorer's profile row; it now also asks for the photo path in it. Photos
// load through the storage rule that was already there: anybody signed in may
// read a face, nobody but its owner may write one.
//
//   node tests/explorer-profiles-can-be-seen.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => stripTs(fs.readFileSync(path.join(root, p), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const data = read('lib/live/data.ts');
const guide = read('components/live/GuidePages.tsx');
const admin = read('components/live/AdminPage.tsx');
const profile = read('components/live/MemberProfile.tsx');

// 1. The photo is loaded, and every face on a screen is signed at once.
{
  const pairings = data.slice(data.indexOf('export async function listPairings'), data.indexOf('export async function listPairings') + 1400);
  ok(/select\('id, full_name, birthday, guardian_consent_at, signup_completed_at, photo_path, avatar'\)/.test(pairings)
     && /ds_photo_path: by\.get\(p\.ds_id\)\?\.photo_path/.test(pairings),
     'a Guide\'s list asks for each Explorer\'s photo, from the row it already reads');
  ok(/createSignedUrls\(unique/.test(data), 'every face on a screen is signed in one request, not one per person');
  ok(/useFaces\(/.test(read('components/live/Face.tsx')) && /setInterval\(sign/.test(read('components/live/Face.tsx')),
     'and signed again before the links run out on a page left open');
}

// 2. Faces where a Guide or a Director reads names.
ok(/useFaces\(rows\.map\(\(r\) => r\.ds_photo_path\)\)/.test(guide) && /photo=\{faceOf\(faces, row\.ds_photo_path\)\}/.test(guide),
   'a Guide\'s list of Explorers shows their faces');
ok(/photo=\{faceOf\(faces, pairing\.ds_photo_path\)\}/.test(guide), 'and so does the page for one Explorer');
ok(/useFaces\(\[person\.photo_path\]\)/.test(profile) && /size=\{72\} photo=\{face\}/.test(profile),
   'the profile itself shows their face, large');
ok(/useFaces\(people\.map/.test(admin) && /useFaces\(members\.map/.test(admin),
   'a Director\'s rooms of people and approval lists show faces');

// 3. A way in that says what it is.
{
  const button = read('components/talk/MessageButton.tsx');
  ok(/export function ProfileButton/.test(button) && /<span>Profile<\/span>/.test(button) && /aria-expanded=\{open\}/.test(button),
     'there is a Profile button, in a word, that says whether it is open');
  ok(/<ProfileButton\b/.test(guide) && /<ProfileButton\b/.test(read('app/dm/[id]/page.tsx')),
     'on a Guide\'s page for one Explorer, on both halves of the app');
  ok(/data-profile-button[\s\S]{0,200}>\s*Profile\s*<\/button>/.test(admin),
     'and on every row of a Director\'s rooms of people');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
