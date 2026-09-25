// The kind on a library row matches what is actually at the address.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The add form asks for a Kind, offers five, defaults to
// "Link", and puts the dropdown BELOW the address box -- so somebody pasting a
// YouTube URL reaches the Add button before they reach the question.
//
// That was harmless while the kind was a small icon on the row. Then FILTER
// CHIPS were built on top of it, and a field nobody maintains became a control
// that lies: two of the nine items on this church's shelf were filed as "link"
// and were YouTube videos, so tapping Video hid half the real videos, and the
// person tapping had no way to tell. I built that filter, which is how a
// measurement rather than a report found this.
//
// The repair is not a better dropdown. It is to stop asking somebody to
// classify a thing whose address already says what it is.
//
// This test runs the REAL reader rather than checking that a file mentions it.
//
//   node tests/the-shelf-knows-what-it-is-holding.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindFromUrl } from '../lib/live/kind-from-url.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. IT READS THE ADDRESSES A CHURCH ACTUALLY PASTES
// ---------------------------------------------------------------------------
{
  const cases = [
    ['https://www.youtube.com/watch?v=aaa', 'video'],
    ['https://youtu.be/aaa',                'video'],
    ['https://vimeo.com/12345',             'video'],
    ['https://open.spotify.com/episode/1',  'audio'],
    ['https://example.org/sermon.mp3',      'audio'],
    ['https://example.org/study-guide.pdf', 'pdf'],
    ['https://example.org/poster.JPG',      'image'],
  ];
  const wrong = cases.filter(([u, want]) => kindFromUrl(u) !== want);
  ok(wrong.length === 0,
     `the ordinary cases read correctly${
       wrong.length ? `\n        wrong: ${wrong.map(([u, w]) => `${u} -> ${kindFromUrl(u)}, wanted ${w}`).join('\n               ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. AND IT IS NOT FOOLED BY AN ADDRESS THAT MERELY CONTAINS ONE
// ---------------------------------------------------------------------------
//
// THE CHECK WORTH HAVING. `includes('youtube.com')` is also true of
// `youtube.com.example.net`, which is SOMEBODY ELSE'S DOMAIN wearing this one
// as a prefix -- the oldest trick in phishing, and the reason the reader
// compares whole labels instead of substrings. The kind is only a label today,
// so this is not yet a security boundary; the habit is cheap and the day
// somebody reaches for this function to decide something that matters, it will
// already be right.
{
  ok(kindFromUrl('https://youtube.com.example.net/watch') === null,
     'a domain that only starts with youtube.com is not a video');
  ok(kindFromUrl('https://notyoutube.com/watch') === null,
     'and neither is one that merely ends with it');
  ok(kindFromUrl('https://music.youtube.com/watch?v=a') === 'video',
     'while a real subdomain still is');
}

// ---------------------------------------------------------------------------
// 3. THE QUERY STRING IS NOT THE PATH
// ---------------------------------------------------------------------------
//
// `?redirect=/handbook.pdf` is a parameter ABOUT a PDF, not a PDF. Reading it
// as one would mislabel every share link that carries a destination, which is
// most of them.
{
  ok(kindFromUrl('https://example.org/go?to=/handbook.pdf') === null,
     'an extension in the query string is not the kind');
  ok(kindFromUrl('https://example.org/handbook.pdf?from=email') === 'pdf',
     'but one in the path still is, even with a parameter after it');
}

// ---------------------------------------------------------------------------
// 4. IT SAYS NOTHING RATHER THAN GUESSING
// ---------------------------------------------------------------------------
//
// null is "no opinion", and it must not be confused with 'link'. A half-typed
// address arrives here on EVERY KEYSTROKE, and the one behaviour that would
// make this feature hated is a box that flickers between kinds while somebody
// is still typing.
{
  for (const u of ['', '   ', 'not a url', 'http', 'https://', 'example.org/x']) {
    ok(kindFromUrl(u) === null, `no opinion on ${JSON.stringify(u)}`);
  }
  ok(kindFromUrl('https://example.org/an-article') === null,
     'and none on an ordinary page, which is left as whatever is chosen');

  // A SCHEME THE COLUMN WOULD REFUSE ANYWAY, refused here too rather than
  // relied on being refused later.
  ok(kindFromUrl('javascript:alert(1)') === null, 'and none on a scheme this app does not store');
}

// ---------------------------------------------------------------------------
// 5. THE ADDRESS ANSWERS THE QUESTION, AND A REAL CHOICE IS NEVER OVERRIDDEN
// ---------------------------------------------------------------------------
//
// Detection that OVERRIDES somebody is worse than no detection. A Guide who
// files a YouTube link as Audio because they want it listened to has made a
// decision, and having it flipped back is the most annoying possible version
// of this feature.
//
// Until 25 September 2026 the add form kept a Kind dropdown and remembered
// whether it had been touched (`kindTouched`), so detection filled it only
// while nobody had chosen. The owner then asked for these screens to be less
// technical, and the dropdown went from the add form altogether: the address
// answers it, and anything the reader is unsure of is a link. The one place a
// person CHOOSES a kind is now Edit -> More options, which is where this rule
// lives -- and nothing there ever runs the reader.
{
  const lib = read('components/LiveLibrary.tsx');
  ok(/kind: kindFromUrl\(url\) \?\? 'link'/.test(lib),
     'adding reads the kind from the address, and calls anything unsure a link');
  ok(!/id="mat-kind"/.test(lib),
     'so the add form does not ask somebody to classify what the address already says');

  const startEdit = lib.slice(lib.indexOf('const startEdit ='), lib.indexOf('const saveEdit ='));
  const saveEdit = lib.slice(lib.indexOf('const saveEdit ='), lib.indexOf('const remove ='));
  ok(/setEditKind\(m\.kind\)/.test(startEdit),
     'editing opens on the kind the row already has');
  ok(/kind: editKind/.test(saveEdit),
     'and saves exactly the kind the person left in the box');
  const editStart = lib.indexOf(') : editing === m.id ? (');
  const editForm = lib.slice(editStart, lib.indexOf('void saveEdit(m)', editStart));
  ok(/id=\{`edit-kind-\$\{m\.id\}`\}/.test(editForm),
     'the edit form is where a kind is chosen');
  ok(!/kindFromUrl/.test(startEdit + saveEdit + editForm),
     'and the address reader never runs there, so a chosen kind is never overridden');
}

// ---------------------------------------------------------------------------
// 6. THE BACKFILL ONLY TOUCHED ROWS NOBODY HAD ANSWERED
// ---------------------------------------------------------------------------
//
// `where kind = 'link'` is the whole safety of that migration. 'link' is the
// only value that cannot be told apart from nobody having answered; every other
// value is a decision, and correcting a decision is overwriting it.
{
  const m = read('supabase/migrations/20260911100000_the_shelf_knows_what_it_is_holding.sql');
  const updates = m.match(/update public\.materials/g) ?? [];
  const guards  = m.match(/where m\.kind = 'link'/g) ?? [];
  ok(updates.length > 0 && updates.length === guards.length,
     `every correction is guarded by kind = 'link' (${guards.length} of ${updates.length})`);

  ok(/host_is/.test(m),
     'and it matches hosts on a label boundary, the same rule the reader uses');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
