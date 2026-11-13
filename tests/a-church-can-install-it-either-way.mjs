// A church can install the database either way, and gets the same one.
//
// ---------------------------------------------------------------------------
// THE TWO WAYS. docs/START-HERE.md gives a church one command,
// `npx supabase db push`, which runs every migration and remembers which it
// ran, so the same command later installs only what is new. It also gives the
// manual way: every file, in order, with psql or the SQL Editor. A church
// following either -- with an AI helping or not -- must end up with the
// database the first church runs.
//
// WHAT CAN QUIETLY BREAK THAT, all found on 24 September 2026:
//
//   * THE CLI SKIPS ANY FILE NOT NAMED <digits>_name.sql. It says so in one
//     line and carries on. `0001a_fix_policy_recursion.sql` is the one such file,
//     and it is harmless ONLY because later migrations rewrote everything it
//     touched -- proven: a database built without it has the same fingerprint.
//     A new file named like it would simply never reach a church using the
//     recommended path.
//   * TWO FILES WITH ONE VERSION. The CLI records each version once; the second
//     would be refused.
//   * THE MANUAL LOOP'S ORDER. `for f in supabase/migrations/*.sql` sorts by the
//     shell's LANGUAGE setting. Under en_US.UTF-8, the default on most Linux
//     machines, `0001a_…` comes BEFORE `0001_…` (punctuation is ignored), so the
//     guide's own loop ran a fix before the thing it fixes. Byte order is the
//     only order that is the same on every machine.
//
// This file checks what can be checked by reading. The fresh-install workflow
// RUNS both ways on every push and requires identical fingerprints.
//
//   node tests/a-church-can-install-it-either-way.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));

// The one historic exception, and the reason it may stay: renaming it now would
// make every church that already used the CLI run it AGAIN, on top of the
// fifty migrations that replaced it.
const SKIPPED_BY_THE_CLI_ON_PURPOSE = new Set(['0001a_fix_policy_recursion.sql']);

// 1. Every file the CLI will read.
{
  const cliPattern = /^([0-9]+)_(.*)\.sql$/; // the Supabase CLI's own rule
  const unread = files.filter((f) => !cliPattern.test(f) && !SKIPPED_BY_THE_CLI_ON_PURPOSE.has(f));
  ok(unread.length === 0,
    `every migration is named <digits>_name.sql, so supabase db push applies it${
      unread.length ? ` (it would SKIP: ${unread.join(', ')})` : ''}`);
}

// 2. One file per version.
{
  const seen = new Map();
  const clashes = [];
  for (const f of files) {
    const m = /^([0-9]+)_/.exec(f);
    if (!m) continue;
    if (seen.has(m[1])) clashes.push(`${seen.get(m[1])} and ${f}`);
    else seen.set(m[1], f);
  }
  ok(clashes.length === 0, `no two migrations share a version${clashes.length ? ` (${clashes.join('; ')})` : ''}`);
}

// 3. New migrations are timestamped, and later names mean later times. The
//    CLI records versions as text; a short number added now (say 0050_) would
//    sort before every dated one and look, to a church's database, like
//    something from August.
{
  const numbered = files.filter((f) => /^\d{4}_/.test(f)).sort();
  const dated = files.filter((f) => /^\d{14}_/.test(f)).sort();
  const other = files.filter((f) => !/^\d{4}_/.test(f) && !/^\d{14}_/.test(f)
    && !SKIPPED_BY_THE_CLI_ON_PURPOSE.has(f));
  ok(other.length === 0,
    `every migration is either one of the original 0001-0049 or a 14-digit timestamp${
      other.length ? ` (${other.join(', ')})` : ''}`);
  const lastNumbered = numbered.at(-1) ?? '';
  ok(lastNumbered <= '0049_z', `no new short-numbered migration after 0049 (last: ${lastNumbered})`);
  const future = dated.filter((f) => Number(f.slice(0, 8)) > Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')) + 1);
  ok(future.length === 0,
    `no migration is dated in the future, where it would sort after tomorrow's real one${
      future.length ? ` (${future.join(', ')})` : ''}`);
}

// 4. Every path that runs the folder by hand runs it in BYTE order.
{
  const script = fs.readFileSync('scripts/fresh-install.sh', 'utf8');
  ok(/LC_ALL=C sort/.test(script), 'scripts/fresh-install.sh sorts the files in byte order');

  const guide = fs.readFileSync('docs/START-HERE.md', 'utf8');
  const loops = [...guide.matchAll(/for f in supabase\/migrations\/\*\.sql[\s\S]*?done/g)];
  ok(loops.length > 0, 'the guide still shows the manual loop');
  for (const m of loops) {
    const before = guide.slice(Math.max(0, m.index - 400), m.index);
    // The COMMAND, on a line of its own -- the comment explaining it mentions
    // LC_ALL=C too, and an earlier version of this check was satisfied by the
    // comment with the command deleted.
    ok(/(^|\n)\s*export LC_ALL=C[ \t]*\n/.test(before),
      'the guide\'s manual loop forces byte order first (0001_ before 0001a_, on every machine)');
    ok(/\|\|\s*\{?[^\n]*break/.test(m[0]),
      'and stops at the first file that fails, rather than carrying on past it');
  }
  ok(/npx supabase db push/.test(guide), 'the guide gives the one-command path');
}

// 5. CI runs both and compares them.
{
  const wf = fs.readFileSync('.github/workflows/fresh-install.yml', 'utf8');
  ok(/scripts\/fresh-install\.sh\s*\|/.test(wf) && /scripts\/fresh-install\.sh --via-cli/.test(wf),
    'the fresh-install workflow builds the database both ways');
  ok(/diff <\(sed -n '\/\^Fingerprint\/,\$p'/.test(wf),
    'and fails unless the two fingerprints are identical');
  ok(/supabase@\$cli_version/.test(fs.readFileSync('scripts/fresh-install.sh', 'utf8'))
     && /cli_version="\$\{SUPABASE_CLI_VERSION:-\d+\.\d+\.\d+\}"/.test(fs.readFileSync('scripts/fresh-install.sh', 'utf8')),
    'with the CLI pinned to an exact version');
}

console.log(bad === 0 ? '\nEither way in, the same database.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
