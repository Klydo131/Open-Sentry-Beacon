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
// 4. THE LOGO IS REAL, AND THE PHONE STILL NEVER TALKS TO THAT COMPANY
// ---------------------------------------------------------------------------
//
// THIS RULE CHANGED ON PURPOSE. It used to read "no tile fetches anything",
// because the marks were drawn from the hostname and a favicon would have
// needed img-src widened to arbitrary origins AND would have told each company
// that a church member was on their screen, every render.
//
// Asked for directly -- "I wanted to see the logo of the web app please if
// there is a logo" -- and the answer moves the fetch rather than accepts
// either cost. app/api/app-icon fetches it SERVER-SIDE, so the tile's src is
// this app's own origin: `img-src 'self'` covers it with nothing widened, and
// the only thing the company sees is a server asking for a picture, once,
// carrying nothing about any member.
//
// So what is asserted is no longer "nothing is fetched" but the two things
// that made that rule worth having: the browser never names a third-party
// host, and the policy is untouched.
{
  const route = read('app/api/app-icon/route.ts');

  ok(/src=\{`\/api\/app-icon\?url=\$\{encodeURIComponent/.test(read('components/Pocket.tsx')),
     'a tile asks this app for the logo, never the other site directly');

  ok(!/<img[^>]*src=\{`?https?:/.test(ui),
     'and no tile ever points its src at a third-party address');

  const csp = read('next.config.mjs');
  ok(/const imageSources = \["'self'", 'data:', 'blob:'\]/.test(csp),
     'img-src is still self, data and blob only — nothing was widened for this');
  ok(!/imageSources\.push\((?!backend\.origin)/.test(csp),
     'with nothing but the app\'s own backend added to it');

  // THE DRAWN MARK IS STILL THERE, UNDERNEATH. A site with no logo, a failed
  // fetch and an offline phone are all ordinary; if the fallback went away this
  // feature would have replaced a tile that always worked with one that
  // sometimes does.
  ok(/markFor/.test(ui) && /onError=/.test(ui),
     'and the drawn mark still shows when a site has no logo or the fetch fails');
}

// ---------------------------------------------------------------------------
// 4b. A SERVER THAT FETCHES A TYPED URL IS FENCED
// ---------------------------------------------------------------------------
//
// THE PART THAT WOULD BE DANGEROUS TO GET WRONG. "The server" sits inside the
// network and the person typing does not, so an unfenced fetcher is a
// request-forgery engine: paste http://169.254.169.254/ and the reply is the
// cloud host's own credentials. The address test is a pure function, so it is
// executed here against the real targets rather than pattern-matched.
{
  const route = read('app/api/app-icon/route.ts');

  const at = route.indexOf('function isPrivateAddress');
  const fnSrc = route.slice(at, route.indexOf('\n}', at) + 2)
    .replace('(ip: string): boolean', '(ip)')
    .replace(/:\s*boolean/g, '');
  // eslint-disable-next-line no-new-func
  const isPrivateAddress = new Function(`${fnSrc}; return isPrivateAddress;`)();

  const mustBlock = [
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::',
    'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254',
  ];
  const leaked = mustBlock.filter((ip) => !isPrivateAddress(ip));
  ok(leaked.length === 0,
     `every private and metadata address is refused (${mustBlock.length - leaked.length}/${mustBlock.length})`
     + (leaked.length ? ` — LET THROUGH: ${leaked.join(', ')}` : ''));

  const mustAllow = ['1.1.1.1', '142.250.72.14', '2606:4700::1111'];
  ok(mustAllow.every((ip) => !isPrivateAddress(ip)),
     'and an ordinary public address still resolves');

  // The fence has to be applied, not merely defined — and at every hop, since
  // a public URL that redirects to the metadata address is the usual way past.
  ok(/addresses\.some\(\(a\) => isPrivateAddress\(a\.address\)\)/.test(route),
     'the address test is applied to every address a host resolves to');
  ok(/redirect: 'manual'/.test(route),
     'redirects are followed by hand, not blindly');
  ok(/current = await publicUrl\(new URL\(location, current\)/.test(route),
     'and each redirect target is re-checked before it is opened');

  ok(/if \(!type\.startsWith\('image\/'\)\) continue;/.test(route),
     'only an image is ever returned, so this is not an open proxy');
  ok(/MAX_ICON_BYTES/.test(route) && /MAX_HTML_BYTES/.test(route) && /readCapped/.test(route),
     'responses are capped, so an endless one cannot hold a worker');
  ok(/AbortController/.test(route) && /FETCH_TIMEOUT_MS/.test(route),
     'and every fetch has a timeout');
  ok(/export const runtime = 'nodejs'/.test(route),
     'the route runs where DNS exists, or the fence could not be built at all');
  ok(/safeExternalUrl/.test(route),
     'and the protocol decision is still lib/url.ts\'s, not a third copy');
}

// ---------------------------------------------------------------------------
// 5. STORAGE CANNOT BREAK THE PAGE
// ---------------------------------------------------------------------------
//
// A private window throws on localStorage rather than returning null, and
// reading it during render makes the server's first paint disagree with the
// browser's. Both have bitten this app before.
{
  // THE PROPERTY, NOT THE LINE. This pinned one exact statement and then
  // refused the commit that moved the tiles into the database -- the loader
  // became an async function called from an effect, which reads storage in
  // exactly the same place for exactly the same reason. Fifth exact-expression
  // pin in this repository to block its own intention, third of them mine.
  //
  // What matters is that nothing reads storage while rendering: the server has
  // no localStorage, so a read during render makes the first paint disagree
  // with the second. So the rule is that every readPocket() call sits inside a
  // hook, and none is in the body of the component.
  const reads = [...ui.matchAll(/readPocket\(\)/g)].map((m) => m.index ?? 0);
  ok(reads.length > 0, 'the pocket is read somewhere');
  const inAHook = reads.every((at) => {
    // Walk back to the nearest useEffect/useCallback opening before this read.
    const before = ui.slice(0, at);
    const hook = Math.max(before.lastIndexOf('useEffect('), before.lastIndexOf('useCallback('));
    if (hook < 0) return false;
    // And make sure that hook has not already closed before the read.
    let depth = 0;
    for (let i = hook; i < at; i += 1) {
      if (ui[i] === '(') depth += 1;
      else if (ui[i] === ')') { depth -= 1; if (depth === 0) return false; }
    }
    return true;
  });
  ok(inAHook, 'and every read of it happens inside a hook, never during render');
  ok((lib.match(/catch/g) ?? []).length >= 2,
     'and every storage access is wrapped, because a private window refuses');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
