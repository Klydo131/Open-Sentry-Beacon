// Whoever sent a resource can take it back.
//
// Asked for on 12 November 2026, after the sharing audit: the database let a
// sender remove their own share (`shares_drop`), and no screen offered it, so
// something sent to the wrong person stayed with them. The database side is
// proven in supabase/tests/a-resource-is-shared-and-watched.sql (TAKEN BACK).
//
//   node tests/a-share-can-be-taken-back.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const data = read('lib/live/data.ts');
const lib = read('components/LiveLibrary.tsx');

const fn = data.slice(data.indexOf('export async function unshareMaterial'), data.indexOf('// --- The apps a church already uses ---'));
ok(fn.length > 0, 'the data layer can take a share back');
ok(/\.eq\('material_id', materialId\)/.test(fn) && /\.eq\('pairing_id', pairingId\)/.test(fn),
   'one resource, out of one pairing: never every share of it');
ok(/\.eq\('shared_by', me_id\)/.test(fn), 'and only the share this person made');
ok(/data\.length === 0\) throw new Error\('Only the person who sent it can take it back\.'\)/.test(fn),
   'a share that was not theirs to remove is said, not passed over in silence');
ok(!/from\('materials'\)/.test(fn), 'the resource itself stays on the shelf');

ok(/live\.unshareMaterial\(m\.id, pairingId\)/.test(lib), 'the send panel calls it');
// Two taps: the chip asks, the red button does it. One tap would take back
// what somebody meant only to look at.
ok(/setTakingBack\(`\$\{m\.id\}:\$\{p\.id\}`\)/.test(lib) && /Yes, take it back from \{first\}/.test(lib),
   'the first tap asks and the second takes it back');
ok(/Leave it/.test(lib), 'with a way to change their mind');
ok(/They no longer have it\./.test(lib), 'and the sender is told what happened');
ok(/to\.delete\(pairingId\)/.test(lib), 'the name is offered again at once, without a reload');

console.log(bad === 0 ? '\nAll take-back checks passed.' : `\n${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
