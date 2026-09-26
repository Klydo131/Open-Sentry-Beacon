// Where to meet: type part of a name, see which place it is, tap it to pin it.
//
// ---------------------------------------------------------------------------
// ASKED FOR, 26 September 2026: "I can't see my destination if it's really
// going to be that destination unless I already input the destination. I need
// to see the destination name, like auto name in google search, then just
// click or tap it to secure the location. Can we improve the appointments
// better please, specially the meet ups."
//
// This file runs the real code against two real answers from the place search
// (tests/fixtures/photon-*.json, saved from the service on that day; place data
// © OpenStreetMap contributors, ODbL). It holds three promises:
//
//   1. THE RIGHT PLACE CAN BE TOLD APART. "jollibee imus" is five branches, and
//      each must come back with its own street and barangay.
//   2. TAPPING ONE SECURES IT. What is saved opens that exact spot for the
//      other person, and still reads as a place name on the card.
//   3. IT SENDS THE LEAST. Only the words, and a point rounded to the nearest
//      town, leave -- from the church's server, for a signed-in, approved,
//      unsuspended member, and nothing about it is kept.
//
//   node tests/place-search.mjs
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { cleanQuery, nearFrom, photonUrl, shape, MAX_PLACES } from '../supabase/functions/places/photon.ts';
import { pinFor, pinOf, nearOf, pinUrl, matchedParts } from '../lib/live/place-pin.ts';
import { placeUrl, placeLabel, wordsBesideLink } from '../lib/live/meeting-link.ts';
import { searchSamplePlaces, SAMPLE_PLACES } from '../lib/demo/sample-places.ts';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const read = (f) => readFileSync(f, 'utf8');
const fixture = (f) => JSON.parse(read(`tests/fixtures/${f}`));
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

// ---------------------------------------------------------------------------
// 1. THE RIGHT PLACE CAN BE TOLD APART
// ---------------------------------------------------------------------------
{
  const jolli = shape(fixture('photon-jollibee-imus.json'));
  ok(jolli.length === 5, `five branches of one restaurant in one city come back as five (${jolli.length})`);
  ok(new Set(jolli.map((p) => p.detail)).size === 5,
    'each with an address line of its own, so the right one can be picked');
  ok(jolli[0].detail === 'Aguinaldo Highway, Anabu II-D, Imus, Cavite',
    'street, then barangay, then city, then province');
  ok(jolli.every((p) => !/Philippines/.test(p.detail)), 'and no country when every answer is in the same one');
  ok(jolli.every((p) => p.kind === 'Fast food'), 'each says what kind of place it is');

  const sm = shape(fixture('photon-sm-city-bacoo.json'));
  ok(sm[0].name === 'SM City Bacoor' && sm[0].kind === 'Mall',
    'half a word finds the place, and the mall is offered before the bus stop at its gate');
  ok(sm.some((p) => p.name === 'SM City Molino' && p.kind === 'Mall'),
    'a mall is never lost behind a bus stop at the same address');
  ok(sm.findIndex((p) => p.kind === 'Bus stop') > sm.findIndex((p) => p.kind === 'Mall'),
    'places come before the stops near them');
  // Two different places with one name at one address: a parish church and the
  // parish school, say. Folding them together would lose one of them.
  const twins = shape({ features: ['place_of_worship', 'school'].map((v) => ({
    properties: { name: 'San Roque', street: 'Rizal Street', city: 'Imus', osm_key: 'amenity', osm_value: v },
    geometry: { coordinates: [120.94, 14.43] },
  })) });
  ok(twins.length === 2 && twins[0].kind !== twins[1].kind,
    'a church and a school with one name at one address stay two places');

  const many = { features: Array.from({ length: 20 }, (_, i) => ({
    properties: { name: `Place ${i}`, city: 'Imus', osm_key: 'amenity', osm_value: 'cafe' },
    geometry: { coordinates: [120.9, 14.4] },
  })) };
  ok(shape(many).length === MAX_PLACES && MAX_PLACES <= 6, `never more than ${MAX_PLACES}, a list a phone can show`);

  let threw = false;
  let answers;
  try {
    answers = [shape(null), shape({}), shape({ features: 'x' }), shape({ features: [{}, { geometry: { coordinates: [999, 999] }, properties: { name: 'Off the map' } }] })];
  } catch { threw = true; }
  ok(!threw && answers.every((a) => Array.isArray(a) && a.length === 0),
    'nonsense from the service is skipped, never drawn and never a crash');
}

// ---------------------------------------------------------------------------
// 2. TAPPING ONE SECURES IT
// ---------------------------------------------------------------------------
{
  const [first] = shape(fixture('photon-jollibee-imus.json'));
  const saved = pinFor(first);
  const opens = placeUrl('in_person', saved);
  ok(opens === pinUrl(first.lat, first.lon), 'the saved place opens its exact spot, not a search for its words');
  ok(placeLabel(opens) === 'Open in Maps', 'behind a button that says Open in Maps');
  ok(wordsBesideLink(saved) === 'Jollibee, Aguinaldo Highway, Anabu II-D, Imus, Cavite',
    'and the card still reads it as a name and an address');
  const pin = pinOf(saved);
  ok(pin && Math.abs(pin.lat - 14.370575) < 1e-6 && Math.abs(pin.lon - 120.939158) < 1e-6,
    'the pin can be read back to the coordinate');

  const long = pinFor({ name: 'N'.repeat(300), detail: 'D'.repeat(400), kind: '', lat: 14.4, lon: 120.9 });
  ok(long.length <= 500 && placeUrl('in_person', long) === pinUrl(14.4, 120.9),
    'a very long name is cut, never the link -- and it still fits the column');

  ok(pinOf('Church cafe, 12 Rizal St, Cavite') === null, 'an address typed by hand is not mistaken for a pin');
  ok(placeUrl('in_person', 'Church cafe, 12 Rizal St, Cavite')?.includes('query=Church%20cafe'),
    'and still opens as a map search for its words, as it always did');

  const near = nearOf(['typed words', saved]);
  ok(near && near.lat === 14.4 && near.lon === 120.9,
    'the town to prefer is rounded to about eleven kilometres BEFORE it leaves the phone');
}

// ---------------------------------------------------------------------------
// 3. IT SENDS THE LEAST
// ---------------------------------------------------------------------------
{
  ok(cleanQuery('jo') === null && cleanQuery('x'.repeat(81)) === null,
    'under three characters, or over eighty, nothing is asked');
  ok(cleanQuery('  jollibee   imus ') === 'jollibee imus', 'and what is asked is tidied first');
  ok(cleanQuery(`a${String.fromCharCode(0)}b${String.fromCharCode(10)}c`) === 'a b c', 'with no control characters');

  ok(JSON.stringify(nearFrom({ lat: 14.370575, lon: 120.939158 })) === '{"lat":14.4,"lon":120.9}',
    'the server rounds a point again, whatever it is sent');
  ok(nearFrom({ lat: 91, lon: 0 }) === null && nearFrom('x,y') === null && nearFrom(null) === null,
    'and ignores one that is not a point');

  const url = new URL(photonUrl('a&lat=0#b', null));
  ok(url.searchParams.get('q') === 'a&lat=0#b' && !url.searchParams.has('lat'),
    'nothing typed can add to the request: it is always the search words and nothing else');
  ok(!new URL(photonUrl('imus', null)).searchParams.has('lat'), 'no point is sent when there is none');

  const dir = 'supabase/functions/places';
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  ok(JSON.stringify(files) === JSON.stringify(['index.ts', 'photon.ts']),
    `the deploy sends exactly these files: ${files.join(', ')}`);
  ok(files.every((f) => !read(`${dir}/${f}`).includes(String.fromCharCode(92))),
    'with no backslash in either, so sending the source as JSON cannot rewrite it');

  const fn = code(read(`${dir}/index.ts`));
  ok(/if \(!token\) return json\(\{ error: 'Sign in first\.' \}, 401\)/.test(fn)
     && /auth\.getUser\(token\)/.test(fn), 'only somebody signed in can ask');
  ok(/if \(me\.suspended_at\) return json\([^;]*403\)/.test(fn) && /if \(!me\.is_approved\) return json\([^;]*403\)/.test(fn)
     && fn.indexOf('me.suspended_at)') < fn.indexOf('tooMany(who.user.id)') && fn.indexOf('!me.is_approved)') < fn.indexOf('tooMany(who.user.id)'),
    'and only if approved and not suspended, asked before anything else is done');
  // Spelled in two halves: tests/no-backend.js rejects any tracked file that
  // names the master key, this one included.
  const masterKey = new RegExp(['service', 'role'].join('[_-]?'), 'i');
  ok(!masterKey.test(fn) && /SUPABASE_ANON_KEY/.test(fn),
    'checked with the caller\'s own sign-in: the function holds no master key');
  ok(/tooMany\(who\.user\.id\)/.test(fn) && /429/.test(fn), 'and no faster than a person typing');
  ok(!/console\.(log|info|warn|error)/.test(fn), 'what was searched for is never logged');
  ok(/AbortSignal\.timeout\(/.test(fn), 'a slow service is given up on rather than waited for');
  ok(/'Cache-Control': 'no-store'/.test(fn), 'and nothing about the answer is kept on the way back');
  ok(/BEACON_ALLOWED_ORIGINS/.test(fn), 'the same allowed-websites setting as the other functions');

  // The browser side sends the words and the rounded town, and nothing else.
  const data = read('lib/live/data.ts');
  const search = data.slice(data.indexOf('export async function searchPlaces('), data.indexOf('\n}\n', data.indexOf('export async function searchPlaces(')));
  ok(/body: \{ q: words, \.\.\.\(near \? \{ near \} : \{\}\) \}/.test(search), 'the app sends the words and, if any, the rounded town');
  const meetings = read('components/LiveMeetings.tsx');
  ok(/const near = useMemo\(\(\) => nearOf\(/.test(meetings) && /live\.searchPlaces\(q, near\)/.test(meetings),
    'and the town is the one nearOf rounded, never a raw pin');

  const notice = read('app/privacy/page.tsx').replace(/\s+/g, ' ');
  ok(/OpenStreetMap/.test(notice) && /place/i.test(notice) && /komoot/.test(notice),
    'the privacy notice names who the words go to');
}

// ---------------------------------------------------------------------------
// 4. THE BOX ITSELF, AND THE SAMPLE APP
// ---------------------------------------------------------------------------
{
  const box = code(read('components/PlaceSearch.tsx'));
  ok(/const PAUSE_MS = 3\d\d;/.test(box), 'it waits for a pause in the typing before it asks');
  ok(/\.then\(\(found\) => \{[\s\S]{0,300}?if \(latest\.current !== q\) return;\s*setPlaces\(found\)/.test(box),
    'a slow answer to half a word never replaces the answer to the whole word');
  ok(/role="combobox"/.test(box) && /role="listbox"/.test(box) && /role="option"/.test(box),
    'it is announced as a list of suggestions to a screen reader');
  ok(/Use &ldquo;\{typed\}&rdquo; as typed/.test(box), 'what was typed can always be used as it is');
  ok(/'© OpenStreetMap contributors'/.test(box), 'OpenStreetMap is credited, in the words it asks for');
  ok(/Check it on the map/.test(box) && />\s*Change\s*</.test(box),
    'a chosen place can be checked on the map before anybody goes there, and changed');
  ok(/kind: 'before'/.test(box) && box.indexOf('...before.map(') < box.indexOf('fresh : []).map('),
    'places met before are offered first');

  // WHAT WAS TYPED IS DRAWN IN BOLD, as a search engine does, so a person sees
  // at a glance why each place was offered.
  const bold = (text, typed) => matchedParts(text, typed).filter((p) => p.hit).map((p) => p.text);
  ok(JSON.stringify(bold('Jollibee', 'jolli')) === '["Jolli"]', 'the letters typed are the ones marked');
  ok(JSON.stringify(bold('Manila Cathedral', 'cathed man')) === '["Man","Cathed"]',
    'every word typed is marked wherever it is, in any order');
  ok(matchedParts('SM City Bacoor', 'xyz').length === 1 && bold('SM City Bacoor', '').length === 0,
    'and nothing is marked when nothing matches');
  ok(matchedParts('Imus Cathedral', 'cath').map((p) => p.text).join('') === 'Imus Cathedral',
    'the name is never changed by being marked');
  ok(/<Matched text=\{title\}/.test(box), 'the list draws names through the marking');

  // DRAWN ICONS, as the visual language asks (docs/VISUAL-LANGUAGE.md): an
  // emoji pin per row was loud, and a different shape on every phone.
  ok(/<PinGlyph/.test(box) && /<ClockGlyph/.test(box) && !/[\u{1F4CD}\u{1F558}]/u.test(box),
    'the rows are marked with drawn icons, not emoji');
  ok(!/text-\[1[0-2]px\]/.test(box), 'nothing in the box is smaller than a person can read');

  // THE FORM FITS A PHONE. Its grid used to size its one column to the date
  // box's natural width, about fifty pixels wider than a phone, and the card
  // cut the right-hand side off -- half the "In person" button, the end of
  // every suggestion. The page itself never scrolled sideways, which is why
  // no width check noticed.
  ok(/className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50/.test(read('components/LiveMeetings.tsx')),
    'the appointment form is one column exactly as wide as its card');

  const sample = read('components/Meetings.tsx');
  ok(/search=\{searchSamplePlaces\}/.test(sample) && !/searchPlaces\(/.test(sample.replace(/searchSamplePlaces/g, '')),
    'the sample app uses the same box with its own sample places, and asks no server');
  ok(SAMPLE_PLACES.every((p) => p.kind !== 'Address'), 'the sample places are public landmarks, never somebody\'s address');
  const cathedrals = await searchSamplePlaces('cathedral');
  ok(cathedrals.length === 2 && cathedrals[0].detail !== cathedrals[1].detail,
    'and typing "cathedral" there shows why the address line matters');
}

console.log(bad === 0 ? '\nThe right place, one tap, and nothing more sent than needed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
