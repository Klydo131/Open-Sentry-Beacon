// Temporary mitigation for GHSA-vfj7-8cjw-p6xm; remove when upstream ships a fix.
// MIT source stays attributed in the generated notices. This patch is in our source offer.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310';
const line = '      stack.push(block);';
const bounded = "      if (stack.length > 64) throw new SyntaxError('Pattern nesting exceeds 64 levels');\n" + line;
export function boundParser(source) {
  // Accept only the known original, or that same original with our exact patch.
  const clean = source.replaceAll(bounded, line);
  if (createHash('sha256').update(clean).digest('hex') !== original) {
    throw new Error('braces parser changed: review the upstream fix before building.');
  }
  return clean.replaceAll(line, bounded);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name.startsWith('node_modules/') || !name.endsWith('/braces')) continue;
    if (pkg.version !== '3.0.3') throw new Error(`Review braces ${pkg.version} before building.`);
    const file = path.join(root, name, 'lib/parse.js');
    const source = fs.readFileSync(file, 'utf8');
    const next = boundParser(source);
    if (source !== next) fs.writeFileSync(file, next);
  }
}
