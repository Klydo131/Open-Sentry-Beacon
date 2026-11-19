// The privacy notice gives what the law asks, young members have one written
// for them, and all of it is written plainly.
//
// ---------------------------------------------------------------------------
// WHY. Asked for on 19 November 2026: the legal pages must meet Philippine and
// international data privacy law, in words that are well written and do not
// read like a machine's.
//
//   * WHAT THE LAW ASKS A NOTICE TO GIVE: RA 10173 section 16(b) and GDPR
//     Article 13. A check of 19 November found five things missing; each now
//     has a marked place in app/privacy/page.tsx, held below. The full map is
//     the table in docs/DATA-PROTECTION.md, "What the notice gives".
//   * A NOTICE A CHILD CAN FOLLOW: the NPC's Guidelines on Child-Oriented
//     Transparency (No. 2024-03) say one notice for adults and children is not
//     enough. app/privacy/young/page.tsx is that notice, and every promise it
//     makes must also be in the full one.
//   * PLAIN WORDS: the words and habits that make text read as generated
//     (the list is Wikipedia's "Signs of AI writing", WP:AISIGNS) are refused
//     in all three pages, and the young people's notice keeps its sentences
//     short.
//
//   node tests/the-law-is-written-plainly.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`); if (!cond) bad++; };

/** What a reader sees: the page's words, without code, comments or markup. */
function words(source) {
  // The page itself: the default export's markup, not a helper's.
  const page = source.slice(source.indexOf('export default function'));
  const body = page.slice(page.indexOf('return ('));
  return body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{'\s*'\}/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const privacySrc = read('app/privacy/page.tsx');
const youngPath = 'app/privacy/young/page.tsx';
const youngSrc = fs.existsSync(path.join(root, youngPath)) ? read(youngPath) : '';
const termsSrc = read('app/terms/page.tsx');
const privacy = words(privacySrc);
const young = words(youngSrc);
const terms = words(termsSrc);

// 1. WHAT THE LAW ASKS THE NOTICE TO GIVE.
for (const [marker, what] of [
  ['data-lawful-basis', 'why each thing is kept, and the lawful basis (RA 10173 §16(b)(2); GDPR 13(1)(c))'],
  ['data-what-is-required', 'what a person must give, and what is optional (GDPR 13(2)(e))'],
  ['data-no-automated-decisions', 'that no decision is made by a computer alone (IRR §34(a); GDPR 13(2)(f))'],
  ['data-transfers', 'what protects information kept abroad (RA 10173 §21; GDPR 13(1)(f))'],
  ['data-technical-logs', 'the technical logs, with the internet address they hold'],
  ['data-cookies', 'what is kept on the device, and that nothing tracks'],
  ['data-young-notice-link', 'a way to the young people\'s notice, near the top'],
]) ok(privacySrc.includes(marker), `the notice says ${what}`);
ok(/section 13\(c\) and \(f\)/.test(privacy) && /9\(2\)\(f\)/.test(privacy) && /17\(3\)\(e\)/.test(privacy),
  'it names the law that lets a safeguarding record outlive a deletion');
for (const right of ['See it.', 'Correct it.', 'Delete it.', 'Object, or withdraw', 'Pause it.', 'Take it with you.', 'Be paid for harm.', 'Complain.'])
  ok(privacy.includes(right), `the rights include "${right.replace(/\.$/, '')}"`);
ok(/16\(f\)/.test(privacy), 'the right to damages cites section 16(f)');
ok(/data protection authority in the country where you live/.test(privacy), 'a complaint can go to the authority where the reader lives');
ok(/Nothing is sold/.test(privacy) && /advertising/.test(privacy), 'it says nothing is sold or used for advertising');

// 2. A NOTICE A CHILD CAN FOLLOW, MATCHING THE FULL ONE.
ok(youngSrc.length > 0, 'there is a notice for members under 18, at /privacy/young');
ok(/href="\/privacy\/young"/.test(privacySrc) && /href="\/privacy\/young"/.test(termsSrc), 'the full notice and the terms both link to it');
ok(/href="\/privacy"/.test(youngSrc), 'and it links back to the full notice');
ok(/'\/privacy\/young'/.test(read('app/sw.js/route.ts')), 'it opens with no signal, like the full notice');
for (const [inYoung, inFull, what] of [
  [/parent or guardian has to agree/, /parent or guardian has to agree first/, 'a parent or guardian agrees first'],
  [/South Korea/, /South Korea/, 'where it is kept'],
  [/never sell/, /Nothing is sold/, 'nothing is sold'],
  [/No computer decides anything about you on its own/, /No decision about you is made by a computer on its own/, 'no decision by a computer alone'],
  [/not even the church's leaders/, /not other Guides, not Directors/, 'only the two people read a conversation'],
  [/where it was taken/, /location your camera recorded in it is removed/, 'a photo loses its location'],
  [/kept even if your account is deleted/, /kept permanently/, 'a safeguarding report survives a deletion'],
]) ok(inYoung.test(young) && inFull.test(privacy), `both notices say the same: ${what}`);
const sentences = young.split(/(?<=[.!?])\s+/).map((s) => s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length).filter((n) => n > 2);
const longest = Math.max(...sentences);
const average = sentences.reduce((a, b) => a + b, 0) / sentences.length;
ok(sentences.length > 20 && average <= 14, `its sentences are short: ${average.toFixed(1)} words on average, 14 at most`);
ok(longest <= 25, `and none runs past 25 words (the longest has ${longest})`);
ok(!/section \d|Article \d|GDPR|RA 10173/.test(young), 'it cites no sections; the full notice does that');

// 3. PLAIN WORDS, IN ALL THREE.
const TELLS = [
  'delve', 'crucial', 'pivotal', 'seamless', 'robust', 'leverage', 'foster', 'tapestry', 'testament',
  'landscape', 'underscore', 'showcase', 'vibrant', 'meticulous', 'holistic', 'synergy', 'utilize',
  'empower', 'cutting-edge', 'state-of-the-art', 'world-class', 'rest assured', 'in today\'s',
  'additionally', 'furthermore', 'moreover', 'it is important to note', 'serves as', 'stands as',
  'not only', 'navigate the', 'ever-evolving', 'peace of mind', 'we take your privacy seriously',
];
for (const [name, text] of [['the Privacy Notice', privacy], ['the young people\'s notice', young], ['the Terms of Use', terms]]) {
  const lower = text.toLowerCase();
  const hits = TELLS.filter((t) => new RegExp(`\\b${t.replace(/[-']/g, (c) => `\\${c}`)}`).test(lower));
  ok(hits.length === 0, `${name} uses none of the words that read as generated${hits.length ? ` (found: ${hits.join(', ')})` : ''}`);
  ok(!/—/.test(text), `${name} has no em dashes`);
}

// 4. WHAT A MEMBER IS TOLD WHEN ASKED TO AGREE AGAIN.
const legal = read('lib/legal.ts');
ok(/PRIVACY_VERSION = '2026-11-19'/.test(legal) && /TERMS_VERSION = '2026-11-19'/.test(legal), 'both documents carry the version of 19 November 2026, so everybody is asked again');
ok(/under 18 have a privacy notice written for them/.test(legal), 'and what changed says so, young people\'s notice included');
ok(/What the notice gives, item by item/.test(read('docs/DATA-PROTECTION.md')), 'docs/DATA-PROTECTION.md keeps the item-by-item map');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
