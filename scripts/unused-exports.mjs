// List exports in app/, components/ and lib/ that nothing uses: the name
// appears once in its own file and nowhere else in the repository (code,
// tests, SQL, docs). Candidates to delete, not verdicts.
//
//   node scripts/unused-exports.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|json|sql|md|toml|yml|yaml|html|css)$/.test(f));

// name -> how many times it appears in each file
const seen = new Map();
for (const file of tracked) {
  for (const [word] of readFileSync(file, 'utf8').matchAll(/[A-Za-z_$][\w$]*/g)) {
    const byFile = seen.get(word) ?? new Map();
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
    seen.set(word, byFile);
  }
}

// Next.js reads these by name.
const FRAMEWORK = new Set(['default', 'metadata', 'viewport', 'dynamic', 'revalidate', 'runtime',
  'generateMetadata', 'generateStaticParams', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

const unused = [];
for (const file of tracked.filter((f) => /^(app|components|lib)\/.*\.tsx?$/.test(f))) {
  for (const [, name] of readFileSync(file, 'utf8').matchAll(EXPORT)) {
    const byFile = seen.get(name);
    if (!FRAMEWORK.has(name) && byFile.size === 1 && byFile.get(file) === 1) unused.push(`${file}: ${name}`);
  }
}
console.log(unused.length ? unused.join('\n') : 'No unused exports.');
process.exit(unused.length ? 1 : 0);
