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
ok(!exists('.mcp.json'), 'there is no .mcp.json: cloning the repository starts no MCP server');
if (exists('.claude/settings.json')) {
  const settings = JSON.parse(read('.claude/settings.json'));
  ok(!settings.enabledPlugins && !settings.extraKnownMarketplaces && !settings.hooks && !settings.statusLine,
    'the shared Claude settings enable no plugin, marketplace, hook or status line');
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
  }
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
