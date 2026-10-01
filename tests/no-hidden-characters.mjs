// No file in this repository carries characters a reader cannot see.
//
// ---------------------------------------------------------------------------
// "TROJAN SOURCE" (CVE-2021-42574). The characters that reverse the direction
// of the text after them (U+202A to U+202E, U+2066 to U+2069) make code read
// differently on screen from how it runs: a comment that seems to end where it
// does not, a check that seems to be there and is not. Zero-width characters
// (U+200B to U+200F, U+2060, U+FEFF) hide a difference between two names that
// look identical. In an open-source project anybody can propose a change, and
// a reviewer -- human or AI -- reads the screen, not the bytes.
//
// FOUND THE HARD WAY, 1 October 2026. Writing lib/talk/thread.ts, which strips
// exactly these characters from file names, the first draft put the characters
// themselves into the source instead of their `\u` escapes. It worked, and it
// was invisible. Write them as escapes; this file fails on the real thing.
//
//   node tests/no-hidden-characters.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|icns|woff2?|ttf|otf|eot|pdf|zip|gz|mp3|mp4|m4a|webm|ogg|wav|heic|wasm)$/i;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'test-results', 'playwright-report']);

function files() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  } catch {
    // Not a git checkout (a downloaded copy): walk the tree instead.
    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(rel); else found.push(rel);
      }
    };
    walk('');
    return found;
  }
}

const HIDDEN = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/u;
const NAMES = {
  0x202a: 'LEFT-TO-RIGHT EMBEDDING', 0x202b: 'RIGHT-TO-LEFT EMBEDDING', 0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE', 0x202e: 'RIGHT-TO-LEFT OVERRIDE', 0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE', 0x2068: 'FIRST STRONG ISOLATE', 0x2069: 'POP DIRECTIONAL ISOLATE',
  0x200b: 'ZERO WIDTH SPACE', 0x200c: 'ZERO WIDTH NON-JOINER', 0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK', 0x200f: 'RIGHT-TO-LEFT MARK', 0x2060: 'WORD JOINER', 0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
};

let scanned = 0;
const found = [];
for (const rel of files()) {
  if (BINARY.test(rel)) continue;
  const full = path.join(root, rel);
  let text;
  try {
    if (!fs.statSync(full).isFile()) continue;
    text = fs.readFileSync(full, 'utf8');
  } catch { continue; }
  scanned++;
  if (!HIDDEN.test(text)) continue;
  text.split('\n').forEach((line, i) => {
    for (const ch of line) {
      const code = ch.codePointAt(0);
      if (NAMES[code]) found.push(`${rel}:${i + 1}  U+${code.toString(16).toUpperCase().padStart(4, '0')} ${NAMES[code]}`);
    }
  });
}

console.log(`scanned ${scanned} text files`);
if (found.length) {
  console.log('FAIL  invisible characters found (write them as \\u escapes if they are meant):');
  for (const f of found) console.log(`      ${f}`);
} else {
  console.log('OK    no file carries a character that reverses or hides text');
}
console.log(found.length === 0 && scanned > 100 ? '\nRESULT: ALL OK' : '\nRESULT: FAILURE');
process.exit(found.length === 0 && scanned > 100 ? 0 : 1);
