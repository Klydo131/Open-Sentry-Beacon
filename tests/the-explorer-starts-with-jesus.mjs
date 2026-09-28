// What an Explorer's shelf opens with.
//
// The starter kit began as a reference shelf and was shown, whole, to everybody:
// three editions of the Bible, the collected Ellen G. White, the full prophetic
// history, both statements of belief, this quarter's lesson, an archive of
// quarterlies going back decades, and the General Conference publications list.
//
// That is the right shelf for a Director preparing a study. It is the wrong
// first thing to hand somebody who has just agreed to let a stranger walk with
// them, and it answers questions nobody has asked yet. Twenty items arranged
// like a filing cabinet is not a welcome.
//
// So an Explorer now gets a short list, ordered the way a first conversation
// goes: a Bible they can read on a phone, then Jesus, then Jesus again, then a
// way into studying for themselves — and only then what this church teaches and
// what it is studying together this quarter.
//
// NOTHING IS HIDDEN. Everything an Explorer can see, a Guide can see; the short
// list is about what is put in front of somebody first, not about what they are
// allowed to reach. These checks exist so that stays true, and so the list does
// not quietly grow back into the filing cabinet.
//
//   node tests/the-explorer-starts-with-jesus.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'lib/starter-kit.ts'), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Parsed from the source rather than imported, because this is TypeScript and
// the rest of the guards are dependency-free Node. The shapes are regular
// enough that a regex is honest here, and a malformed entry fails the parse
// rather than passing quietly.
const entries = [...src.matchAll(
  /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*description:\s*\n?\s*'((?:[^'\\]|\\.)*)',\s*type:\s*'([^']+)',\s*external_url:\s*\n?\s*'([^']+)',\s*topics:\s*\[([^\]]*)\]/g,
)].map((m) => ({
  id: m[1],
  title: m[2],
  description: m[3],
  type: m[4],
  url: m[5],
  topics: [...m[6].matchAll(/'([^']+)'/g)].map((t) => t[1]),
}));

// Nineteen since 28 September 2026, when the KJV PDF left the shelf because its
// address had been dead for two weeks. This is a check that the PARSE worked,
// not a quota: a shelf read as three entries would pass nothing below.
ok(entries.length >= 19, `the kit parses (${entries.length} resources)`);

// ---------------------------------------------------------------- hygiene ---
const ids = entries.map((e) => e.id);
ok(new Set(ids).size === ids.length, 'every resource has a unique id');

const notHttps = entries.filter((e) => !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(e.url));
ok(notHttps.length === 0,
   'every link is a well-formed https address'
   + (notHttps.length ? `\n    ${notHttps.map((e) => `${e.id}: ${e.url}`).join('\n    ')}` : ''));

const thin = entries.filter((e) => e.title.length < 4 || e.description.length < 25 || !e.topics.length);
ok(thin.length === 0,
   'every resource says what it is and what it is for'
   + (thin.length ? ` (${thin.map((e) => e.id).join(', ')})` : ''));

// ----------------------------------------------- the Explorer's short list ---
// The `readonly string[]` annotation contains a bracket, so a lazy [^[]* stops
// there and captures nothing. Anchor on the assignment instead.
const listed = [...(src.match(/const EXPLORER_START[\s\S]*?=\s*\[([\s\S]*?)\];/) || [, ''])[1]
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);

ok(listed.length > 0, `the Explorer list exists (${listed.length} resources)`);

const missing = listed.filter((id) => !ids.includes(id));
ok(missing.length === 0,
   'every id on the Explorer list is a real resource'
   + (missing.length ? ` (${missing.join(', ')})` : ''));

// The whole point. If these two ever meet, the change that did it was a mistake.
ok(listed.length < entries.length,
   `the Explorer list is shorter than the full kit (${listed.length} of ${entries.length})`);
ok(listed.length <= 10,
   `and short enough to be read rather than scrolled (${listed.length})`);

const byId = new Map(entries.map((e) => [e.id, e]));
const chosen = listed.map((id) => byId.get(id)).filter(Boolean);

// ------------------------------------------------------------- the balance ---
// Jesus first, and by weight — not one token entry among the reference works.
const aboutJesus = chosen.filter((e) => e.topics.includes('Jesus'));
ok(aboutJesus.length >= 3,
   `at least three of an Explorer's resources are about Jesus (${aboutJesus.length})`);

// A Bible they can actually open.
ok(chosen.some((e) => e.topics.includes('Bible')),
   'an Explorer is given a Bible');

// A LITTLE doctrine. One page on what the church teaches is an answer to "what
// do you people believe"; handing somebody the full twenty-eight and the
// prophetic history on day one is a syllabus, and it is not what they asked.
const doctrinal = chosen.filter((e) =>
  e.topics.includes('Beliefs') || e.topics.includes('Prophecy'));
ok(doctrinal.length >= 1, 'and something that says what this church teaches');
ok(doctrinal.length <= 2,
   `but not a doctrine course before they have met Jesus (${doctrinal.length})`);

// The heavy reference works belong to the full kit, not to a first day.
const HEAVY = ['kit-egw-gc', 'kit-beliefs-pdf', 'kit-ss-archive', 'kit-gc-publications', 'kit-egw-library'];
const heavyOnList = listed.filter((id) => HEAVY.includes(id));
ok(heavyOnList.length === 0,
   'the archives and the full prophetic history are not on an Explorer’s first shelf'
   + (heavyOnList.length ? ` (${heavyOnList.join(', ')})` : ''));

// ...and are still there for everyone else, which is what makes the short list
// a starting point rather than a wall.
const stillPresent = HEAVY.filter((id) => ids.includes(id));
ok(stillPresent.length === HEAVY.length,
   'and are all still in the kit for anybody who goes looking');

// -------------------------------------------- who the new resources are for ---
const forNewcomers = entries.filter((e) =>
  e.topics.includes('New believer') || e.topics.includes('Youth'));
ok(forNewcomers.length >= 7,
   `at least seven resources are pitched at young people and new believers (${forNewcomers.length})`);

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
