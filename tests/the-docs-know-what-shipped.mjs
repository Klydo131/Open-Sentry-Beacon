// The developer documentation still describes the app that exists.
//
// WHY THIS EXISTS. ARCHITECTURE.md is what README sends a developer to first:
// "how it is built, and where everything lives. Start here if you are about to
// change something." For months it described an app with NO BACKEND and mapped
// nine paths — while the repository had grown a second half: `lib/live/`,
// twenty-eight `components/Live*.tsx` screens, seventy-one migrations and an
// edge function, none of which appeared in it. Somebody cloning the project to
// run it for their own church read a map with half the territory missing, and
// nothing anywhere reported that.
//
// Stale documentation fails silently, which is exactly the case a guardrail is
// for. Three things are checked, and each one is a mistake already made:
//
//   1. Every source directory on disk is on the map.
//   2. Every migration the documentation names actually exists.
//   3. The documentation does not still describe a feature that was removed.
//
//   node tests/the-docs-know-what-shipped.mjs
//
// Reads the docs and the directory listing; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const arch = read('ARCHITECTURE.md');
const backends = read('docs/BACKENDS.md');

// ---------------------------------------------------------------------------
// 1. Every source directory is on the map
// ---------------------------------------------------------------------------
//
// Checked against the DISK rather than a list written here, so a directory
// added next year is covered without anybody remembering to add it. The map is
// the "Where things are" table; naming a directory anywhere in the file counts,
// because a section about it is at least as good as a table row.
{
  const dirs = ['lib', 'supabase'];   // where the halves of the app live
  const missing = [];
  for (const parent of dirs) {
    for (const entry of fs.readdirSync(path.join(root, parent), { withFileTypes: true })) {
      // A tool's scratch directory is not part of the app. `.gitignore`
      // decides what is ours; a leading dot is the same answer, cheaper.
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const rel = `${parent}/${entry.name}/`;
      // A directory counts as documented if the doc mentions it at all --
      // `lib/live/` or a file inside it such as `lib/live/data.ts`.
      if (!arch.includes(rel.slice(0, -1))) missing.push(rel);
    }
  }
  ok(missing.length === 0,
     missing.length
       ? `ARCHITECTURE.md does not mention: ${missing.join(', ')}`
       : 'ARCHITECTURE.md mentions every source directory on disk');
}

// The two halves, and the thing that chooses between them. A developer who
// misses this reads every route as broken.
ok(/useIsLive/.test(arch), 'and names useIsLive, which decides which half renders');
ok(/components\/Live/.test(arch), 'and the Live screens, which are most of the app');
ok(/supabase\/migrations/.test(arch),
   'and the migrations, which are where the permission rules actually are');
// The single most useful fact about the live half: one file talks to the
// database. A developer who misses it adds a fetch to a component, and the
// next person cannot find where the data comes from.
ok(/lib\/live\/data\.ts/.test(arch),
   'and lib/live/data.ts by name, which is the only file that talks to the database');

// ---------------------------------------------------------------------------
// 2. Every migration the documentation names actually exists
// ---------------------------------------------------------------------------
//
// A document that tells somebody to read `0011_block_self_privilege_change.sql`
// when the file was renamed sends them looking for something that is not there,
// and they have no way to tell whether the file or the sentence is wrong.
{
  const have = new Set(
    fs.readdirSync(path.join(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, '')),
  );
  const docs = ['ARCHITECTURE.md', 'README.md', 'AGENTS.md', 'CLAUDE.md']
    .concat(fs.readdirSync(path.join(root, 'docs'))
      .filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`));

  const dangling = [];
  for (const file of docs) {
    const text = read(file);
    // A migration name written AS ONE: with its .sql extension, or inside
    // the migrations path. Digits and an underscore alone is not enough --
    // HANDBOOK.md quotes a camera filename, 20260901_110714.jpg, and a check
    // that cannot tell a photograph from a migration reports a missing file
    // that was never a file.
    const named = [
      ...text.matchAll(/\b(\d{4,14}[a-z]?_[a-z0-9_]+)\.sql\b/g),
      ...text.matchAll(/supabase\/migrations\/(\d{4,14}[a-z]?_[a-z0-9_]+)/g),
    ];
    for (const m of named) {
      const name = m[1].replace(/\.sql$/, '');
      if (!have.has(name)) dangling.push(`${file} → ${name}`);
    }
  }
  ok(dangling.length === 0,
     dangling.length
       ? `documentation names migrations that do not exist: ${dangling.join('; ')}`
       : 'every migration the documentation names is really in supabase/migrations/');
}

// ---------------------------------------------------------------------------
// 3. It does not describe things that were taken out
// ---------------------------------------------------------------------------
//
// The update banner came out because it asked people to make a decision about
// software. ARCHITECTURE.md went on promising "a one-tap restart" afterwards,
// which is worse than saying nothing: a developer reads it, cannot find the
// banner, and goes looking for the bug that removed it on purpose.
ok(!/one-tap restart/.test(arch),
   'ARCHITECTURE.md does not still promise the update banner that was removed');
ok(/AutoUpdate/.test(arch), 'and names the component that replaced it');
ok(/no backend/i.test(arch) && /two applications|two apps/i.test(arch),
   'and describes both halves rather than only the one that needs no database');

// ---------------------------------------------------------------------------
// 4. The seams point at the worked examples that now ship
// ---------------------------------------------------------------------------
//
// The feedback sink was documented as an exercise for the reader for as long as
// it was one. It stopped being one: `lib/live/feedback-sink.ts` is that
// interface implemented against a real database, in about forty lines. Leaving
// the documentation hypothetical means the shortest complete example of the
// pattern in the repository stays invisible to the person looking for exactly
// that.
for (const [file, text] of [['ARCHITECTURE.md', arch], ['docs/BACKENDS.md', backends]]) {
  ok(text.includes('lib/live/feedback-sink.ts'),
     `${file} points at the worked feedback sink that ships in this repository`);
}
ok(fs.existsSync(path.join(root, 'lib/live/feedback-sink.ts')),
   'and that file is really there');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
