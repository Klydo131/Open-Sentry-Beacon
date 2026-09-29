// The agent toolkit is vetted, pinned, and switched on by nobody but the
// developer who wants it.
//
// Asked for on 29 September 2026, with a list of thirty Claude Code add-ons:
// "Put this in our system please. Dont repeat the tools that we have now. As
// much as possible this settup is available in our Open source project so that
// migration will be easy for all developers." And with it the standing rule:
// "We dont want rouge people or smart AI to ruin our Open source project."
//
// Several of those tools run code by themselves on every session. A public
// repository that switched them on for whoever cloned it would be making that
// choice for strangers, so this file holds the line: a list anybody can read
// and install from, and nothing that installs itself.
//
//   node tests/the-toolkit-is-opt-in.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const list = JSON.parse(read('tools/developer-toolkit.json'));
const tools = list.tools ?? [];
const doc = read('docs/DEVELOPER-TOOLKIT.md');

// 1. NOTHING SWITCHES ITSELF ON.
//
// Rechecked on 29 September 2026 against CodeGraph's installer, which offers
// "just this project" and then writes .mcp.json, .claude/settings.json and
// .claude/CLAUDE.md for Claude Code, and .codex/config.toml and a section of
// AGENTS.md for Codex. Committed, any of those starts a tool for every
// contributor. They are in .gitignore, so a developer's own copy is harmless
// and never swept into a commit; this catches one added by force, and one
// about to be committed.
const PROJECT_AGENT_SETUP = [
  '.mcp.json', '.claude/CLAUDE.md', '.codex/', '.cursor/mcp.json', '.vscode/mcp.json',
  '.gemini/settings.json', 'opencode.json', 'opencode.jsonc', '.kiro/settings/mcp.json',
];
// Tracked, plus anything new that `git add -A` would pick up.
const shipped = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);
const setUp = shipped.filter((f) => PROJECT_AGENT_SETUP.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
ok(setUp.length === 0, setUp.length
  ? `these would switch a tool on for everybody who clones the repository: ${setUp.join(', ')}`
  : 'no agent is set up for whoever clones this: no project MCP, Codex, Cursor, VS Code, Gemini, opencode or Kiro settings');
const ignoreLines = read('.gitignore').split('\n').map((l) => l.trim());
const notIgnored = PROJECT_AGENT_SETUP.filter((p) => !ignoreLines.includes(`/${p}`));
ok(notIgnored.length === 0, notIgnored.length
  ? `.gitignore does not keep these out of a commit: ${notIgnored.join(', ')}`
  : "and .gitignore keeps a developer's own copy of each out of every commit");
// A tool that writes itself into the shared instructions speaks to every
// contributor's agent. CodeGraph's installer fences its section with
// <!-- CODEGRAPH_START --> and <!-- CODEGRAPH_END -->; other installers do the same.
for (const f of ['AGENTS.md', 'CLAUDE.md']) {
  const block = read(f).match(/<!--\s*[A-Z][A-Z0-9_]*_(?:START|BEGIN)\s*-->/);
  ok(!block, block
    ? `${f} carries a section written by a tool's installer (${block[0]}): remove it and install for yourself instead`
    : `${f} carries nothing written by a tool's installer`);
}
if (exists('.claude/settings.json')) {
  // A shared settings file is applied to every contributor's Claude Code, so the
  // one thing it may do is take power away: a deny list. Checking for plugins,
  // hooks and status lines alone (as this did until 29 September 2026) let
  // through the worse three: an allow list that runs commands without asking,
  // an environment that can point every session at another server, and a helper
  // command run on every machine.
  const settings = JSON.parse(read('.claude/settings.json'));
  const extra = Object.keys(settings).filter((k) => k !== '$schema' && k !== 'permissions');
  const widening = Object.keys(settings.permissions ?? {}).filter((k) => k !== 'deny');
  ok(extra.length === 0 && widening.length === 0,
    extra.length || widening.length
      ? `the shared Claude settings do more than deny: ${[...extra, ...widening.map((k) => `permissions.${k}`)].join(', ')}`
      : 'the shared Claude settings can only take power away');
} else {
  ok(true, 'there are no shared Claude settings to enable anything');
}
ok(/^\/?\.claude\/settings\.local\.json$/m.test(read('.gitignore')),
  "a developer's own Claude settings are never committed");
const pkg = JSON.parse(read('package.json'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
ok(!['repomix', '@colbymchenry/codegraph', '@openai/codex'].some((d) => d in deps),
  'no toolkit tool is a dependency of the app');

// 2. EVERY TOOL SAYS WHAT IT IS, WHERE IT CAME FROM, AND WHAT IT RUNS.
ok(tools.length >= 25, `the list covers what was asked about (${tools.length} tools)`);
for (const t of tools) {
  const problems = [];
  if (!/^[\w.-]+\/[\w.-]+$/.test(t.repo ?? '')) problems.push('repo');
  if (!/^[0-9a-f]{40}$/.test(t.commit ?? '')) problems.push('commit is not a full 40-character id');
  if (!t.licence) problems.push('licence');
  if (!t.runs_on_its_own) problems.push('what it runs on its own');
  if (!t.why || t.why.length < 40) problems.push('a reason');
  if (!['already-ours', 'recommended', 'already-have', 'left-out'].includes(t.status)) problems.push('status');
  if (['already-ours', 'recommended'].includes(t.status)) {
    if (!Array.isArray(t.install) || !t.install.length) problems.push('install steps');
    if (/no licence/i.test(t.licence)) problems.push('a recommended tool with no licence');
    for (const c of t.install ?? []) if (/@latest\b/.test(c)) problems.push(`an unpinned install (${c})`);
    for (const c of t.install ?? []) if (/^npx /.test(c) && !/@\d+\.\d+\.\d+/.test(c)) problems.push(`npx without a version (${c})`);
    // What leaves the developer's machine, said on the page exactly as the list
    // says it. CodeGraph was first listed as staying on the machine; it sends
    // usage counts unless told not to.
    if (!t.sends) problems.push('what it sends');
    else if (!doc.includes(`| ${t.sends} |`)) problems.push('what it sends, on the page as the list says it');
    if (!doc.includes(`| ${t.runs_on_its_own} |`)) problems.push('what it runs, on the page as the list says it');
  }
  if (t.status === 'already-ours' && !(t.install_codex ?? []).length) problems.push('Codex install steps');
  if (!doc.includes(`\`${t.repo}\``)) problems.push('not on docs/DEVELOPER-TOOLKIT.md');
  ok(problems.length === 0, problems.length ? `${t.id}: missing ${problems.join(', ')}` : `${t.id}: ${t.status}, pinned, licensed, and says what it runs`);
}

// 3. THE RULES THAT DECIDED IT.
const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
ok(byId['caveman']?.status === 'already-ours' && byId['ponytail']?.status === 'already-ours'
   && /Klydo131\//.test(byId['caveman']?.repo) && /Klydo131\//.test(byId['ponytail']?.repo),
  "Caveman and Ponytail come from the owner's own forks");
ok(byId['claude-mem']?.status === 'left-out' && byId['claude-code-router']?.status === 'left-out',
  'nothing that records sessions or sends them to another company is recommended: sessions here can read live member data');
ok(byId['system-prompts']?.status === 'left-out', "other companies' unlicensed prompts are not built on");
ok(/## 0\.1 Working today first, then right/.test(read('AGENTS.md')) && /docs\/DEVELOPER-TOOLKIT\.md/.test(read('AGENTS.md')),
  "AGENTS.md carries the first-day protocol and points here");

console.log(bad === 0 ? '\nA toolkit anybody can read, and nobody gets without asking.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
