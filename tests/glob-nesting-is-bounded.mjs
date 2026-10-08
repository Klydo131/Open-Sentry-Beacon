import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { boundParser } from '../scripts/bound-braces.mjs';
const require = createRequire(import.meta.url);
const braces = require('braces');
assert.deepEqual(braces.expand('a/{b,c}/{1..3}'), ['a/b/1', 'a/b/2', 'a/b/3', 'a/c/1', 'a/c/2', 'a/c/3']);
for (const pair of [['{', '}'], ['(', ')']]) {
  const pattern = pair[0].repeat(4000) + 'x' + pair[1].repeat(4000);
  assert.throws(() => braces(pattern), /Pattern nesting exceeds 64 levels/);
}
assert.throws(() => boundParser('different upstream source'), /parser changed/);
console.log('PASS: ordinary globs work; excessive brace and parenthesis nesting is refused.');
