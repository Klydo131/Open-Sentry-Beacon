// No conversation in the repository.
//
// The repository is public. What the maintainer or anyone else said in a chat,
// an issue or a message is private, and so are AI session links and private
// reports. Decisions are written as decisions, in neutral words (AGENTS.md,
// section 0). This catches the shapes a quoted conversation takes in code
// comments and docs: a dated or attributed quotation of a request.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|css|md|sql|sh|py|rs|toml|html|yml|yaml)$/.test(f))
  .filter((f) => !f.startsWith('node_modules/') && !f.includes('THIRD-PARTY')
    && !f.startsWith('tools/pstack/') // a vendored project; its "founder" is not ours
    && f !== 'tests/no-conversation-in-the-repo.mjs' && f !== 'tests/no-secrets.js');

const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
const FIRST_PERSON = /\b(I|I'm|we|our|my|please|can we|kindly|should|want|would|let|make)\b/i;
const shapes = [
  // a date, then a quoted request: (13 November 2026: "...")
  new RegExp(`\\b\\d{1,2} ${MONTH}(?: \\d{4})?\\)?[:,]?\\s*(?:\\n\\s*(?://|\\*|--|#)?\\s*)?\\*?"([^"]{12,900}?)"`, 'g'),
  // an attributed quotation: The owner: "...", Asked for: "...", in these words: "..."
  /(?:THE ASK|[Tt]he (?:owner|founder|maintainer)(?:'s words)?|[Aa]sked(?: for)?|in (?:these|those|their) words)[^"\n]{0,40}?[:,]\s*(?:\n\s*(?:\/\/|\*|--|#)?\s*)?\*?"([^"]{12,900}?)"/g,
];
// In code, only the comments are prose; in docs, all of it is. Comments keep
// their line breaks, so a match still points at the right line.
function prose(f, src) {
  if (/\.md$/.test(f)) return src;
  const keep = (text) => text.replace(/[^\n]/g, ' ');
  let out = '';
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*|#[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += keep(src.slice(last, m.index));
    const t = m[0];
    const isComment = t.startsWith('/*') || t.startsWith('//')
      || (t.startsWith('--') && /\.sql$/.test(f)) || (t.startsWith('#') && /\.(sh|py|toml|ya?ml)$/.test(f));
    out += isComment ? t : keep(t);
    last = m.index + t.length;
  }
  return out + keep(src.slice(last));
}
const found = [];
for (const f of files) {
  let s;
  try { s = prose(f, fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const re of shapes) {
    for (const m of s.matchAll(re)) {
      const body = m[1];
      if (body.split(/\s+/).length < 5 || /[{`<]|=>/.test(body) || !FIRST_PERSON.test(body)) continue;
      found.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
}
// Stricter: after "Asked for", "Chosen", "THE ASK" or "The owner", ANY quotation,
// however short, is a quoted request.
const LEAD = new RegExp(`(?:(?:WHAT WAS )?ASKED FOR|[Aa]sked(?: for)?|[Cc]hosen|[Rr]eworked|[Rr]equested|THE ASK|[Tt]he (?:owner|founder|maintainer)(?:'s words)?)(?:[^"\\n]{0,40}?\\b\\d{1,2} ${MONTH}(?: \\d{4})?\\)?)?[^"\\n]{0,30}?[:,]\\s*\\*?"([^"\\n]{2,300})"`, 'g');
for (const f of files) {
  let s;
  try { s = prose(f, fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const m of s.matchAll(LEAD)) {
    // A code example (`variant="ghost"`) is not a quotation.
    if (/[{`<]|=>/.test(m[0]) || m[1].split(/\s+/).length < 3) continue; // a label, not a sentence
    // Already inside a quotation or code span on this line: the "quote" found
    // is the far side of somebody else's, not a request.
    const before = s.slice(s.lastIndexOf('\n', m.index) + 1, m.index);
    if ((before.split('"').length - 1) % 2 === 1 || (before.split('`').length - 1) % 2 === 1) continue;
    found.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
  }
}
// Catch-all: a first-person quotation within a few words of "owner",
// "founder", "asked" or a year, in a comment or a doc. Wider than the shapes
// above; it is what found the quotes they missed.
const NEAR = /(?:owner|founder|[Aa]sked|ASKED|20\d\d)[^"\n]{0,60}?\*?"([^"]{8,1500}?)"/g;
for (const f of files) {
  let s;
  try { s = prose(f, fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const m of s.matchAll(NEAR)) {
    const body = m[1];
    if (body.split(/\s+/).length < 6 || /[{`<]|=>/.test(m[0]) || !FIRST_PERSON.test(body)) continue;
    const before = s.slice(s.lastIndexOf('\n', m.index) + 1, m.index);
    if ((before.split('"').length - 1) % 2 === 1) continue;
    found.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
  }
}
// Request words inside a quotation, in a comment or doc: "I want", "can we",
// "please", "kindly"... Ordinary sample text (a prayer request in the sample
// church, a button label) is listed as such.
const REQ = /\b(I want|I dont|I don't|I do not|can we|please|kindly|I would|I wanted|I must|I told you|I hope|I think|I need|I already|we want|we need|we already|let's|make sure)\b/i;
const SAMPLE = /please pray|I want to understand prayer|I already have it installed|what can we delete|Can we change the stages|do I have what I need/i;
const QUOTE = /("|\u201c)([^"\u201c\u201d\n]{6,}(?:\n[^"\u201c\u201d\n]*){0,10}?)("|\u201d)/g;
const REPORT = /(?:REPORTED(?: AS)?(?: A BUG)?|[Rr]eported(?: as)?|[Cc]omplained)[^"\n]{0,25}?[:,]?\s*"([^"\n]{3,300})"/g;
for (const f of files) {
  let s;
  try { s = prose(f, fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const m of s.matchAll(QUOTE)) {
    if (m[2].split(/\s+/).length >= 3 && REQ.test(m[2]) && !SAMPLE.test(m[2])) found.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
  }
  for (const m of s.matchAll(REPORT)) {
    if (m[1].split(/\s+/).length >= 3 && !m[0].includes('`')) found.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
  }
}
ok(found.length === 0, found.length
  ? `a quoted conversation is in a tracked file at ${found.slice(0, 8).join(', ')}${found.length > 8 ? ` and ${found.length - 8} more` : ''}`
  : 'no quoted requests in comments or docs');

// Links to AI sessions, chats and private documents.
let links = '';
try {
  links = execFileSync('git', ['grep', '-nE',
    'claude\\.ai/(code/)?(session|chat|artifact)|chatgpt\\.com/(c|share)/|docs\\.google\\.com/[a-z]+/d/[A-Za-z0-9_-]{20,}|drive\\.google\\.com/(file/d|drive/folders)/[A-Za-z0-9_-]{20,}',
    '--', '.', ':!node_modules', ':!tests/no-conversation-in-the-repo.mjs'], { encoding: 'utf8' }).trim();
} catch { /* git grep exits 1 when nothing matches */ }
ok(!links, links ? `a private link is tracked: ${links.split('\n').slice(0, 3).join(' | ')}` : 'no links to AI sessions, chats or private documents');

console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
process.exit(bad ? 1 : 0);
