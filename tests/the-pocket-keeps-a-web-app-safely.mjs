// A pasted address becomes a tile, and cannot become a script.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. "First I will copy the URL of the web app like example,
// spotify, youtube, or facebook, then I will paste it on the URL of the pocket
// micro-app and I click the save button, then it automatically registers the
// logo and app URL... that can be helpful to ALL users."
//
// This replaces tests/a-room-for-the-apps-a-church-uses.mjs, retired in the
// same commit because the room it described is gone. Retiring a check is how
// coverage silently drops, so every SECURITY assertion that file made is
// carried over here and made to fit the new shape. The room's list lived in a
// table with policies; the pocket's lives in the browser. What does not change
// is that a string somebody pasted ends up in an href.
//
// THE ONE THAT MATTERS. `javascript:` and `data:` in an href execute in this
// app's own origin, with the person's session behind them. The pocket stores a
// pasted string and later renders it as a link, so that is the whole attack
// surface and it is checked as behaviour: the real function is imported and
// fed the real hostile strings, rather than the source being pattern-matched
// for a word.
//
//   node tests/the-pocket-keeps-a-web-app-safely.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const lib = read('lib/pocket.ts');
const ui = strip(read('components/Pocket.tsx'));

// ---------------------------------------------------------------------------
// 1. WHAT IT REFUSES  (executed, not pattern-matched)
// ---------------------------------------------------------------------------
{
  // The module is TypeScript and this is a plain node check, so the function is
  // read out of the source and evaluated with the one import it depends on
  // stubbed to the real rule. Testing the actual branching beats asserting that
  // the file contains a promising-looking regular expression -- which is the
  // mistake this repository has already had to correct more than once.
  const body = lib.slice(lib.indexOf('export function tidyUrl'));
  const fn = body
    .slice(0, body.indexOf('\n}') + 2)
    .replace('export function', 'function')
    // The source is TypeScript and this is plain node, so the two annotations
    // this function carries are removed. Deliberately narrow: a broad
    // type-stripping regex would quietly mangle the body, and it is the BODY
    // that is under test.
    .replace('(raw: string)', '(raw)')
    .replace(/:\s*string\s*\|\s*null/g, '');
  // The genuine protocol rule from lib/url.ts, stated once here.
  const safeExternalUrl = (u) => {
    try {
      const p = new URL(String(u).trim());
      return (p.protocol === 'https:' || p.protocol === 'http:') ? String(u).trim() : null;
    } catch { return null; }
  };
  // eslint-disable-next-line no-new-func
  const tidyUrl = new Function('safeExternalUrl', `${fn}; return tidyUrl;`)(safeExternalUrl);

  const hostile = [
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    // THE THREE THAT MAKE THIS ASSERTION MEAN ANYTHING. The first version of
    // this list held only schemes with an EMPTY host, so the "a host must have
    // a dot in it" rule below refused every one of them by accident -- and when
    // the delegation to safeExternalUrl was deleted on purpose to check that
    // this test bites, it stayed green. It was passing for the wrong reason and
    // proving nothing about the protocol gate.
    //
    // A dotted host with a dangerous scheme is the real bypass: a browser reads
    // `//` as a comment and `%0A` as a newline, so the href below executes
    // alert(document.cookie) in this app's own origin, with the person's
    // session behind it. Only the protocol check stops these.
    'javascript://evil.example/%0Aalert(document.cookie)',
    'vbscript://evil.example/x',
    'data://evil.example/x',
    '',
    '   ',
    'not a url',
    'localhost',
  ];
  const refused = hostile.filter((h) => tidyUrl(h) === null);
  ok(refused.length === hostile.length,
     `every dangerous or empty address is refused (${refused.length}/${hostile.length})`
     + (refused.length === hostile.length ? ''
        : ` -- LET THROUGH: ${hostile.filter((h) => tidyUrl(h) !== null).join(', ')}`));

  const good = ['https://open.spotify.com', 'http://example.org/a?b=c', 'youtube.com'];
  const kept = good.filter((g) => tidyUrl(g) !== null);
  ok(kept.length === good.length,
     `and a real web address still goes in, prefix or not (${kept.length}/${good.length})`);
}

// ---------------------------------------------------------------------------
// 2. ONE RULE, NOT A SECOND WEAKER COPY
// ---------------------------------------------------------------------------
//
// The clipboard had exactly this happen: a component reached past the guarded
// helper for navigator.clipboard, and a check now forbids it. The same applies
// to deciding what may go in an href.
{
  ok(/safeExternalUrl/.test(lib),
     'the protocol decision is delegated to lib/url.ts, not re-implemented');
  ok(!/protocol\s*!==\s*'https:'/.test(lib),
     'and this file does not keep its own copy of that rule');
}

// ---------------------------------------------------------------------------
// 3. THE LINK ITSELF
// ---------------------------------------------------------------------------
{
  ok(/target="_blank"/.test(ui) && /rel="noopener noreferrer"/.test(ui),
     'a tile opens in a new tab with noopener and noreferrer');
}

// ---------------------------------------------------------------------------
// 4. NO LOGO IS FETCHED FROM ANYWHERE
// ---------------------------------------------------------------------------
//
// THE PRIVACY HALF, and the reason the marks are drawn rather than downloaded.
// A favicon per tile would need img-src widened to arbitrary origins, and would
// tell each of those companies that this person is here every time the rail
// renders. The CSP is the backstop; this is the rule that keeps the code from
// needing the CSP changed in the first place.
{
  ok(!/fetch\(|<img|XMLHttpRequest|googleusercontent|\/favicon/.test(ui + lib),
     'no tile fetches anything: the mark is computed from the address');

  // The CSP lives in next.config.mjs. Only the app's own backend origin is
  // added to it (for member photos); the base list is the backstop that would
  // have to be widened before any third-party favicon could load at all.
  const csp = read('next.config.mjs');
  ok(/const imageSources = \["'self'", 'data:', 'blob:'\]/.test(csp),
     'and img-src starts from self, data and blob only');
  ok(!/imageSources\.push\((?!backend\.origin)/.test(csp),
     'with nothing but the app\'s own backend added to it');
}

// ---------------------------------------------------------------------------
// 5. STORAGE CANNOT BREAK THE PAGE
// ---------------------------------------------------------------------------
//
// A private window throws on localStorage rather than returning null, and
// reading it during render makes the server's first paint disagree with the
// browser's. Both have bitten this app before.
{
  ok(/useEffect\(\(\) => \{ setItems\(readPocket\(\)\); \}, \[\]\);/.test(ui),
     'the pocket is read in an effect, not during render');
  ok((lib.match(/catch/g) ?? []).length >= 2,
     'and every storage access is wrapped, because a private window refuses');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
