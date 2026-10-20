// A migration's text as the Postgres edition runs it. Kept apart from
// migrate.mjs, which needs the database driver, so the repository's own checks
// (tests/the-postgres-edition-installs.mjs) can run it with nothing installed.
//
// TWO LINES ARE NOT RUN, and only these two: the migrations switch on pg_cron
// and pg_net, which this edition replaces with the stand-ins in
// selfhost/sql/platform.sql. Any OTHER extension a migration asks for stops
// the install with its name, so nobody finds out from a broken screen that it
// was missing.

const STAND_INS = /create\s+extension\s+if\s+not\s+exists\s+"?(pg_cron|pg_net)"?(\s+with\s+schema\s+"?extensions"?)?\s*;/gi;
const ANY_EXTENSION = /create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_-]+)"?/gi;
const PROVIDED = new Set(['pgcrypto', 'uuid-ossp']);

/** The migration's text as this edition runs it, or an error naming what it cannot provide. */
export function prepare(sql) {
  const ran = sql.replace(STAND_INS, (_m, name) => `-- ${name}: provided by selfhost/sql/platform.sql`);
  for (const m of ran.matchAll(ANY_EXTENSION)) {
    if (!PROVIDED.has(m[1].toLowerCase())) {
      throw new Error(`asks for the extension "${m[1]}", which this edition does not provide yet.`);
    }
  }
  return ran;
}
