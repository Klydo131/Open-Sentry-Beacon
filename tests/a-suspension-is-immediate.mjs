// A suspended account is refused on its very next request.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Suspension used to delete a person's sessions and ban their
// login, and a migration said that put somebody already signed in "out
// immediately". It did not: the data API checks a token's signature and expiry
// and never consults the sessions table, so a token issued before the
// suspension kept working until it lapsed. And for that time nothing noticed,
// because "approved" never meant "not suspended". Proven on the live database,
// in a transaction that was discarded: a Director marked suspended still passed
// is_admin() and is_approved_user(), and discipline_check() still said 'ok' to
// suspending an Explorer.
//
// The fix is three layers (supabase/migrations/20260923164500_a_suspension_is_
// immediate.sql). This holds all three, reading the LAST definition of each
// thing across every migration -- the one the database actually has after a
// fresh apply -- so a later migration that quietly rewrites a helper without
// the rule is caught, not just a deletion of this one.
//
//   node tests/a-suspension-is-immediate.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
// Comments out, so a sentence ABOUT suspended_at cannot satisfy the check.
const sql = files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '')]);

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** The body of the last `create or replace function <name>(` across all migrations. */
function lastFunction(name) {
  let found = null;
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${name.replace('.', '\\.')}\\s*\\(`, 'gi');
  for (const [file, text] of sql) {
    for (const m of text.matchAll(re)) {
      // To the end of the dollar-quoted body.
      const open = text.indexOf('$$', m.index);
      const close = open === -1 ? -1 : text.indexOf('$$', open + 2);
      if (close !== -1) found = { file, body: text.slice(m.index, close + 2) };
    }
  }
  return found;
}

/** The last `create policy <name> on <table>` across all migrations. */
function lastPolicy(name, table) {
  let found = null;
  const re = new RegExp(`create\\s+policy\\s+"?${name}"?\\s+on\\s+(public\\.)?${table}\\b[\\s\\S]*?;`, 'gi');
  for (const [file, text] of sql) for (const m of text.matchAll(re)) found = { file, body: m[0] };
  return found;
}

// 1. THE DATA API REFUSES A SUSPENDED ACCOUNT BEFORE ANYTHING ELSE RUNS.
{
  let setting = null;
  for (const [file, text] of sql) {
    const m = text.match(/pgrst\.db_pre_request\s*=\s*''?([a-z_.]+)/i);
    if (m) setting = { file, fn: m[1] };
  }
  ok(!!setting, `the data API runs a check before every request (${setting ? setting.fn : 'none set'})`);
  const fn = setting && lastFunction(setting.fn.includes('.') ? setting.fn : `public.${setting.fn}`);
  ok(!!fn && /suspended_at\s+is\s+not\s+null/i.test(fn.body) && /raise\s+exception/i.test(fn.body),
     'and that check refuses an account whose suspension is set');
  ok(!!fn && /42501/.test(fn.body), 'with the permission-denied code the app already understands');
}

// 2. REALTIME AND STORAGE: the helpers most policies are built on.
for (const name of ['is_approved_user', 'is_admin', 'is_executive', 'is_head_executive', 'leads_church']) {
  const fn = lastFunction(`public.${name}`);
  ok(!!fn && /suspended_at\s+is\s+null/i.test(fn.body),
     `${name}() treats a suspended account as not approved (${fn ? fn.file : 'never defined'})`);
}
for (const [policy, table] of [['guilds_read', 'guilds'], ['guild_members_read', 'guild_members'], ['report_files_read', 'report_files']]) {
  const p = lastPolicy(policy, table);
  ok(!!p && /suspended_at\s+is\s+null/i.test(p.body),
     `the ${policy} policy asks about suspension, not only approval (${p ? p.file : 'not found'})`);
}

// 3. The gate for suspend / remove / restore says it in its own words.
{
  const fn = lastFunction('public.discipline_check');
  ok(!!fn && /suspended_at\s+is\s+not\s+null/i.test(fn.body),
     'discipline_check() refuses a suspended leader');
}

// 4. THE LIVE CONNECTION AND THE FILE STORE, which do not go through the data
//    API's door and so never meet check 1. Measured before the fix: a
//    suspended Director could still read 47 rows in 8 broadcast places,
//    safeguarding reports among them.
{
  const fn = lastFunction('private.i_am_not_suspended');
  ok(!!fn && /not\s+exists[\s\S]*suspended_at\s+is\s+not\s+null/i.test(fn.body),
     'private.i_am_not_suspended() is false for a suspended account');

  // The migration that puts the rule on every broadcast table, by looping over
  // the publication rather than naming tables -- so it cannot miss one that
  // exists when it runs.
  const loopAt = sql.findIndex(([, text]) =>
    /from\s+pg_publication_tables[\s\S]*?create\s+policy\s+a_suspended_account_sees_nothing[\s\S]*?as\s+restrictive\s+for\s+select\s+to\s+authenticated/i.test(text)
    && /i_am_not_suspended\(\)/.test(text));
  ok(loopAt !== -1, 'every table on the realtime publication gets a restrictive rule that shuts a suspended account out');

  const storage = lastPolicy('a_suspended_account_sees_nothing', 'storage\\.objects');
  ok(!!storage && /as\s+restrictive\s+for\s+all/i.test(storage.body) && /with\s+check/i.test(storage.body),
     'and the file store refuses a suspended account, reading and writing');

  // A table put on the wire AFTER that loop ran has not got the rule unless
  // the migration adding it says so.
  if (loopAt !== -1) {
    for (const [file, text] of sql.slice(loopAt + 1)) {
      for (const m of text.matchAll(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:public\.)?"?(\w+|%I)"?/gi)) {
        const table = m[1];
        const covered = table === '%I'
          ? /a_suspended_account_sees_nothing/.test(text)
          : new RegExp(`create\\s+policy\\s+a_suspended_account_sees_nothing\\s+on\\s+(public\\.)?${table}\\b[\\s\\S]*?as\\s+restrictive`, 'i').test(text);
        ok(covered, `${file} puts ${table} on the wire with the suspension rule`);
      }
    }
  }
}

// 5. THE FUNCTIONS THAT HOLD THE SERVICE ROLE KEY. They read the caller's
//    profile with a key no row rule applies to, and the data API's check never
//    sees them, so each one that acts FOR a signed-in person has to ask itself.
{
  const fnDir = 'supabase/functions';
  for (const name of fs.existsSync(fnDir) ? fs.readdirSync(fnDir) : []) {
    const file = path.join(fnDir, name, 'index.ts');
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8').replace(/\/\/[^\n]*/g, '');
    // Acting for a signed-in person = resolving the caller from their token.
    if (!/auth\.getUser\(/.test(src)) continue;
    ok(/select\([^)]*suspended_at/.test(src) && /if\s*\(\s*me\.suspended_at\s*\)\s*return[^;]*403/.test(src),
       `supabase/functions/${name} refuses a suspended caller before it does anything`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
