// What may become a clickable link, and what must stay text.
//
// This runs against lib/linkify.ts directly, which is why the rules live in a
// plain TypeScript file with no JSX in it. The component that draws them is not
// interesting; the decisions are.
//
// THE THING THIS FILE EXISTS TO PREVENT. Linkifying is how an app whose users
// type at each other grows an XSS hole. Two separate defences have to hold:
//
//   1. Nothing ever becomes HTML. The renderer emits React elements and plain
//      strings, and React escapes strings — so markup somebody types is markup
//      the reader sees, not markup the browser runs. That property is enforced
//      by there being no dangerouslySetInnerHTML anywhere near it, which
//      tests/no-backend.js and a grep both cover.
//   2. Escaping does not make a URL safe. `javascript:alert(1)` is a valid URL
//      and a working attack the moment it lands in an href. That is what the
//      protocol allowlist below is for, and it is the half people forget.
//
//   node tests/linkify.mjs

import { linkifyParts, safeHref } from '../lib/linkify.ts';
import { safeExternalUrl, safeLinkHref } from '../lib/url.ts';

let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`${cond ? 'OK ' : 'BAD'} ${msg}`); };

const hrefs = (text) => linkifyParts(text).filter((p) => typeof p !== 'string').map((p) => p.href);
const plain = (text) => linkifyParts(text).map((p) => (typeof p === 'string' ? p : p.label)).join('');

// ---------------------------------------------------------------- dangerous --
// Each of these is a real attack if it reaches an href. None may become a link.
const HOSTILE = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'about:blank',
  'blob:https://example.org/abc',
];
for (const attack of HOSTILE) {
  ok(safeHref(attack) === null, `refused as an href: ${attack.slice(0, 42)}`);
  ok(hrefs(attack).length === 0, `refused as a link in a message: ${attack.slice(0, 42)}`);
}

// A hostile scheme hidden mid-sentence must not be rescued by the surrounding
// text either.
ok(hrefs('look at javascript:alert(1) now').length === 0,
   'a hostile scheme inside a sentence is still refused');

// ------------------------------------------------------------ the @ deception --
// `https://adventist.org@evil.example/give` is a valid URL that goes to
// evil.example. Everything before the @ is user info the browser ignores, and a
// reader sees the trustworthy name on the left. It must never become a link.
const DECEPTIVE = [
  'https://adventist.org@evil.example/give',
  'https://www.paypal.com@192.168.1.1/login',
  'http://bank.example:pass@evil.example',
];
for (const trap of DECEPTIVE) {
  ok(safeHref(trap) === null, `refused: a URL carrying user info — ${trap.slice(0, 44)}`);
  ok(hrefs(trap).length === 0, `and it stays plain text in a message — ${trap.slice(0, 30)}`);
}
ok(plain(DECEPTIVE[0]) === DECEPTIVE[0],
   'the reader still sees the whole deceptive URL as text, @ and all');

// --------------------------------------------------------- token boundaries --
// A link must start where a link can start, not in the middle of another token.
ok(hrefs('blob:https://example.org/abc').length === 0,
   'the https inside a blob: URL is not pulled out as a link');
ok(hrefs('notalink.example/https://example.org').length === 0,
   'a URL buried inside a longer token is not linked');
ok(hrefs('(https://example.org)').length === 1,
   'a link in brackets still counts as starting at a boundary');

// ------------------------------------------------------------------- markup --
// Text that looks like markup stays text. The renderer never builds HTML, so
// this is belt and braces — but the URL run deliberately stops at `<` so a link
// can never swallow the start of a tag.
const withTag = '<script>alert(1)</script> https://example.org';
ok(hrefs(withTag).length === 1 && hrefs(withTag)[0].startsWith('https://example.org'),
   'markup around a link does not change what gets linked');
ok(plain(withTag) === withTag, 'the text is preserved exactly, tags and all');

const tagAfter = 'https://example.org<script>';
ok(hrefs(tagAfter)[0] === 'https://example.org/',
   'a link stops at `<` rather than absorbing a tag');

// --------------------------------------------------------------- the normal --
ok(hrefs('see https://adventist.org/study for more')[0] === 'https://adventist.org/study',
   'a plain https link is linked');
ok(hrefs('go to www.adventist.org today')[0] === 'https://www.adventist.org/',
   'a bare www. link gets https and is linked');
ok(hrefs('http://example.org').length === 1, 'http is allowed as well as https');
ok(hrefs('no links in this one at all').length === 0, 'text with no link produces no links');

// Two links in one message, both kept.
ok(hrefs('https://a.example.org and https://b.example.org').length === 2,
   'two links in one message are both linked');

// ------------------------------------------------------- sentence punctuation --
// The full stop belongs to the writer, not the address.
const sentence = 'Read https://example.org/psalms.';
ok(hrefs(sentence)[0] === 'https://example.org/psalms',
   'a trailing full stop is not part of the link');
ok(plain(sentence) === sentence, 'and the full stop is still shown to the reader');

ok(hrefs('(see https://example.org/a)')[0] === 'https://example.org/a',
   'a closing bracket the URL did not open is not part of the link');
ok(hrefs('https://en.wikipedia.org/wiki/Advent_(disambiguation)')[0]
     .endsWith('(disambiguation)'),
   'brackets the URL DID open are kept');

ok(hrefs('ask at https://example.org/help?')[0] === 'https://example.org/help',
   'a trailing question mark is punctuation, not the address');

// ------------------------------------------------------------- text integrity --
// Whatever happens, the reader must see exactly what the writer wrote.
for (const sample of [
  'Hello https://example.org there',
  'https://example.org',
  'nothing here',
  'trailing... https://example.org/x...',
  '<b>bold</b> https://example.org',
]) {
  ok(plain(sample) === sample, `text is reproduced exactly: ${JSON.stringify(sample.slice(0, 34))}`);
}

// A /g regex keeps its lastIndex between calls. Sharing one silently drops
// every other match, which is invisible until somebody sends two messages.
const repeated = 'https://example.org/one';
ok(hrefs(repeated).length === 1 && hrefs(repeated).length === 1,
   'calling it twice gives the same answer both times');

// ------------------------------------------------ the typed-in link fields --
// safeExternalUrl guards a DIFFERENT path from the prose above: a lesson's
// link and a material's external_url, which a Guide or Director types into a
// form. Thirteen call sites, every one of them tapped by an Explorer.
//
// It used to be the regex /^https?:\/\/\S+$/i, which matched
// `https://adventist.org@evil.example/give` happily. Both now share one
// validator, so prose links and typed link fields cannot disagree about what
// counts as safe.
for (const trap of DECEPTIVE) {
  ok(safeExternalUrl(trap) === null, `link field refuses user info: ${trap.slice(0, 40)}`);
}
for (const attack of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example/x']) {
  ok(safeExternalUrl(attack) === null, `link field refuses: ${attack.slice(0, 34)}`);
}
ok(safeExternalUrl('https://adventist.org/study') === 'https://adventist.org/study',
   'a genuine link field still works');
ok(safeExternalUrl('  https://adventist.org/study  ') === 'https://adventist.org/study',
   'surrounding whitespace is trimmed');
ok(safeExternalUrl('https://adventist.org/a?b=1&c=2') === 'https://adventist.org/a?b=1&c=2',
   'the original string is returned, not a rewritten one');

// safeLinkHref additionally allows an in-app path, and must still refuse a
// protocol-relative URL, which looks like a path and is another origin.
ok(safeLinkHref('/join?token=abc') === '/join?token=abc', 'an in-app path is allowed');
ok(safeLinkHref('//evil.example/x') === null, 'a protocol-relative URL is refused');
ok(safeLinkHref('https://adventist.org@evil.example') === null,
   'and it inherits the user-info refusal');

// A LOOK-ALIKE HOST (security review, 1 October 2026). `\u0430` is Cyrillic,
// and on screen `\u0430pple.com` is indistinguishable from the real name.
{
  const lookalike = linkifyParts('see https://\u0430pple.com/login now').find((p) => typeof p !== 'string');
  ok(lookalike && lookalike.href === 'https://xn--pple-43d.com/login' && lookalike.label === 'https://xn--pple-43d.com/login',
     'a host in another alphabet is shown as the address the tap really opens');
  const accented = linkifyParts('https://iglesia-espa\u00f1a.org/caf\u00e9').find((p) => typeof p !== 'string');
  ok(accented && accented.label === 'https://xn--iglesia-espaa-tkb.org/caf\u00e9',
     'only the host changes: the rest of the address keeps the words as written');
  const plain = linkifyParts('https://adventist.org/x and www.adventist.org').filter((p) => typeof p !== 'string');
  ok(plain.length === 2 && plain[0].label === 'https://adventist.org/x' && plain[1].label === 'www.adventist.org',
     'and an ordinary address is shown exactly as it was written');
}

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
