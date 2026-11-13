// Where `@blocksuite/*` imports actually point, in one place.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, AND IT IS NOT A PREFERENCE. Every @blocksuite package's
// `exports` map points at its own TypeScript SOURCE -- "./src/index.ts" -- with
// no `types` condition and no `main`. Two things follow, both measured rather
// than assumed:
//
//   * `tsc --noEmit` pulls their source into OUR program and fails on it:
//     "Cannot find name 'VirtualKeyboard'", "'priorityTarget' is used before
//     its initialization". Their files, our gate, and skipLibCheck cannot help
//     because these are .ts in the program rather than .d.ts.
//
//   * A bundler reading the same map gets raw Lit decorators (`@prop()`) and
//     the `accessor` keyword, and the build dies on syntax.
//
// Every package also ships a complete, compiled `dist` with .js and .d.ts. So
// both problems have one answer: resolve @blocksuite to dist. This file
// computes that mapping from each package's own exports map rather than
// guessing the layout -- which matters, because a handful of subpaths do not
// mirror it (`@blocksuite/affine-gfx-turbo-renderer/painter` is a worker file,
// not a directory).
//
// GENERATED, NOT WRITTEN DOWN. There are over four hundred entries. A list
// pasted into two config files is a list that disagrees with itself by
// Thursday, so tsconfig and next.config both read this.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

/**
 * The packages whose compiled output still needs Next's loaders run over it.
 *
 * These three style themselves with vanilla-extract. Their dist `.css.js`
 * files call `style()` at module scope and mean nothing until the plugin has
 * processed them -- and Next excludes node_modules from its loaders, so by
 * default nobody does. `cssFileFilter` already matches `.css.js`, so the fix is
 * not a different resolution but simply letting the loaders reach them:
 * next.config.mjs names these in transpilePackages.
 */
export const NEEDS_LOADERS = [
  '@blocksuite/affine',
  '@blocksuite/affine-block-note',
  '@blocksuite/affine-fragment-outline',
];

export function blocksuiteAliases(root) {
  const scope = path.join(root, 'node_modules', '@blocksuite');
  const alias = {};
  if (!fs.existsSync(scope)) return alias;

  for (const pkg of fs.readdirSync(scope).sort()) {
    const manifest = path.join(scope, pkg, 'package.json');
    const dist = path.join(scope, pkg, 'dist');
    if (!fs.existsSync(manifest) || !fs.existsSync(dist)) continue;

    const { exports = {} } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const [key, value] of Object.entries(exports)) {
      if (typeof value !== 'string' || !value.startsWith('./src/')) continue;
      const compiled = path.join(dist, value.slice('./src/'.length).replace(/\.ts$/, '.js'));
      if (!fs.existsSync(compiled)) continue;
      alias[`@blocksuite/${pkg}${key === '.' ? '' : key.slice(1)}`] = compiled;
    }
  }
  return alias;
}

/**
 * Every @blocksuite package present, for next.config.mjs's transpilePackages.
 *
 * Generated rather than listed, for the same reason as the aliases: a hand
 * list of seventy names is a list that goes stale silently, and the failure it
 * produces is a syntax error pointing at the wrong file.
 */
export function blocksuitePackages(root) {
  const scope = path.join(root, 'node_modules', '@blocksuite');
  if (!fs.existsSync(scope)) return [];
  return fs.readdirSync(scope).sort().map((pkg) => `@blocksuite/${pkg}`);
}
