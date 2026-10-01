// The research agents in this repository read and report. They never write.
//
// ---------------------------------------------------------------------------
// Asked for on 1 October 2026: "make some agents for research and put it on our
// open source project to improve our app in design and also security. Security
// will always be the number one priority for safety issues."
//
// An agent definition is an instruction anyone can run with full access to
// their copy of the code. So the definitions are held to the same standard as
// the code: they may only read, they keep real people's data out of every
// prompt and report, the security reviewer says it comes first, and every file
// they tell an agent to read exists -- the first draft named `lib/safe-link`,
// which does not, and an agent sent to a file that is not there learns nothing
// and may invent what it would have said.
//
//   node tests/the-research-agents-only-read.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const dir = '.claude/agents';
const agents = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.md'));
ok(['security-reviewer.md', 'design-researcher.md', 'licence-auditor.md'].every((f) => agents.includes(f)),
   `the three agents are here (${agents.join(', ')})`);

const WRITE_TOOLS = /\b(Edit|Write|MultiEdit|NotebookEdit)\b/;

for (const file of agents) {
  const text = read(`${dir}/${file}`);
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  const name = /^name:\s*(\S+)/m.exec(front)?.[1];
  const tools = /^tools:\s*(.+)$/m.exec(front)?.[1] ?? '';
  ok(name === file.replace(/\.md$/, ''), `${file}: its name matches its file`);
  ok(/^description:\s*\S/m.test(front), `${file}: it says when to use it`);
  ok(tools.length > 0 && !WRITE_TOOLS.test(tools), `${file}: it is given reading tools only (${tools})`);
  ok(/never/i.test(text) && /(edit|create or delete) (files in )?the repository/i.test(text),
     `${file}: it is told never to change the repository`);
  ok(/real (data|members'? details|member's name)|member's name/i.test(text) || /real data/i.test(text),
     `${file}: it keeps real people's data out`);
}

{
  const security = read(`${dir}/security-reviewer.md`);
  ok(/first priority/i.test(security) && /before every other concern/i.test(security),
     'the security reviewer comes first, in its own words');
  ok(/live database/i.test(security), 'and never touches a live database');
}

// Every repository path an agent is sent to read exists.
{
  const docs = [...agents.map((f) => `${dir}/${f}`), 'docs/agents/README.md'];
  const missing = [];
  for (const d of docs) {
    for (const m of read(d).matchAll(/`([^`\s]+)`/g)) {
      const p = m[1].replace(/[),.:]+$/, '');
      if (!/^(app|components|lib|scripts|supabase|tests|docs|\.claude|\.github|public)\//.test(p)
          && !/^[\w-]+\.(md|mjs|ts|tsx|sql|json)$/.test(p)) continue;
      if (/\.\.\.|\*/.test(p)) continue;
      const candidates = [p, `docs/${p}`];
      if (!candidates.some(exists)) missing.push(`${d}: ${p}`);
    }
  }
  ok(missing.length === 0, missing.length ? `named but missing:\n      ${missing.join('\n      ')}` : 'every file an agent is sent to read exists');
}

{
  const guide = read('docs/agents/README.md');
  ok(['security-reviewer', 'design-researcher', 'licence-auditor'].every((n) => guide.includes(`.claude/agents/${n}.md`)),
     'the contributor guide lists all three');
  ok(/AGPL-3\.0-only/.test(guide) && /compatible/.test(guide), 'and the licence rule for borrowing code');
  ok(/docs\/agents/.test(read('AGENTS.md')), 'and AGENTS.md points to it');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
