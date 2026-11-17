// A commit message must teach a developer who was not there.
//
//   node tests/a-commit-message-teaches.mjs
import fs from 'node:fs';
import { teaches } from '../scripts/commit-message-teaches.mjs';

let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const good = `Fix the reset link landing on the home page

The link asked for /new-password, but the auth service only honours that when the exact address is on its allowed list, so it fell back to the home page and the person was left signed in with nowhere to choose a password.
A small script in <head> now hands any recovery link to /new-password before the sign-in client consumes it. Held by a test that runs the script on eleven addresses.`;
ok(teaches(good).ok, 'a message with a what, a why and a check passes');
ok(!teaches('Fix stuff').ok, 'a bare subject is refused');
ok(!teaches('Update the reset link page\n\nChanged it.').ok, 'a body that is too short is refused');
ok(!teaches('Rename the helper functions in the picker\n\nThe helper functions in the picker were renamed and moved into one file and the imports were changed to match the new file location everywhere.').ok, 'a body that never says why is refused');
ok(teaches('Merge branch main into claude/x').ok, 'a merge commit is exempt');
ok(teaches('Bump the minor-and-patch group with 7 updates').ok, 'a dependency bump is exempt');
ok(teaches(`${good}\n\nCo-Authored-By: Someone <noreply@example.test>\nClaude-Session: x`).ok, 'trailers do not count against it');
ok(!teaches('Short fix here ok\n\nCo-Authored-By: Someone <noreply@example.test>\nClaude-Session: x').ok, 'and trailers do not stand in for an explanation');

const hook = fs.readFileSync('.githooks/commit-msg', 'utf8');
ok(/commit-message-teaches\.mjs/.test(hook), 'the commit-msg hook runs it');
ok(/0\.1\.1 An update teaches/.test(fs.readFileSync('AGENTS.md', 'utf8')), 'and the brief says why');
console.log(bad ? `\n${bad} check(s) failed` : '\nA message teaches.');
process.exit(bad ? 1 : 0);
