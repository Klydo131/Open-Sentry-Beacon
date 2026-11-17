// Nothing that belongs to whoever runs a copy is in this repository:
// not in a file, not in a commit message, not in who a commit says wrote it.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The file checks (tests/no-secrets.js, tests/no-backend.js)
// read the files. A commit message, an author line and a co-author trailer are
// just as public and nothing read them. An operator's hosting, database, mail
// and domain are theirs; this is open source, and none of it belongs here.
//
// TWO LAYERS.
//
//   1. SHAPES, checked for everybody: a database or deployment hostname, an
//      e-mail address that is not a reserved example or a service's no-reply,
//      a public network address, a link to a hosting dashboard or to an
//      assistant's session. In every commit message and identity reachable
//      from HEAD.
//
//   2. THE OPERATOR'S OWN WORDS, kept OUTSIDE the repository. Shapes cannot
//      know that one particular domain or project name is private. Whoever
//      runs a copy lists theirs, one per line, in `.private-terms` (ignored by
//      git, see .gitignore) or in the BEACON_PRIVATE_TERMS variable (a secret
//      in CI). Every tracked file and every commit message is then searched
//      for each of them. The list is never printed: a hit names the place and
//      the line of the list, not the word.
//
//   node tests/nothing-of-the-owners.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// ---- 1. Shapes, in what every commit says --------------------------------
let commits = [];
try {
  commits = git('log', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e').split('\x1e').map((r) => r.trim()).filter(Boolean)
    .map((r) => { const [sha, an, ae, cn, ce, body] = r.split('\x1f'); return { sha: sha.slice(0, 9), an, ae, cn, ce, body: body ?? '' }; });
} catch { /* not a git checkout (a tarball): nothing to read */ }

const NOREPLY = /(^|[@.])(noreply\.github\.com|users\.noreply\.github\.com|noreply@anthropic\.com|noreply@github\.com)$|^noreply@|^[\w+.-]+\[bot\]@/i;
const EXAMPLE = /@(example\.(com|org|net|test)|[\w.-]+\.(test|example|invalid|localhost))$/i;
const fine = (e) => NOREPLY.test(e) || EXAMPLE.test(e) || /@users\.noreply\.github\.com$/i.test(e);

const SHAPES = [
  [/\b[a-z0-9-]+\.supabase\.co\b/i, 'a database hostname'],
  [/\b[a-z0-9-]*\.?pooler\.supabase\.com\b/i, 'a database hostname'],
  [/\b[a-z0-9-]+\.vercel\.app\b/i, 'a deployment hostname'],
  [/\bvercel\.com\/[a-z0-9-]+\/[a-z0-9-]+/i, 'a hosting dashboard link'],
  [/\bsupabase\.com\/dashboard\/project\/[a-z]{20}/i, 'a database dashboard link'],
  [/\bclaude\.ai\/code\/|\bsession_[A-Za-z0-9]{12,}|\bchatgpt\.com\/|\bchat\.openai\.com\//i, "a link to an assistant's session"],
  [/\b(?:prj|team|dpl)_[A-Za-z0-9]{16,}\b/, 'a hosting project, team or deployment id'],
  [/\bx(?:smtp|keys)ib-[A-Za-z0-9-]{16,}/, 'a mail key'],
];
const publicIp = (text) => (text.match(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g) ?? []).filter((ip) => {
  const [a, b] = ip.split('.').map(Number);
  if (ip.split('.').some((n) => Number(n) > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 169 && b === 254) return false;
  if ((a === 198 && (b === 51 || b === 18 || b === 19)) || (a === 203 && b === 0)) return false; // documentation ranges
  return true;
});

const said = [];
const who = [];
for (const c of commits) {
  for (const [re, what] of SHAPES) if (re.test(c.body)) said.push(`${c.sha}: ${what} in the message`);
  for (const e of c.body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) if (!fine(e)) said.push(`${c.sha}: an e-mail address in the message`);
  if (publicIp(c.body).length) said.push(`${c.sha}: a network address in the message`);
  for (const [label, e] of [['author', c.ae], ['committer', c.ce]]) if (e && !fine(e)) who.push(`${c.sha}: the ${label}'s own e-mail address`);
}
ok(said.length === 0, `no commit message carries a hostname, an address, a dashboard link or a session link (${commits.length} commits${said.length ? `; ${[...new Set(said)].slice(0, 5).join('; ')}` : ''})`);
ok(who.length === 0, `every commit is written under a no-reply address, never a person's own${who.length ? ` (${[...new Set(who)].slice(0, 5).join('; ')})` : ''}`);

// ---- 2. The operator's own list, kept outside the repository --------------
const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
ok(/^\.private-terms$/m.test(ignore), 'the list of private words is ignored by git, so it can never be committed');
let trackedList = [];
try { trackedList = git('ls-files').split('\n').filter(Boolean); } catch { /* tarball */ }
ok(!trackedList.includes('.private-terms'), 'and it is not tracked');

const listFile = path.join(root, '.private-terms');
const raw = [process.env.BEACON_PRIVATE_TERMS ?? '', fs.existsSync(listFile) ? fs.readFileSync(listFile, 'utf8') : ''].join('\n');
const terms = [...new Set(raw.split(/[\n,]/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 4 && !t.startsWith('#')))];

if (terms.length === 0) {
  console.log('NOTE  no private words listed here (.private-terms or BEACON_PRIVATE_TERMS), so only shapes were checked');
} else {
  const hits = [];
  const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|docx|xlsx|woff2?|ttf|wasm|zip|epub|mp3|mp4|webm)$/i;
  for (const f of trackedList) {
    if (BINARY.test(f) || f === 'package-lock.json') continue;
    let text;
    try { text = fs.readFileSync(path.join(root, f), 'utf8').toLowerCase(); } catch { continue; }
    terms.forEach((t, i) => { if (text.includes(t)) hits.push(`${f} (private word ${i + 1})`); });
    terms.forEach((t, i) => { if (f.toLowerCase().includes(t)) hits.push(`the name of ${f} (private word ${i + 1})`); });
  }
  for (const c of commits) {
    const text = `${c.body}\n${c.an}\n${c.cn}`.toLowerCase();
    terms.forEach((t, i) => { if (text.includes(t)) hits.push(`commit ${c.sha} (private word ${i + 1})`); });
  }
  let branch = '';
  try { branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim().toLowerCase(); } catch { /* fine */ }
  terms.forEach((t, i) => { if (branch.includes(t)) hits.push(`the branch name (private word ${i + 1})`); });
  ok(hits.length === 0, `none of the ${terms.length} private words listed here is in a file, a file name, a commit or the branch name${hits.length ? `: ${[...new Set(hits)].slice(0, 8).join('; ')}` : ''}`);
}

console.log(bad ? `\n${bad} check(s) failed` : '\nNothing of the owner’s is here.');
process.exit(bad ? 1 : 0);
