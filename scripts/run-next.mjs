import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
// Stopping this wrapper stops the server it started. Without this, a stop
// reached only the wrapper and left Next.js running, holding its port.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else process.exitCode = code ?? 1;
});
