// A translation may say what the English says, in another language, and
// nothing else.
//
// WHY THIS IS A SECURITY CHECK AND NOT ONLY A TIDINESS ONE. The word lists in
// lib/words/ are the one part of the app most people reviewing a pull request
// cannot read. A line of Korean or Swahili that quietly adds "send your code
// to this number" or a link to somewhere else would be shown on the sign-in
// page, to the people least able to tell. So a translation is held to the
// English it translates:
//
//   - no link, e-mail address or number that the English does not have;
//   - no markup and no invisible or direction-changing characters;
//   - the same {blanks} as the English, so nothing can be filled in that the
//     screen did not mean to show;
//   - the role words as the app names them (lib/brand.ts);
//   - every English key really is a sentence on that screen, so a translation
//     cannot outlive the English it was made for;
//   - and the consent wording is not translated at all, until a native
//     speaker and the church's Data Protection Officer approve a translation
//     (docs/IN-ANY-LANGUAGE.md, "Translating the screens").
//
//   node tests/translations-say-only-what-english-says.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Each word list, and the files whose English it translates.
const BOOKS = [
  {
    file: 'lib/words/door.ts', name: 'DOOR_WORDS',
    screens: ['components/live/DoorPages.tsx'],
    // The sign-in refusals arrive from here, in English, and are translated
    // where the page draws them.
    sources: ['components/live/DoorPages.tsx', 'app/api/auth/sign-in/route.ts', 'lib/live/data.ts', 'lib/live/errors.ts'],
  },
  {
    file: 'lib/words/two-step.ts', name: 'TWO_STEP_WORDS',
    screens: ['components/live/TwoStep.tsx'],
    sources: ['components/live/TwoStep.tsx', 'lib/live/two-step.ts'],
  },
  {
    file: 'lib/words/frame.ts', name: 'FRAME_WORDS',
    screens: ['components/TabBar.tsx', 'components/LiveAppShell.tsx', 'components/ReadingSettings.tsx'],
    sources: ['components/TabBar.tsx', 'components/LiveAppShell.tsx', 'components/ReadingSettings.tsx'],
  },
];

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-words-'));
const load = async (entry, name) => {
  const outfile = path.join(out, `${name}.mjs`);
  await build({
    entryPoints: [path.join(root, entry)],
    alias: { '@': root },
    outfile,
    bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
    // React goes into the bundle: it is written to a temporary folder, which
    // has no node_modules beside it to find React in.
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return import(pathToFileURL(outfile).href);
};

const i18nSource = read('lib/i18n.tsx');
const codes = [...i18nSource.matchAll(/\{ code: '([a-z]+)'/g)].map((m) => m[1]);
ok(codes.length >= 16 && codes.includes('ar'), `the app offers ${codes.length} languages`);

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const digits = (s) => new Set(s.match(/[0-9]+/g) ?? []);
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|ph|io|app|dev)\b/i;
const HIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;
const ROLES = ['Executive Director', 'Director'];

for (const book of BOOKS) {
  const words = (await load(book.file, path.basename(book.file, '.ts')))[book.name];
  ok(words && typeof words === 'object', `${book.file}: the list loads`);
  if (!words) continue;
  const sources = book.sources.map(read).join('\n');

  const langs = Object.keys(words);
  ok(langs.every((l) => codes.includes(l)), `${book.file}: every language in it is one the app offers`);
  ok(!langs.includes('en'), `${book.file}: and English is not in it, because the screen is the English`);

  const keys = new Set(langs.flatMap((l) => Object.keys(words[l])));
  const orphans = [...keys].filter((k) => !sources.includes(`'${k}'`) && !sources.includes(`"${k}"`));
  ok(orphans.length === 0,
    `${book.file}: every English sentence in it is one the screen really says`
    + (orphans.length ? `\n      not found in ${book.sources.join(', ')}:\n      ${orphans.join('\n      ')}` : ''));

  const problems = [];
  for (const lang of langs) {
    for (const [english, said] of Object.entries(words[lang])) {
      const where = `${lang}: "${english.slice(0, 50)}${english.length > 50 ? '…' : ''}"`;
      if (typeof said !== 'string' || !said.trim()) { problems.push(`${where} is empty`); continue; }
      if (placeholders(said) !== placeholders(english)) problems.push(`${where} changes the blanks`);
      const extra = [...digits(said)].filter((d) => !digits(english).has(d));
      if (extra.length) problems.push(`${where} adds the number ${extra.join(', ')}`);
      if (LINK.test(said) && !LINK.test(english)) problems.push(`${where} adds a link`);
      if (said.includes('@') && !english.includes('@')) problems.push(`${where} adds an address`);
      if (/[<>]/.test(said)) problems.push(`${where} carries markup`);
      if (HIDDEN.test(said)) problems.push(`${where} carries an invisible or direction-changing character`);
      for (const role of ROLES) {
        const inEnglish = english.split(role).length - 1;
        const inSaid = said.split(role).length - 1;
        if (inSaid < inEnglish) { problems.push(`${where} renames the role "${role}"`); break; }
      }
    }
  }
  ok(problems.length === 0,
    `${book.file}: every translation says only what its English says`
    + (problems.length ? `\n      ${problems.join('\n      ')}` : ''));

  for (const screen of book.screens) {
    const src = read(screen);
    ok(src.includes(`import { ${book.name} } from '@/lib/words/`) && /usePhrases\(/.test(src),
      `${screen} draws its words through ${book.file}`);
  }

  // How much is translated, for whoever reviews a language next. Not a
  // failure: a sentence nobody has translated yet is shown in English.
  const missing = langs.map((l) => [l, [...keys].filter((k) => !(k in words[l])).length]).filter(([, n]) => n);
  console.log(`    ${keys.size} sentences, ${langs.length} languages`
    + (missing.length ? `; not yet translated: ${missing.map(([l, n]) => `${l} ${n}`).join(', ')}` : '; all translated'));
}

// THE LOOKUP ITSELF, run rather than read.
{
  const { phrase } = await load('lib/i18n.tsx', 'i18n');
  const book = { es: { 'Sign in to {app}': 'Inicia sesión en {app}', Hello: 'Hola' } };
  ok(phrase(book, 'es', 'Sign in to {app}', { app: 'Hope' }) === 'Inicia sesión en Hope',
    'a sentence is shown in the chosen language, with its blank filled');
  ok(phrase(book, 'sw', 'Hello') === 'Hello', 'a language without the sentence shows the English');
  ok(phrase(book, 'es', 'Goodbye') === 'Goodbye', 'and so does a sentence nobody has translated');
  ok(phrase(book, 'es', 'Sign in to {app}') === 'Inicia sesión en {app}',
    'a blank with nothing to fill is left as written, not filled with "undefined"');
  ok(phrase(book, 'es', 'Hi {name}', { name: '{app}' }) === 'Hi {app}',
    'and what fills a blank is not read as another blank');
}

// THE FIRST RENDER IS THE SERVER'S. Reading this device's language while
// rendering made the browser disagree with the server's English HTML on the
// screens that draw at once, which React answers by drawing the page again.
ok(/useState<string>\('en'\)/.test(i18nSource) && /useLayoutEffect\(\(\) => \{[\s\S]{0,160}localStorage\.getItem\(LANG_KEY\)/.test(i18nSource),
  'the language is read from this device after the first render, before paint');

// THE CONSENT STAYS IN ENGLISH. A permission somebody cannot read is not
// permission, and a translation of it is a legal text, not a string.
for (const file of ['components/live/ConsentWording.tsx', 'components/live/ConsentStep.tsx']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const src = read(file);
  ok(!/usePhrases|useLocale|lib\/words\//.test(src), `${file} is not translated`);
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
