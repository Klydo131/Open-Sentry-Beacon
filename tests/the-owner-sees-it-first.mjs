// Every change is planned, shown, tested and polished, and the owner is aware of
// it before it reaches `main` -- for people and their AI tools alike.
//
// ---------------------------------------------------------------------------
// The owner's words, 30 September 2026: "Just remember to test, polish, and
// before pushing I should be aware. Same principle for the developers who will
// participate in this open source project with their AI tools."
//
// A rule that lives only in documents can be deleted in a tidy-up without
// anybody noticing. This holds the places it was written: the brief every AI
// tool reads first, the contributor guide, the pull-request checklist, and the
// Claude-specific notes.
//
//   node tests/the-owner-sees-it-first.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const agents = read('AGENTS.md');
const section = /## 0\.2 The owner sees it before it ships([\s\S]*?)\n---/.exec(agents)?.[1] ?? '';
ok(section.length > 0, 'AGENTS.md has the section every AI tool reads first');
ok(/before pushing I\s+should be aware/.test(section), 'it quotes the owner, so nobody has to guess what was meant');
for (const [step, re] of [
  ['plan it and show the plan', /\*\*Plan it, and show the plan\.\*\*/],
  ['test it', /\*\*Test it\.\*\*/],
  ['polish it', /\*\*Polish it\.\*\*/],
  ['the owner is aware before it is pushed', /\*\*The owner is aware before it is pushed\.\*\*[\s\S]*?wait for a go/],
]) {
  ok(re.test(section), `step: ${step}`);
}
ok(/what was \*\*not\*\*\s+verified/.test(section), 'and it asks for what was NOT verified, not only what passed');
ok(/An AI tool works on a branch, opens a pull request,\s+and never pushes to `main` itself/.test(section),
   'an AI tool never pushes to main itself');

const contributing = read('CONTRIBUTING.md');
ok(/## How a change travels/.test(contributing) && /\*\*Using an AI tool\?\*\*/.test(contributing)
   && /it never pushes to `main`/.test(contributing),
   'CONTRIBUTING.md says it for people and for AI tools');
ok(contributing.indexOf('## How a change travels') < contributing.indexOf('## Before you open a pull request'),
   'and says it before the part about opening a pull request');

const template = read('.github/pull_request_template.md');
ok(/## What I could not check/.test(template), 'the pull request asks what could not be checked');
ok(/Screenshots at a phone, a pad and a desktop size/.test(template), 'and for screenshots of anything somebody sees');
ok(/If an AI tool wrote any of this/.test(template), 'and whether an AI tool wrote it, and how it worked');

ok(/\*\*Tell the owner before you push\.\*\*/.test(read('CLAUDE.md')), 'CLAUDE.md says it before "push to main"');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
