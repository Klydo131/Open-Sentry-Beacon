#!/usr/bin/env node
// The reference chapters of the Building guide, generated from the code.
//
// WHY GENERATED. This codebase explains itself at the top of every file: what
// the file is for, and usually why it is that way and what went wrong before.
// A hand-written reference would start to drift the day it was written. This
// reads those explanations, and the gate's own list of checks, straight from
// the repository, so the printed reference says what the code says today.
//
//   node docs/guides/build-reference.mjs
//
// Writes docs/guides/building/generated/*.md. Run by build-guides.mjs.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs/guides/building/generated');
mkdirSync(OUT, { recursive: true });
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, keep) {
  const out = [];
  const go = (d) => {
    for (const name of readdirSync(join(ROOT, d)).sort()) {
      const p = join(d, name);
      if (statSync(join(ROOT, p)).isDirectory()) go(p);
      else if (keep(p)) out.push(p);
    }
  };
  if (existsSync(join(ROOT, dir))) go(dir);
  return out;
}

/**
 * The first explanation in a file: its opening comment block, after any
 * 'use client' line. Line comments (// or --) or a block comment.
 */
function header(text, { sql = false, max = 14 } = {}) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || /^['"]use (client|server)['"];?$/.test(lines[i].trim()) || /^#!/.test(lines[i]))) i += 1;
  const got = [];
  const mark = sql ? /^\s*--\s?/ : /^\s*\/\/\s?/;
  if (mark.test(lines[i] || '')) {
    while (i < lines.length && mark.test(lines[i])) { got.push(lines[i].replace(mark, '')); i += 1; }
  } else if (/^\s*\/\*/.test(lines[i] || '')) {
    while (i < lines.length) {
      got.push(lines[i].replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, ''));
      if (/\*\//.test(lines[i])) break;
      i += 1;
    }
  }
  // Paragraphs, joined; the long ones cut at a sentence once past `max` lines.
  // Rules drawn with dashes or box lines are decoration in a source file and
  // noise in print.
  const paras = got.join('\n').split(/\n\s*\n/)
    .map((p) => p.replace(/[-=─━_*]{4,}/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((p) => p && !/^[^\p{L}\p{N}]*$/u.test(p));
  let lineBudget = max;
  const kept = [];
  for (const p of paras) {
    if (lineBudget <= 0) break;
    kept.push(p);
    lineBudget -= Math.ceil(p.length / 90) + 1;
  }
  return kept;
}

// Markdown that the guide's renderer reads literally: keep code and links out
// of a comment's own punctuation.
const md = (s) => s.replace(/\|/g, '\\|');
const para = (s) => s;

// ---------------------------------------------------------------- files ----
{
  const groups = [
    ['Pages and routes', walk('app', (p) => /\.(tsx?|mjs)$/.test(p))],
    ['Components', walk('components', (p) => /\.tsx?$/.test(p))],
    ['Libraries', walk('lib', (p) => /\.tsx?$/.test(p))],
    ['Scripts', walk('scripts', (p) => /\.(mjs|js|sh)$/.test(p))],
  ];
  const out = ['# Appendix A. Every source file, and what it is for', '',
    'Generated from the comment at the top of each file. Where a file has no such comment, that is said too: it is a gap worth filling.', ''];
  let n = 0;
  for (const [title, files] of groups) {
    out.push(`## A.${groups.findIndex((g) => g[0] === title) + 1} ${title}`, '');
    for (const f of files) {
      const h = header(read(f));
      n += 1;
      out.push(`#### \`${f}\``, '');
      out.push(h.length ? h.map(para).join('\n\n') : '*No header comment.*', '');
    }
  }
  writeFileSync(join(OUT, 'A-files.md'), out.join('\n'));
  console.log(`files: ${n}`);
}

// ------------------------------------------------------------ migrations ----
{
  const files = walk('supabase/migrations', (p) => p.endsWith('.sql'));
  const out = ['# Appendix B. Every database migration, in order', '',
    `${files.length} files in \`supabase/migrations/\`, applied in name order. Each entry is the migration's own opening comment. A migration is never edited once applied; a change is a new file.`, ''];
  for (const f of files) {
    const name = f.split('/').pop();
    const stamp = name.slice(0, 14);
    const when = /^\d{14}$/.test(stamp) ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` : '';
    const h = header(read(f), { sql: true, max: 8 });
    out.push(`#### \`${name}\``, '');
    if (when) out.push(`*${when}*`, '');
    out.push(h.length ? h.map(para).join('\n\n') : '*No header comment.*', '');
  }
  writeFileSync(join(OUT, 'B-migrations.md'), out.join('\n'));
  console.log(`migrations: ${files.length}`);
}

// ---------------------------------------------------- the gate's checks ----
{
  const verify = read('scripts/verify.mjs');
  const list = [...verify.matchAll(/\[\s*'((?:[^'\\]|\\.)+)',\s*'(tests\/[^']+)'\s*\]/g)].map((m) => [m[1].replace(/\\'/g, "'"), m[2]]);
  const out = ['# Appendix C. Every check in the gate', '',
    `\`npm run verify\` runs these ${list.length} checks after the typecheck and the production build, in this order. Each entry is the check's label in \`scripts/verify.mjs\` and the opening comment of its file: what it holds and why it exists.`, ''];
  for (const [label, file] of list) {
    const h = existsSync(join(ROOT, file)) ? header(read(file), { max: 10 }) : ['*File missing: the gate fails on this.*'];
    out.push(`#### ${md(label)}`, '', `\`${file}\``, '', h.length ? h.map(para).join('\n\n') : '*No header comment.*', '');
  }
  writeFileSync(join(OUT, 'C-checks.md'), out.join('\n'));
  console.log(`checks: ${list.length}`);
}

// ---------------------------------------------------------------- walks ----
{
  const files = walk('tests/e2e', (p) => /\.(js|mjs)$/.test(p) && !/\/_/.test(p));
  const out = ['# Appendix D. Every browser walk', '',
    `${files.length} walks in \`tests/e2e/\`. \`npm run verify:all\` runs every \`.js\` walk against a production build, four at a time; the Safari workflow runs the same walks on WebKit. \`.mjs\` walks are run by hand.`, ''];
  for (const f of files) {
    const h = header(read(f), { max: 9 });
    out.push(`#### \`${f.split('/').pop()}\``, '', h.length ? h.map(para).join('\n\n') : '*No header comment.*', '');
  }
  writeFileSync(join(OUT, 'D-walks.md'), out.join('\n'));
  console.log(`walks: ${files.length}`);
}

// --------------------------------------------------------------- routes ----
{
  const pages = walk('app', (p) => /page\.tsx$/.test(p));
  const out = ['# Appendix E. Every address in the app', '',
    'Each page under `app/`, the address it answers, and who may open it. `allow` is the list the page passes to its shell; a person outside it is sent to their own home.', '',
    '| Address | File | Who may open it |', '|---|---|---|'];
  for (const f of pages) {
    const route = '/' + f.replace(/^app\//, '').replace(/\/?page\.tsx$/, '').replace(/\[([^\]]+)\]/g, ':$1');
    const text = read(f);
    const allow = [...new Set([...text.matchAll(/allow=\{(\[[^\]]*\]|[A-Z_]+)\}/g)].map((m) => m[1]))];
    const consts = Object.fromEntries([...text.matchAll(/const ([A-Z_]+)\s*(?::[^=]+)?=\s*(\[[^\]]*\])/g)].map((m) => [m[1], m[2]]));
    const who = allow.length
      ? allow.map((a) => (consts[a] || a).replace(/[[\]']/g, '').replace(/executive/g, 'Executive Director').replace(/\badmin\b/g, 'Director').replace(/\bdm\b/g, 'Guide').replace(/\bds\b/g, 'Explorer')).join('; ')
      : 'Anyone (no shell gate on this page)';
    out.push(`| \`${route === '/' ? '/' : route}\` | \`${f}\` | ${md(who)} |`);
  }
  out.push('');
  writeFileSync(join(OUT, 'E-routes.md'), out.join('\n'));
  console.log(`routes: ${pages.length}`);
}

// ------------------------------------------------------ npm scripts, env ----
{
  const pkg = JSON.parse(read('package.json'));
  const out = ['# Appendix F. Commands, packages and settings', '', '## F.1 The commands in package.json', '',
    '| Command | Runs |', '|---|---|'];
  for (const [k, v] of Object.entries(pkg.scripts || {})) out.push(`| \`npm run ${k}\` | \`${md(v)}\` |`);
  out.push('', '## F.2 Every runtime dependency, pinned', '',
    'Exact versions, as `package.json` holds them. `tests/dependency-licences.mjs` fails the build if one arrives under a licence nobody here has read.', '',
    '| Package | Version |', '|---|---|');
  for (const [k, v] of Object.entries(pkg.dependencies || {})) out.push(`| \`${k}\` | ${v} |`);
  out.push('', '## F.3 Development dependencies', '', '| Package | Version |', '|---|---|');
  for (const [k, v] of Object.entries(pkg.devDependencies || {})) out.push(`| \`${k}\` | ${v} |`);
  // Environment variables the code reads.
  const code = [...walk('app', (p) => /\.(tsx?|mjs)$/.test(p)), ...walk('lib', (p) => /\.tsx?$/.test(p)), ...walk('components', (p) => /\.tsx?$/.test(p)), 'next.config.mjs', 'middleware.ts']
    .filter((p) => existsSync(join(ROOT, p)));
  const env = new Map();
  for (const f of code) for (const m of read(f).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (!env.has(m[1])) env.set(m[1], new Set());
    env.get(m[1]).add(f);
  }
  out.push('', '## F.4 Environment variables the code reads', '',
    'Names only: values never go in the repository. `NEXT_PUBLIC_` ones are compiled into the browser bundle and must never be secrets.', '',
    '| Variable | Read in |', '|---|---|');
  for (const [k, files] of [...env.entries()].sort()) out.push(`| \`${k}\` | ${[...files].slice(0, 4).map((f) => `\`${f}\``).join(', ')}${files.size > 4 ? `, and ${files.size - 4} more` : ''} |`);
  out.push('');
  writeFileSync(join(OUT, 'F-commands.md'), out.join('\n'));
  console.log(`scripts: ${Object.keys(pkg.scripts || {}).length}, env: ${env.size}`);
}

// ---------------------------------------------------------- what's new ----
{
  const text = read('lib/release-notes.ts');
  const notes = [...text.matchAll(/\{\s*id:\s*'([^']+)',\s*date:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*items:\s*\[([\s\S]*?)\],\s*\}/g)]
    .map((m) => ({ id: m[1], date: m[2], title: m[3].replace(/\\'/g, "'"), items: [...m[4].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'")) }));
  const out = ['# What changed, release by release', '',
    `The app's own release notes (\`lib/release-notes.ts\`), newest first: ${notes.length} releases, as members read them in Settings, What's new.`, ''];
  for (const n of notes) {
    out.push(`### ${md(n.title)}`, '', `*${n.date}*`, '');
    for (const it of n.items) out.push(`- ${para(it)}`);
    out.push('');
  }
  writeFileSync(join(OUT, 'G-release-notes.md'), out.join('\n'));
  console.log(`release notes: ${notes.length}`);
}
