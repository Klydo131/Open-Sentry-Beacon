// Feedback is checked by a person, then handed on without anybody's name.
//
// 28 October 2026, asked for: "a feedback system where AI tools can receive
// it, human checks it the feedback, then human can either fix it manually
// through code or give the feedback to other developers or ... use AI tools".
// The owner chose: Directors and the Executive Director review; three ways
// out (a brief to copy, a GitHub issue, a file for AI tools); the sender sees
// what happened.
//
// This checks the part every screen shares, lib/feedback/hand-on.ts: that
// nothing is handed on before a person has written it up, that what is handed
// on never carries the member's own words, name or contact, and that the
// sender is told what happened in plain words without the reviewer's notes.
//
//   node tests/feedback-can-be-handed-on.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-feedback-'));
const bundle = path.join(out, 'hand-on.mjs');
await build({
  entryPoints: [path.join(root, 'lib/feedback/hand-on.ts')],
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const F = await import(pathToFileURL(bundle).href);

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// What a member wrote, with the things that must never travel in it.
const MEMBER_WORDS = 'Sister Maria Santos here, the Journal page went blank. Call me on 0917 555 1234 or maria.santos@example.org';
const item = (over = {}) => ({
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  category: 'bug',
  page: '/study',
  build: 'v2026.10.28',
  createdAt: '2026-10-28T09:00:00Z',
  status: 'in_hand',
  review: { ...F.EMPTY_REVIEW, summary: '', ...over.review },
  ...over,
  review: { ...F.EMPTY_REVIEW, ...(over.review ?? {}) },
});

// ---- 1. Nothing leaves before a person has written it up ------------------
const unreviewed = item();
let threw = false;
try { F.feedbackBrief(unreviewed); } catch { threw = true; }
ok(threw, 'no brief until a reviewer has written the summary');
ok(F.feedbackForAi([unreviewed]).items.length === 0, 'and nothing unreviewed goes into the file for AI tools');

// ---- 2. What leaves is the reviewer's summary, scrubbed -------------------
const reviewed = item({
  review: {
    summary: `Opening the Journal on 2026-10-28 shows a blank page in version 1.4.2. Reported by maria.santos@example.org, phone 0917 555 1234.`,
    doneWhen: 'The Journal opens with today’s page.',
    route: 'ai',
    givenTo: '',
    note: 'Maria is a Guide at the east church; follow up by phone.',
  },
});
const brief = F.feedbackBrief(reviewed);
ok(brief.startsWith('# FB-1a2b3c4d: '), `the brief opens with a reference anyone can quote back (${brief.split('\n')[0]})`);
ok(!brief.includes('maria.santos@example.org') && brief.includes('[email removed]'), 'an email address in the summary is taken out');
ok(!brief.includes('0917 555 1234') && brief.includes('[number removed]'), 'and a phone number');
ok(brief.includes('2026-10-28') && brief.includes('1.4.2'), 'but a date and a version, which a bug report is made of, are kept');
ok(!brief.includes('Maria is a Guide') && !brief.includes('follow up by phone'), 'the reviewer’s private note never goes');
ok(!brief.includes(MEMBER_WORDS) && !brief.includes('Sister Maria Santos'), 'nor the member’s own words');
ok(/## Done when\n\nThe Journal opens with today’s page\./.test(brief), 'it says what done looks like');
ok(brief.includes('AGENTS.md') && brief.includes('npm run verify'), 'and points whoever takes it to the rules and the gate');
ok(brief.includes('an AI tool'), 'and says who it was handed to');

const noDoneWhen = F.feedbackBrief(item({ review: { summary: 'The Journal is blank.', route: 'me' } }));
ok(/## Done when\n\nThe steps in "What happened" no longer go wrong/.test(noDoneWhen), 'a bug with no "done when" gets a sensible one');

// ---- 3. The GitHub issue carries the brief, and only the brief -------------
const url = F.feedbackIssueUrl(reviewed, 'https://github.com/Example/Beacon/');
const u = new URL(url);
ok(u.origin + u.pathname === 'https://github.com/Example/Beacon/issues/new', `the issue opens on the repository’s new-issue page (${u.pathname})`);
ok(u.searchParams.get('title').startsWith('FB-1a2b3c4d: ') && u.searchParams.get('labels') === 'feedback', 'titled with its reference, labelled feedback');
ok(!url.includes('maria') && !decodeURIComponent(url).includes('0917 555 1234'), 'and no email or phone number is in the link');
const long = item({ review: { summary: 'x '.repeat(5000), route: 'developer', givenTo: 'Sam' } });
ok(F.feedbackIssueUrl(long, 'https://github.com/Example/Beacon').length < 8000, 'a long brief is cut to fit the link GitHub accepts');
ok(F.feedbackBrief(long).includes('Sam'), 'given to a developer, the brief names the developer, not the sender');

// ---- 4. The file for AI tools ---------------------------------------------
const done = item({ id: 'aaaaaaaa-0000-4000-8000-000000000000', status: 'done', review: { summary: 'Fixed thing.', route: 'me' } });
const file = F.feedbackForAi([reviewed, unreviewed, done], 'Hope Beacon', new Date('2026-10-28T10:00:00Z'));
ok(file.schema === 'hope-beacon/feedback-for-ai@1' && file.exportedAt === '2026-10-28T10:00:00.000Z', 'the file says what it is and when it was made');
ok(file.items.length === 1 && file.items[0].ref === 'FB-1a2b3c4d', 'only reviewed, open feedback is in it');
const json = JSON.stringify(file);
ok(!json.includes('maria') && !json.includes('0917') && !json.includes('Guide at the east church'), 'with no email, phone number or reviewer note anywhere in it');
ok(json.includes('AGENTS.md'), 'and the same instruction to read the rules first');

// ---- 5. What the sender is told -------------------------------------------
ok(F.statusForSender('new', null, null).word === 'Received', 'the sender sees Received at first');
ok(F.statusForSender('in_hand', null, null).word === 'Being looked at', 'Being looked at while somebody has it');
ok(F.statusForSender('done', 'v2026.10.29', null).line === 'Done in version v2026.10.29.', 'Done, with the version');
ok(/not to change this/.test(F.statusForSender('wont_do', null, null).line), 'and a kind sentence when it will not be done');

fs.rmSync(out, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed.` : '\nFeedback is checked by a person and handed on without anybody’s name.');
process.exit(bad ? 1 : 0);
