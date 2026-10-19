// Prove a change touched only comments and blank lines.
//
// Compiles every changed .ts/.tsx/.js/.mjs file twice, as it is in <base> and
// as it is on disk, with comments removed, and compares the two. Identical
// output means the program did not change. Exits 1 and names the file when it
// did, or when a file was added or deleted.
//
//   node scripts/same-code.mjs [base]    (default: HEAD)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const base = process.argv[2] ?? 'HEAD';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const show = (spec) => { try { return git('show', spec); } catch { return null; } };
const files = git('diff', '--name-only', base, '--', '*.ts', '*.tsx', '*.js', '*.mjs').split('\n').filter(Boolean);

const compile = (fileName, source) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      removeComments: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

let changed = 0;
for (const file of files) {
  const before = show(`${base}:${file}`);
  const after = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const same = before !== null && after !== null && compile(file, before) === compile(file, after);
  if (!same) changed++;
  console.log(`${same ? 'same' : 'CODE'}  ${file}${before === null ? ' (added)' : after === null ? ' (deleted)' : ''}`);
}
console.log(changed ? `\n${changed} of ${files.length} files changed code.` : `\nAll ${files.length} files: comments only.`);
process.exit(changed ? 1 : 0);
