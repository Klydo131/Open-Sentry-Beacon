// When there is no signal, the badge says "Offline" and promises nothing.
//
// The owner, 3 October 2026: "Just put offline for text, 'Everything still
// works here' is very misleading". Anything involving other people needs the
// network, so a badge that says everything works is wrong when it matters.
//
//   node tests/offline-says-offline.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'components/OnlineStatus.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const offline = src.slice(src.indexOf('if (!online)'), src.indexOf('if (justBack)'));
ok(offline.length > 0, 'the offline badge is found, so the checks below look at it');
ok(/<span>Offline<\/span>/.test(offline), 'it says "Offline"');
ok(!/still works|works|everything/i.test(offline), 'and makes no promise that things still work');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
