// Writes public/third-party-notices.txt: every open-source package this app is
// built from, with its licence.
//
// ---------------------------------------------------------------------------
// WHY. Almost every package here is under a licence (MIT, ISC, BSD, Apache-2.0,
// MPL-2.0) that asks for its notice to go with every copy, and the minified
// code a browser downloads is a copy. The build strips those notices out of the
// code, and until 1 October 2026 nothing put them back: the licence audit of
// that day found no notice anywhere in the built app. Settings -> About now
// links this file ("Code from other projects").
//
// WHAT IS LISTED. Every production dependency in package-lock.json that is
// actually installed -- not only what reaches the browser, which would need
// the bundler's opinion and could miss something. Development tools are left
// out: they never reach anybody.
//
// WHERE THE TEXT COMES FROM. Each package's own licence files, word for word.
// A package that ships none gets its declared licence named, its author and
// source, and the standard text of that licence once at the end of this file,
// taken from another installed package's own copy -- never typed from memory.
//
// Generated at every build and every dev server (package.json prebuild,
// predev) and never committed, so it is always the dependencies the app was
// actually built with. tests/dependency-licences.mjs runs it and checks it.
//
//   node scripts/third-party-notices.mjs [output file]
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

/** The licence a package declares, as one SPDX-like string, or ''. */
function declared(lockEntry, pkg) {
  if (lockEntry.license) return String(lockEntry.license);
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return '';
}

function personOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return [value.name, value.email && `<${value.email}>`].filter(Boolean).join(' ');
}

function repoOf(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return r ? r.replace(/^git\+/, '').replace(/\.git$/, '') : (pkg.homepage ?? '');
}

/** Every installed production package, once per name@version. */
export function productionPackages(base = root) {
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8'));
  const seen = new Map();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.dev) continue;
    const dir = path.join(base, key);
    const manifest = path.join(dir, 'package.json');
    if (!fs.existsSync(manifest)) continue; // an optional package for another platform
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const name = pkg.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const id = `${name}@${pkg.version}`;
    if (seen.has(id)) continue;
    const files = fs.readdirSync(dir)
      .filter((f) => LICENCE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
      .sort();
    const texts = files.map((f) => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8').trim() }));
    seen.set(id, {
      id, name, version: pkg.version,
      // Three packages declare nothing in package.json and ship a licence file
      // that says it plainly; that file is what is named, and the reader is told.
      licence: declared(entry, pkg) || recognised(texts) || 'not declared',
      author: personOf(pkg.author),
      source: repoOf(pkg),
      texts,
    });
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// How to recognise the standard text of a licence inside somebody's own file.
const STANDARD = {
  'MIT': /Permission is hereby granted, free of charge/,
  'ISC': /Permission to use, copy, modify, and\/or distribute this software for any/,
  'BSD-2-Clause': /Redistribution and use in source and binary forms(?![\s\S]*Neither the name)/,
  'BSD-3-Clause': /Redistribution and use in source and binary forms[\s\S]*Neither the name/,
  'Apache-2.0': /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/,
  'MPL-2.0': /Mozilla Public License Version 2\.0/,
  '0BSD': /Permission to use, copy, modify, and\/or distribute this software for any/,
};

/** The licence a file's own text is, when package.json does not say. */
function recognised(texts) {
  for (const t of texts) {
    for (const id of ['MPL-2.0', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'MIT', 'ISC']) {
      if (STANDARD[id].test(t.text)) return `${id} (read from its licence file)`;
    }
  }
  return '';
}

/** The standard text of a licence, cut from an installed package's own copy (copyright lines removed). */
function standardText(spdx, packages) {
  const marker = STANDARD[spdx];
  if (!marker) return null;
  for (const p of packages) {
    if (!p.licence.split(/\s+(?:OR|AND)\s+|[()]/).includes(spdx)) continue;
    for (const t of p.texts) {
      if (!marker.test(t.text)) continue;
      const body = t.text.split('\n').filter((line) => !/^\s*(copyright|\(c\)|©)/i.test(line)).join('\n').trim();
      return { from: `${p.id} (${t.file})`, body };
    }
  }
  return null;
}

export function noticesText(packages, sourceUrl) {
  const rule = '='.repeat(78);
  const thin = '-'.repeat(78);
  const counts = {};
  for (const p of packages) counts[p.licence] = (counts[p.licence] ?? 0) + 1;
  const needed = new Set();
  const blocks = packages.map((p) => {
    const head = [`${p.id}`, `Licence: ${p.licence}`, p.source && `Source: ${p.source}`, p.author && `Author: ${p.author}`]
      .filter(Boolean).join('\n');
    if (p.texts.length) {
      return `${head}\n\n${p.texts.map((t) => (p.texts.length > 1 ? `[${t.file}]\n${t.text}` : t.text)).join('\n\n')}`;
    }
    for (const id of p.licence.split(/\s+(?:OR|AND)\s+|[()]/).map((s) => s.trim()).filter(Boolean)) needed.add(id);
    return `${head}\n\nThis package ships no licence file of its own. The standard text of the licence it\ndeclares is at the end of this file.`;
  });
  const standards = [...needed].sort().map((id) => {
    const found = standardText(id, packages);
    return found
      ? `${id}, the standard text (as found in ${found.from}, copyright lines removed)\n\n${found.body}`
      : `${id}: https://spdx.org/licenses/${id}.html`;
  });
  return [
    'Code from other projects',
    '',
    'This app is free software under the GNU Affero General Public License,',
    `version 3 only (AGPL-3.0-only). Its source: ${sourceUrl}`,
    '',
    `${packages.length} open-source packages written by other people are built into it.`,
    'Each is listed below with the licence it is under and that licence\'s own text.',
    'Generated by scripts/third-party-notices.mjs from the packages installed',
    'when this copy of the app was built.',
    '',
    'By licence:',
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `  ${String(n).padStart(4)}  ${l}`),
    '',
    'The drawing board\'s fonts and their licences: /excalidraw/fonts/LICENSES.txt',
    '',
    ...blocks.flatMap((b) => [rule, b, '']),
    ...(standards.length ? [rule, 'STANDARD LICENCE TEXTS', '', ...standards.flatMap((s) => [thin, s, ''])] : []),
  ].join('\n');
}

function sourceUrl(base) {
  const brand = fs.readFileSync(path.join(base, 'lib/brand.ts'), 'utf8');
  return /export const SOURCE_URL = '([^']+)'/.exec(brand)?.[1] ?? 'see the README';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'public/third-party-notices.txt');
  if (!fs.existsSync(path.join(root, 'package-lock.json')) || !fs.existsSync(path.join(root, 'node_modules'))) {
    console.log('third-party-notices: nothing installed; nothing written.');
    process.exit(0);
  }
  const packages = productionPackages();
  const text = noticesText(packages, sourceUrl(root));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`third-party-notices: ${packages.length} packages, ${Math.round(text.length / 1024)} KB, in ${path.relative(root, out)}`);
}
