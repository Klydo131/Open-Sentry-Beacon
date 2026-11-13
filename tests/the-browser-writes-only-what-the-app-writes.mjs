// Two rules that came out of an audit, and the audit came out of one bug.
//
// ---------------------------------------------------------------------------
// RULE ONE: A POLICY DECIDES ROWS, A GRANT DECIDES COLUMNS.
//
// `messages_mark` was an UPDATE policy written for read receipts. RLS is ROW
// level and says nothing about columns, so it also let either person in a
// pairing rewrite the other's words. Auditing for the same shape found three
// more, one of which mattered:
//
//   prayer_requests   a Guide could rewrite their Explorer's own prayer, and
//                     flip share_with_church to publish a private request to
//                     the whole congregation
//   meetings          either party could silently rewrite the time, place and
//                     JOINING LINK of a meeting the other had confirmed
//   notifications     the whole row, where the app writes read_at
//   lesson_assignments the whole row, where the app writes completed_at
//
// The fix is a column grant per table. This file exists because the failure
// mode is invisible: a later migration doing `grant update on X to
// authenticated` looks utterly ordinary and silently reopens all of it.
//
// RULE TWO: ROLE IS NOT CHURCH.
//
//   is_admin() / is_executive()         the caller's role. No church.
//   leads_church(c) / manages_church(c) role AND that church.
//
// Both guardian-consent functions checked the first while taking a member id,
// so a Director of one church could record or withdraw guardian consent for a
// minor in another. These are the most safeguarding-sensitive functions here.
//
//   node tests/the-browser-writes-only-what-the-app-writes.mjs
// ---------------------------------------------------------------------------
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

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql')).sort()
  .map((f) => ({ name: f, sql: read(`supabase/migrations/${f}`) }));

// ---------------------------------------------------------------------------
// 1. EVERY NARROWED TABLE IS NARROWED, AND STAYS NARROWED
// ---------------------------------------------------------------------------
//
// The column each table is allowed is the column lib/live/data.ts actually
// writes. Both halves are checked: the grant in the migrations, and that the
// app has not since grown a write to some other column, which would be a
// broken feature rather than a hole but is just as worth catching.
{
  const NARROWED = [
    ['messages',           'read_at'],
    ['prayer_requests',    'status'],
    ['meetings',           'status'],
    ['notifications',      'read_at'],
    ['lesson_assignments', 'completed_at'],
  ];

  const data = read('lib/live/data.ts');

  for (const [table, column] of NARROWED) {
    const fixedAt = migrations.findIndex((m) =>
      new RegExp(`grant\\s+update\\s*\\(\\s*${column}\\s*\\)\\s*on\\s+public\\.${table}\\s+to\\s+authenticated`, 'i')
        .test(m.sql));
    ok(fixedAt !== -1, `${table}: the browser is granted UPDATE (${column}) and nothing else`);

    ok(migrations.some((m) =>
      new RegExp(`revoke\\s+update\\s+on\\s+public\\.${table}\\s+from\\s+authenticated`, 'i').test(m.sql)),
      `${table}: and the blanket UPDATE was revoked first`);

    // THE REGRESSION. Only migrations AFTER the fix count -- the original
    // blanket grants are history and live in 0004.
    const after = fixedAt === -1 ? [] : migrations.slice(fixedAt + 1);
    const reopened = after.filter((m) =>
      new RegExp(`grant[^;]*\\bupdate\\b(?![^;]*\\()[^;]*on[^;]*public\\.${table}[^;]*to[^;]*authenticated`, 'i')
        .test(m.sql));
    ok(reopened.length === 0,
       `${table}: nothing after the fix hands the whole row back${
         reopened.length ? ` (found in: ${reopened.map((m) => m.name).join(', ')})` : ''}`);

    // And the app still only writes that column, so the grant is not too tight.
    const writes = [...data.matchAll(new RegExp(`from\\('${table}'\\)\\s*\\n?\\s*\\.update\\(([^)]*)\\)`, 'g'))]
      .map((m) => m[1]);
    ok(writes.every((w) => new RegExp(column).test(w)),
       `${table}: the app writes only ${column} (${writes.length} update call${writes.length === 1 ? '' : 's'})`);
  }
}

// ---------------------------------------------------------------------------
// 2. GUARDIAN CONSENT IS SCOPED TO THE CHURCH
// ---------------------------------------------------------------------------
//
// Read from the LAST definition of each function, because these are
// `create or replace` and an earlier migration still contains the old body.
{
  for (const fn of ['record_guardian_consent', 'withdraw_guardian_consent']) {
    const owning = [...migrations].reverse()
      .find((m) => new RegExp(`function public\\.${fn}\\b`).test(m.sql));
    ok(Boolean(owning), `${fn} is defined in a migration`);
    if (!owning) continue;

    const start = owning.sql.lastIndexOf(`function public.${fn}`);
    const body = owning.sql.slice(start, owning.sql.indexOf('$function$;', start) + 11);

    ok(/leads_church\(/.test(body),
       `${fn} authorises against the child's church, not just a role`);
    ok(!/if not \(public\.is_admin\(\) or public\.is_executive\(\)\)/.test(body),
       `${fn} no longer lets a Director of any church act on any child`);
  }
}

// ---------------------------------------------------------------------------
// 3. THE TABLES THAT NOTHING MAY WRITE FROM A BROWSER
// ---------------------------------------------------------------------------
{
  const all = migrations.map((m) => m.sql).join('\n');
  ok(/revoke all on public\.message_revisions from authenticated/i.test(all),
     'message_revisions is unreachable by grant as well as by policy');
  ok(/revoke insert, update, delete on public\.guild_wall_pulse from authenticated/i.test(all),
     'guild_wall_pulse can be read by its policy but written by nobody');
  ok(/revoke all on function private\.bump_guild_wall/i.test(all),
     'the internal pulse function is not callable from a browser');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
