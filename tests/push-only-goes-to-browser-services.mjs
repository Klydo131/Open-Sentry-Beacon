import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
const source = fs.readFileSync(new URL('../supabase/functions/notify/endpoint.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const { isPushEndpoint } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const host of ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com',
  'updates-push.services.mozaws.net', 'web.push.apple.com', 'wns2.notify.windows.com']) {
  assert.equal(isPushEndpoint(`https://${host}/opaque-subscription`), true, host);
}
for (const value of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://[::1]/x',
  'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'https://private.example/x',
  'https://fcm.googleapis.com.evil.example/x', 'https://evilpush.apple.com/x',
  'https://fcm.googleapis.com@evil.example/x', 'https://user:pass@fcm.googleapis.com/x',
  'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com/x#fragment', 'not a URL']) {
  assert.equal(isPushEndpoint(value), false, value);
}
const sender = fs.readFileSync(new URL('../supabase/functions/notify/index.ts', import.meta.url), 'utf8');
const guarded = sender.indexOf('if (!isPushEndpoint(device.endpoint)) return');
assert(guarded >= 0 && guarded < sender.indexOf('await webpush.sendNotification('));
assert.match(sender, /timeout: 15_000/);
console.log('PASS: browser push endpoints work; local, metadata and unrelated destinations are refused.');
