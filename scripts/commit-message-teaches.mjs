// Refuses a commit message that does not teach.
//
// What "teaches" means here, and only this (so it is hard to argue with and
// easy to meet): a subject line, then a body of real sentences, with at least
// one line that says WHY (the problem, the cause, the reason for the choice).
// Merge, revert and fixup commits, and Dependabot's, are left alone.
//
//   node scripts/commit-message-teaches.mjs <message-file>
import fs from 'node:fs';

export function teaches(message) {
  const lines = message.split('\n').filter((l) => !l.startsWith('#'));
  const text = lines.join('\n').trim();
  if (!text) return { ok: false, why: 'the message is empty' };
  const subject = lines[0].trim();
  if (/^(Merge |Revert |fixup! |squash! )/.test(subject) || /^Bump |^build\(deps/.test(subject)) return { ok: true };
  // Trailers (Co-Authored-By, Claude-Session ...) are not the explanation.
  const body = lines.slice(1).filter((l) => !/^[A-Za-z-]+: /.test(l) || /^(Why|Problem|Cause|Fix|Checked|How): /i.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  if (subject.length < 12) return { ok: false, why: 'the subject line is too short to say what changed' };
  if (subject.length > 100) return { ok: false, why: 'the subject line is over 100 characters: keep it to what changed, and put the rest in the body' };
  if (body.length < 80) return { ok: false, why: 'the body is too short: say what was wrong or missing and why this is the fix (at least a couple of sentences)' };
  if (!/\b(because|so that|since|why|reason|caused|cause|without|instead|before|previously|otherwise|which meant|this means)\b/i.test(body)) {
    return { ok: false, why: 'the body never says why: add the reason, the cause or what would have gone wrong' };
  }
  return { ok: true };
}

if (process.argv[1] && process.argv[1].endsWith('commit-message-teaches.mjs') && process.argv[2]) {
  const r = teaches(fs.readFileSync(process.argv[2], 'utf8'));
  if (!r.ok) {
    console.error(`\nThis commit message does not teach yet: ${r.why}.`);
    console.error('Write it for a developer who was not here: what changed, why it was needed, how you checked it.');
    console.error('(AGENTS.md section 0.1. Merge, revert and dependency-bump commits are exempt.)\n');
    process.exit(1);
  }
}
