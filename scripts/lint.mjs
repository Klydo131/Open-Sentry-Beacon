// Noninteractive linting through the installed CLI, on every supported platform.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
const result = spawnSync(process.execPath, [cli, 'app', 'components', 'lib'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
