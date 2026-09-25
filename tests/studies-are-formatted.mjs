// A study is shown the way it was written.
//
// THE BUG THIS EXISTS FOR, reported with a photograph of a real phone.
//
// A study on the shelf read, on screen, exactly this:
//
//     **Read:** Mark 2, verses 23 to 28.
//     **Where this comes from:** *The Desire of Ages* has a chapter...
//     free at m.egwwritings.org/en/book/130/toc
//
// Every asterisk printed. The section headings -- the one thing that makes a
// study skimmable -- were the most damaged part, because they were the part
// that was marked up. And the address at the end was dead text in the room
// where an Explorer is being asked to go and read something.
//
// Counted in the live table at the time: fifteen of sixteen studies used
// `**bold**`, ten used `*italic*`, and NOT ONE link was written with `https://`
// or `www.` in front of it. So every study was damaged and every link was dead.
//
//   node tests/studies-are-formatted.mjs
//
// The parsers are transpiled and RUN, not read. Checking the source for the
// word "bold" proves nothing about what a person sees.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Source with comments blanked out, for rules about what the code DOES. */
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The three modules are stitched together and run, imports stripped, because
// they are one decision split across three files for testability.
const bundle = [
  read('lib/url.ts'),
  read('lib/linkify.ts').replace(/^import .*$/m, ''),
  read('lib/rich-text.ts').replace(/^import .*$/m, ''),
].join('\n').replace(/export /g, '');

const js = ts.transpileModule(
  `${bundle}\nmodule.exports = { richParts, linkifyParts, safeHref };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { richParts, linkifyParts } = mod.exports;

/** What a reader would see: the text, with nothing left of the markup. */
const plain = (t) => richParts(t).map((s) => s.text).join('');
const bolded = (t) => richParts(t).filter((s) => s.bold).map((s) => s.text);
const italics = (t) => richParts(t).filter((s) => s.italic).map((s) => s.text);
const hrefs = (t) => richParts(t).filter((s) => s.href).map((s) => s.href);

// ---------------------------------------------------------------------------
// 1. THE EXACT TEXT FROM THE PHOTOGRAPH
// ---------------------------------------------------------------------------
{
  const study = '**Read:** Mark 2, verses 23 to 28.\n\n'
    + 'His answer is one sentence.\n\n'
    + '**To think about:** what would a day genuinely built for your good look like?\n\n'
    + '**Where this comes from:** *The Desire of Ages* has a chapter on exactly '
    + 'this argument, free at m.egwwritings.org/en/book/130/toc';

  ok(!plain(study).includes('*'),
     'not one asterisk survives to the screen');
  ok(bolded(study).join(' | ') === 'Read: | To think about: | Where this comes from:',
     'each section opens with its heading in bold');
  ok(italics(study).join('') === 'The Desire of Ages',
     'and the book title is slanted');
  ok(hrefs(study).join('') === 'https://m.egwwritings.org/en/book/130/toc',
     'and the address at the end is a link somebody can tap');
  ok(plain(study).includes('Read: Mark 2, verses 23 to 28.'),
     'while every word of the study is still there, in order');
}

// ---------------------------------------------------------------------------
// 2. THE REAL LINKS OUT OF THE REAL STUDIES
// ---------------------------------------------------------------------------
//
// Written bare, every one of them. Before this, every one was dead text.
{
  const written = {
    'Read adventist.org/beliefs before we meet.': 'https://adventist.org/beliefs',
    'Start at m.egwwritings.org/en/book/108/toc': 'https://m.egwwritings.org/en/book/108/toc',
    'See voiceofprophecy.com/study/discover': 'https://voiceofprophecy.com/study/discover',
    'More at whiteestate.org': 'https://whiteestate.org/',
    'Visit adventist.org/beliefs.': 'https://adventist.org/beliefs',
  };
  for (const [text, want] of Object.entries(written)) {
    ok(hrefs(text).join('') === want, `a bare address is tappable: ${text.slice(0, 34)}`);
  }
  // The full stop at the end of a sentence is the writer's, not the address's.
  ok(plain('Visit adventist.org/beliefs.').endsWith('.'),
     'and the sentence keeps its full stop');
}
{
  // What already worked must keep working.
  ok(hrefs('Watch https://www.youtube.com/watch?v=abc now').join('')
     === 'https://www.youtube.com/watch?v=abc', 'a written-out address still links');
  ok(hrefs('Read www.biblegateway.com/passage').join('')
     === 'https://www.biblegateway.com/passage', 'and so does a www one');
}

// ---------------------------------------------------------------------------
// 3. WHAT MUST NEVER BECOME A LINK
// ---------------------------------------------------------------------------
//
// The reason the endings are a LIST rather than "any dot then letters". The
// commonest typo in prose is a missing space after a full stop, and `.is`,
// `.it`, `.life` and `.faith` are all real endings. In a church app the
// sentence "saved by grace.Faith is the gift" is not a hypothetical.
{
  const never = [
    'saved by grace.Faith is the gift',
    'He gave His life.Life is short',
    'Trust in Him.It works',
    'Read Genesis 1.Then pray',
    'We are His.Us, of all people',
    'open notes.txt now',
    'the file photo.jpg here',
  ];
  for (const t of never) {
    ok(hrefs(t).length === 0, `not a link: ${JSON.stringify(t)}`);
  }
}
{
  // Addresses of people, not of pages.
  ok(hrefs('Write to pastor@adventist.org for help').length === 0,
     'an email address is not turned into a link to its domain');
  // `good.org@evil.example/give` -- the scheme'd form is refused by
  // parseSafeHttpUrl for carrying user info. Written bare the run stops at the
  // `@`, and linking the safe half would underline part of a string while
  // leaving the rest as text, which reads as though the whole thing is the
  // destination.
  ok(hrefs('adventist.org@evil.example/give').length === 0,
     'and neither is the half of a user-info trick that happens to be safe');
  ok(hrefs('https://adventist.org@evil.example/give').length === 0,
     'nor the written-out version of it');
}
{
  // The protocol allowlist, which is the half a pattern cannot express.
  for (const t of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:msgbox(1)']) {
    ok(hrefs(t).length === 0, `refused outright: ${t.slice(0, 24)}`);
  }
}

// ---------------------------------------------------------------------------
// 3b. safeHref IS SHARED, AND COMPLETING TOO MUCH BREAKS SOMEBODY ELSE
// ---------------------------------------------------------------------------
//
// CAUGHT BY THE GATE, NOT BY ME. Teaching linkify about bare domains meant
// teaching safeHref to supply a missing `https://`, and the first version
// supplied one to anything without a scheme. lib/live/meeting-link.ts shares
// that helper and its whole design rests on the opposite: it runs its own
// stricter shape test, then hands raw text over trusting a refusal.
//
// So `7.30pm` became `https://7.30pm`, which the URL parser accepts as a
// perfectly good host, and a time of day turned into a Join button on a
// meeting card. Five of that file's checks went red at once. These are here so
// the next widening of the endings list is measured against the same line.
{
  const { safeHref } = mod.exports;
  for (const t of ['7.30pm', '4.30', 'Zoom.', 'idn-soex-nkb', '192.168.1.1', 'St.Mary']) {
    ok(safeHref(t) === null, `safeHref completes nothing shaped like this: ${JSON.stringify(t)}`);
  }
  ok(safeHref('meet.google.com/idn-soex-nkb') === 'https://meet.google.com/idn-soex-nkb',
     'while the pasted meeting link it was widened for still works');
  ok(safeHref('example.com:8080/x') === 'https://example.com:8080/x',
     'and a real port is matched whole rather than read as a scheme');
  for (const t of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.com', 'data.io:evil']) {
    ok(safeHref(t) === null, `and a scheme is never completed into one: ${JSON.stringify(t)}`);
  }
}

// ---------------------------------------------------------------------------
// 4. EMPHASIS THAT IS NOT EMPHASIS
// ---------------------------------------------------------------------------
{
  ok(bolded('2 * 3 * 4 = 24').length === 0 && italics('2 * 3 * 4 = 24').length === 0,
     'arithmetic is not italics, because a marker that opens a run has no space after it');
  ok(plain('2 * 3 * 4 = 24') === '2 * 3 * 4 = 24',
     'and it reaches the screen exactly as typed');

  ok(plain('**never closed and the study goes on') === '**never closed and the study goes on',
     'an unclosed marker stays as typed rather than swallowing the rest');

  ok(italics('**Read:** Mark 2').length === 0,
     'a double marker is not read as two single ones');

  const spans = richParts('**bold with *a slant* inside**');
  ok(spans.every((s) => s.bold), 'everything inside a bold run stays bold');
  ok(spans.some((s) => s.bold && s.italic), 'and a slant inside it is both');
  ok(!plain('**bold with *a slant* inside**').includes('*'), 'with no markers left over');

  ok(plain('****') === '****', 'an emphasis of nothing is left alone');
  ok(plain('a * b') === 'a * b', 'and so is a lone asterisk');
}
{
  // A marker left open at the top must not reach down the whole study.
  const two = '**opened here\n\nand a new paragraph** later';
  ok(bolded(two).length === 0, 'emphasis never crosses a blank line');
}
{
  // An address inside emphasis is still an address.
  const s = richParts('**Read this: adventist.org/beliefs**');
  ok(s.some((x) => x.href && x.bold), 'a link inside bold is both a link and bold');
}

// ---------------------------------------------------------------------------
// 5. NO MARKUP IS EVER PRODUCED
// ---------------------------------------------------------------------------
//
// The obvious way to render markdown is to build an HTML string and hand it to
// dangerouslySetInnerHTML, which is the single most common way an app of this
// shape gets a stored XSS hole. The text here is written by a Guide and read by
// the Explorer they walk with, which is inside the threat model this app's
// reports and trial room exist for, not outside it.
{
  const nasty = '**<script>alert(1)</script>** and <img src=x onerror=alert(1)>';
  const spans = richParts(nasty);
  ok(spans.every((s) => typeof s.text === 'string'),
     'the parser returns text and never elements');
  ok(plain(nasty).includes('<script>'),
     'a tag stays as the characters somebody typed, for React to escape');

  // COMMENTS STRIPPED FIRST. Both files explain at length why they never call
  // dangerouslySetInnerHTML, and the first version of this check failed on its
  // own explanation. A rule about what the code DOES has to read the code.
  const src = strip(read('lib/rich-text.ts')) + strip(read('components/Rich.tsx'));
  ok(!/dangerouslySetInnerHTML/.test(src),
     'and no part of this ever reaches for dangerouslySetInnerHTML');
  ok(!/innerHTML/.test(src), 'or innerHTML by any other route');
}

// ---------------------------------------------------------------------------
// 6. IT IS ACTUALLY ON THE SCREEN, AND THE WRITERS ARE TOLD
// ---------------------------------------------------------------------------
//
// Every assertion above is about the parser. Each of these is a line that,
// deleted, leaves all of them passing and the feature invisible.
{
  const studies = read('components/LiveStudies.tsx');
  ok(/<Rich text={lesson\.body} \/>/.test(studies),
     'the study an Explorer reads is drawn with Rich');
  ok(!/<Linked text={lesson\.body}/.test(studies),
     'and no longer with the renderer that showed the asterisks');
  ok(/<Rich text={s\.description} \/>/.test(studies),
     'and so is the description on the shelf');

  // THE SECOND HALF OF THE ASK: "Make sure those who are making those Lesson
  // studies (such as guides) are aware of this functions."
  // EVERY box a study is written in: editing one, adding one to a series, and
  // each study on the one-form new series (25 September 2026). Counted against
  // the boxes, so a fourth box cannot arrive without its hint.
  const hints = (studies.match(/<WritingHints \/>/g) ?? []).length;
  const boxes = (studies.match(/id=\{`(?:study-body|new-study-body|draft-body)-\$\{/g) ?? []).length;
  ok(boxes >= 3 && hints === boxes,
     `the hint sits under every box a study is written in (${hints} hints, ${boxes} boxes)`);
  ok(/function WritingHints\(\)/.test(studies), 'and it is a real component');
  for (const shown of ['\\*\\*Read:\\*\\*', '\\*The Desire of Ages\\*', 'adventist\\.org/beliefs']) {
    ok(new RegExp(shown).test(studies), `the hint shows a real example: ${shown}`);
  }

  // STRIPPED, for the same reason as above and it was caught the same way.
  // Rich.tsx explains in its own comment why rel="noopener noreferrer" is not
  // optional, so a check that reads the raw file passes on the explanation --
  // deleting the attribute from the JSX changed nothing and the break came
  // back green.
  const rich = strip(read('components/Rich.tsx'));
  ok(/<strong/.test(rich) && /<em>/.test(rich), 'bold and slant are drawn as real elements');
  ok(/rel="noopener noreferrer"/.test(rich) && /target="_blank"/.test(rich),
     'and a link opens away from the app without handing it a window handle');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
