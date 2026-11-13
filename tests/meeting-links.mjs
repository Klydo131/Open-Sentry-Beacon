// The way in to a meeting is one tap, and only ever to somewhere safe.
//
// THE GAP: an online meeting had nowhere to put the link to join it. Migration
// 0009 describes `location` as "a place for in person, or a joining address for
// online" -- one field, on purpose. The write path then threw the value away
// whenever the meeting was online, so the half the schema described was never
// reachable, and two people who had just agreed a Zoom call still had to send
// the address to each other in a message.
//
// WHY THIS IS A TEST AND NOT JUST A FEATURE. Anything that turns text somebody
// typed into an href is an injection surface. `javascript:alert(1)` is a valid
// URL and runs on click. `https://zoom.us@evil.example/j/1` is a valid URL that
// goes to evil.example, while a human reads the trustworthy name on the left --
// and this field is filled in by a Guide and tapped by the Explorer they walk
// with, which is inside this app's threat model rather than outside it.
//
// So this runs the real function over the real cases.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const target = pathToFileURL(path.resolve('lib/live/meeting-link.ts')).href;
let mod;
try {
  mod = await import(target);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(
    String(err && (err.code || err.message)));
  if (!strippable || process.env.MEETING_LINK_RETRY === '1') {
    console.error('BAD could not load lib/live/meeting-link.ts on ' + process.version
      + '\n    ' + String(err && err.message));
    process.exit(1);
  }
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, MEETING_LINK_RETRY: '1' } },
  );
  process.exit(r.status ?? 1);
}
const { joinUrl, joinLabel, wordsBesideLink, hasLink, placeUrl, placeLabel } = mod;

// ---------------------------------------------------------------------------
// 1. The links people actually paste become buttons.
// ---------------------------------------------------------------------------
for (const [url, expected] of [
  ['https://zoom.us/j/1234567890', 'Join the Zoom call'],
  ['https://us02web.zoom.us/j/8899?pwd=abc', 'Join the Zoom call'],
  ['https://meet.google.com/abc-defg-hij', 'Join on Google Meet'],
  ['https://teams.microsoft.com/l/meetup-join/x', 'Join on Teams'],
  ['https://whereby.com/sentry-beacon', 'Join on Whereby'],
  ['https://meet.jit.si/SentryBeacon', 'Join on Jitsi'],
  ['https://m.me/j/AbCdEf', 'Join on Messenger'],
]) {
  const href = joinUrl('online', url);
  ok(href !== null, `${url} becomes a link`);
  if (href) ok(joinLabel(href) === expected, `  and is called "${expected}"`);
}

// Something nobody here has heard of still works, with honest wording.
{
  const href = joinUrl('online', 'https://calls.example.org/room/12');
  ok(href !== null, 'an unrecognised service still becomes a link');
  ok(joinLabel(href) === 'Join the call', '  and gets the general wording rather than a guess');
}

// How people write a link when they are not thinking about schemes.
ok(joinUrl('online', 'www.zoom.us/j/123') !== null, 'a bare www. address still works');

// ---------------------------------------------------------------------------
// 1b. AN ADDRESS PASTED THE WAY PEOPLE ACTUALLY COPY ONE.
// ---------------------------------------------------------------------------
// Reported from a real appointment: a Guide pasted `meet.google.com/idn-soex-nkb`
// and the card showed it as dead text with no Join button. Nothing hands you a
// `www.` any more, and the address bar hides the `https://` before you copy it,
// so the likeliest paste of all was the one shape the field refused.
for (const [pasted, expect] of [
  ['meet.google.com/idn-soex-nkb', 'https://meet.google.com/idn-soex-nkb'],
  ['zoom.us/j/9876543210', 'https://zoom.us/j/9876543210'],
  ['teams.microsoft.com/l/meetup-join/x', 'https://teams.microsoft.com/l/meetup-join/x'],
  ['meet.jit.si/SentryBeacon', 'https://meet.jit.si/SentryBeacon'],
]) {
  ok(joinUrl('online', pasted) === expect, `pasted without https:// still joins (${pasted})`);
}
ok(joinLabel(joinUrl('online', 'meet.google.com/idn-soex-nkb')) === 'Join on Google Meet',
   'and the button is named after the service, not "Join the call"');

// The mean half of the shape test. A dot is not enough to make something an
// address, and turning a time into a link to a website called `7.30pm` is a
// worse failure than the missing button this fixes.
for (const notAnAddress of [
  '7.30pm',
  '4.30',
  'ring me at 7.30pm',
  'Zoom.',
  'meet me at the church.',
  'idn-soex-nkb',
  '192.168.1.1',
]) {
  ok(joinUrl('online', notAnAddress) === null,
     `still not a button: "${notAnAddress}"`);
}
ok(joinUrl('online', '  https://zoom.us/j/123  ') !== null, 'surrounding spaces are trimmed');

// ---------------------------------------------------------------------------
// 2. THE ATTACKS. None of these may ever reach an href.
// ---------------------------------------------------------------------------
for (const nasty of [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  // Reads as Zoom, goes to evil.example. Everything before the @ is user info
  // the browser ignores and a person does not.
  'https://zoom.us@evil.example/j/123',
  'https://meet.google.com:pass@evil.example/x',
  'file:///etc/passwd',
  // THE NEW DOOR. Supplying a missing scheme must not supply one to these:
  // anything carrying its own scheme is passed through untouched, and a bare
  // address carrying user info is still refused by the guard.
  'zoom.us@evil.example/j/123',
  'meet.google.com:pass@evil.example/x',
  'javascript:alert(1)//zoom.us',
]) {
  ok(joinUrl('online', nasty) === null, `refused: ${nasty.slice(0, 46)}`);
}

// ---------------------------------------------------------------------------
// 3. Not everything typed there is a link, and that is allowed.
// ---------------------------------------------------------------------------
//  is a real answer to where. It is kept and shown as
// written, and must not become a button that goes nowhere.
for (const text of ['I will ring you at seven', 'Zoom, I will send it', '']) {
  ok(joinUrl('online', text) === null, `not a button: "${text}"`);
}
ok(joinUrl('online', null) === null, 'a meeting with no address has no button');
ok(joinUrl('online', undefined) === null, 'and neither has one that never had the field');

// ---------------------------------------------------------------------------
// 3b. THE LINK IS USUALLY NOT THE WHOLE FIELD.
// ---------------------------------------------------------------------------
// Reported as (a bug report). Two separate
// failures, and the second is the worse one:
//
//   "Zoom link: https://zoom.us/j/123"      -> no button at all
//   "https://zoom.us/j/123 (password 4321)" -> a button to
//                          https://zoom.us/j/123%20(password%204321)
//
// A URL parser does not reject a space, it ESCAPES it, so a sentence typed
// after the address was swallowed into the path and the card showed a
// confident Join button that goes to a 404. Dead text at least looks dead.
// Both shapes are how people actually paste a meeting link.
for (const [text, href, note] of [
  ['Zoom link: https://zoom.us/j/123', 'https://zoom.us/j/123', 'Zoom link'],
  ['https://zoom.us/j/123 (password 4321)', 'https://zoom.us/j/123', '(password 4321)'],
  ['https://meet.google.com/abc-defg-hij bring your bible',
    'https://meet.google.com/abc-defg-hij', 'bring your bible'],
  ['join at www.zoom.us/j/9 please', 'https://www.zoom.us/j/9', 'join at please'],
]) {
  ok(joinUrl('online', text) === href,
    `the link is found inside the sentence: "${text.slice(0, 44)}"`);
  ok(wordsBesideLink(text) === note,
    `and the words around it survive: ${JSON.stringify(wordsBesideLink(text))}`);
}

// THE PASSCODE IS THE POINT. The card used to show the Join button and drop
// everything else, which threw away the half you cannot join without.
ok(wordsBesideLink('https://zoom.us/j/123 (password 4321)').includes('4321'),
  'a passcode written beside the link is not thrown away with the URL');

// A field that is nothing but the link keeps the card clean.
for (const only of ['https://zoom.us/j/1234567890', 'meet.google.com/idn-soex-nkb']) {
  ok(wordsBesideLink(only) === '', `nothing extra to show for a bare address: ${only}`);
}
// No link at all: the card shows the raw text itself, so there is no note.
ok(wordsBesideLink('I will ring you at seven') === '', 'and prose is left to the card to print');

// THE CARD HAS TO ACTUALLY PRINT IT. joinNote returning the passcode is worth
// nothing if the component still hides everything whenever there is a button,
// which is exactly what it did before.
{
  const card = readFileSync('components/LiveMeetings.tsx', 'utf8');
  ok(/hasLink\(m\.location\) \? wordsBesideLink\(m\.location\)/.test(card),
    'the card shows the words around the link, not only the button');
  ok(/break-words[\s\S]{0,120}\{shown\}/.test(card),
    'and lets them wrap, because a truncated passcode is a passcode you cannot use');
  // ONE LINE FOR BOTH KINDS. Two near-identical blocks differing only in an
  // emoji is how the online branch got a fix the in-person branch did not.
  ok(/m\.mode === 'online' \? '💻' : '📍'/.test(card),
    'and one branch serves both, so neither can be fixed without the other');
}

// EXTRACTION MUST NOT WEAKEN THE GUARD. The dangerous shapes stay refused even
// though they now travel through a second code path.
for (const nasty of [
  'call me on https://zoom.us@evil.example/j/1',
  'here javascript:alert(1) ok',
]) {
  ok(joinUrl('online', nasty) === null, `still refused inside prose: ${nasty.slice(0, 40)}`);
}

// ---------------------------------------------------------------------------
// 3c. THE PLACE OF AN IN-PERSON MEETING, which had the same bug one field along.
// ---------------------------------------------------------------------------
// The place was always turned into a Google Maps SEARCH for whatever text was
// there. Paste the map link somebody shared from their phone and the app
// searched Maps for the URL -- which finds nothing, and throws away the exact
// pin the sender took trouble over in favour of guessing from its characters.
ok(placeUrl('in_person', 'https://maps.app.goo.gl/xyz123') === 'https://maps.app.goo.gl/xyz123',
  'a pasted map link opens that pin, not a search for its address');
ok(placeUrl('in_person', 'Church hall - https://maps.app.goo.gl/xyz123') === 'https://maps.app.goo.gl/xyz123',
  'and is still found when a hall name is written in front of it');
ok(wordsBesideLink('Church hall - https://maps.app.goo.gl/xyz123') === 'Church hall',
  'with the hall name kept, because the button only carries the pin');

// Plain words still become a search. This is the ordinary case and must not
// have been broken by the case above.
{
  const search = placeUrl('in_person', 'Church cafe, 12 Rizal St, Cavite');
  ok(search !== null && search.startsWith('https://www.google.com/maps/search/'),
    'a place and a street still becomes a map search');
  ok(search.includes(encodeURIComponent('Church cafe, 12 Rizal St, Cavite')),
    'and searches for exactly what was typed');
}

// THE TRAP ON THIS SIDE, and the reason the online field's bare-address
// fallback is deliberately NOT used here. This field is labelled "Church cafe,
// 12 Rizal St", so a lone token with a dot in it is a place, not a host.
{
  const marys = placeUrl('in_person', 'St.Mary');
  ok(marys !== null && marys.startsWith('https://www.google.com/maps/search/'),
    'St.Mary is a church, not a website called https://St.Mary');
  ok(!hasLink('St.Mary'), 'and is not mistaken for a link');
}

// A BUTTON MUST NOT LIE ABOUT WHERE IT GOES. "Open in Maps" was hard-coded,
// which was true while every link was a maps search and stops being true the
// moment a pasted link is honoured.
ok(placeLabel('https://www.google.com/maps/search/?api=1&query=x') === 'Open in Maps',
  'a map search is called Maps');
ok(placeLabel('https://maps.app.goo.gl/xyz') === 'Open in Maps', 'so is a shared map pin');
ok(placeLabel('https://facebook.com/events/123') === 'Open on Facebook',
  'a Facebook event says Facebook rather than Maps');
ok(placeLabel('https://docs.google.com/document/d/1') !== 'Open in Maps',
  'and another Google address is not called Maps just for being Google');

// An in-person place never produces a join button, and never the reverse.
ok(placeUrl('online', 'Church cafe') === null, 'an online meeting has no place button');

// ---------------------------------------------------------------------------
// 4. The two kinds of meeting do not borrow each other's controls.
// ---------------------------------------------------------------------------
ok(joinUrl('in_person', 'https://zoom.us/j/123') === null,
   'an in-person meeting never offers a Join button, whatever is in the field');
ok(joinUrl('in_person', 'Church cafe, 12 Rizal St') === null,
   'and a street address is not a link');

// The mirror of that, which is the one that would have shipped: mapsUrl was
// called for EVERY meeting. Harmless only while an online meeting could not
// have a location — and it can now, so a Zoom address would have been handed
// to Google Maps and searched for as though it were a street.
{
  const src = readFileSync('components/LiveMeetings.tsx', 'utf8');
  ok(/placeUrl\(m\.mode, m\.location\)/.test(src),
     'the map link is gated on the meeting being in person');
}

// ---------------------------------------------------------------------------
// 5. Every join link opens safely, everywhere it is drawn.
// ---------------------------------------------------------------------------
// target="_blank" without rel="noopener" hands the opened page a reference back
// to this one through window.opener.
for (const file of ['components/LiveMeetings.tsx', 'components/LiveDesk.tsx']) {
  const src = readFileSync(file, 'utf8');
  const anchors = src.split('data-meeting-join');
  ok(anchors.length > 1, `${file}: has at least one join link`);
  // Each marked anchor's attributes sit in the 320 characters around the mark.
  for (let i = 1; i < anchors.length; i++) {
    const around = anchors[i - 1].slice(-320) + anchors[i].slice(0, 160);
    ok(/rel="noopener noreferrer"/.test(around),
       `${file}: join link ${i} carries rel="noopener noreferrer"`);
    ok(/target="_blank"/.test(around),
       `${file}: join link ${i} opens in a new tab rather than leaving the app`);
  }
}

// ---------------------------------------------------------------------------
// 6. The write path keeps it.
// ---------------------------------------------------------------------------
{
  const src = readFileSync('lib/live/data.ts', 'utf8');
  const shipped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/location:\s*meeting\.mode === 'in_person'/.test(shipped),
     'an online meeting no longer has its joining address thrown away on save');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
