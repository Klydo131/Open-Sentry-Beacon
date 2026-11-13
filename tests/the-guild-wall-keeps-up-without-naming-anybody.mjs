// The Guild wall updates live, and still does not say who wrote what.
//
// ---------------------------------------------------------------------------
// WHAT THIS PROTECTS. The wall is PSEUDONYMOUS. `private.list_guild_activity`
// never returns `author_id`; it computes a label -- 'You', 'A Guide', 'A fellow
// Explorer' -- and exposes amens as a count, not as `person_id`. A member reads
// the wall without learning which of the people in their guild wrote which
// post, or who agreed with it.
//
// Realtime delivers THE ROW, not a function's output. So the obvious way to
// make this room live -- a read policy on `guild_activity_posts` -- would put
// `author_id` on the wire and quietly undo all of that. It would also look
// completely correct in review: the room would update, every existing check
// would stay green, and nothing would visibly break. The regression would be
// invisible until somebody worked out they could map every post to a person.
//
// So the room is live by watching `guild_wall_pulse`, which says only that a
// wall changed. This check exists to make the wrong repair loud.
//
//   node tests/the-guild-wall-keeps-up-without-naming-anybody.mjs
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

/** The tables that carry a person and must never be subscribed to. */
const NAMES_A_PERSON = ['guild_activity_posts', 'guild_activity_amens'];

// ---------------------------------------------------------------------------
// 1. THE SET THE ROOM WATCHES
// ---------------------------------------------------------------------------
{
  const src = read('lib/live/keep-up.ts');

  const decl = /export const KEEP_UP_GUILD\s*=\s*\[([^\]]*)\]/.exec(src);
  ok(decl !== null, 'KEEP_UP_GUILD exists, so the wall has something to watch');

  const watched = decl
    ? [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    : [];

  ok(watched.length > 0, `and it names at least one table (${watched.join(', ') || 'none'})`);

  for (const forbidden of NAMES_A_PERSON) {
    ok(!watched.includes(forbidden),
       `it does not watch ${forbidden}, whose rows carry a person`);
  }

  ok(watched.includes('guild_wall_pulse'),
     'it watches guild_wall_pulse, which carries no person');
}

// ---------------------------------------------------------------------------
// 2. THE ROOM ACTUALLY SUBSCRIBES
// ---------------------------------------------------------------------------
//
// A set nobody passes to useKeepUp is the exact fault the old KEEP_UP_GUILD
// died of: it looked wired and delivered nothing.
{
  const src = read('components/LiveGuildActivity.tsx');
  ok(/useKeepUp\(\s*KEEP_UP_GUILD\s*,/.test(src),
     'the Guild Room passes KEEP_UP_GUILD to useKeepUp, rather than only declaring it');
  ok(/useKeepUp\(\s*KEEP_UP_GUILD\s*,\s*loadPosts\s*\)/.test(src),
     'and reloads the posts with it, which is the thing that was stale');
}

// ---------------------------------------------------------------------------
// 3. THE PULSE CARRIES NOTHING ABOUT A PERSON
// ---------------------------------------------------------------------------
//
// Read off the migration rather than trusted: a column added later is exactly
// how a safe table stops being safe.
{
  const dir = path.join(root, 'supabase/migrations');
  const file = fs.readdirSync(dir).find((f) => f.includes('guild_wall_keeps_up'));
  ok(Boolean(file), 'the migration that creates the pulse is in the tree');

  if (file) {
    const sql = read(`supabase/migrations/${file}`);
    const create = /create table if not exists public\.guild_wall_pulse\s*\(([\s\S]*?)\);/.exec(sql);
    ok(create !== null, 'and it creates guild_wall_pulse');

    if (create) {
      const body = create[1];
      for (const leak of ['author', 'person', 'body', 'post_id']) {
        ok(!new RegExp(`\\b${leak}`, 'i').test(body),
           `the pulse has no "${leak}" column`);
      }
      ok(/guild_id/.test(body), 'it is keyed by guild, which is all it needs to be');
    }

    ok(/private\.active_guild_member/.test(sql),
       'its read policy reuses the feed\'s own membership test rather than restating it');
  }
}

// ---------------------------------------------------------------------------
// 4. NO MIGRATION OPENS THE TWO TABLES FOR READING
// ---------------------------------------------------------------------------
//
// The whole point. A `create policy ... for select` or a `grant select` on
// either table is the regression this file exists to catch.
{
  const dir = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));

  for (const forbidden of NAMES_A_PERSON) {
    const offenders = [];
    for (const f of files) {
      const sql = read(`supabase/migrations/${f}`);
      // A select policy on the table, in either clause order.
      const policy = new RegExp(
        `create policy[\\s\\S]{0,200}?on\\s+public\\.${forbidden}[\\s\\S]{0,200}?for\\s+select`,
        'i',
      );
      // Or a plain grant to a browser role.
      const grant = new RegExp(
        `grant[^;]*select[^;]*on[^;]*public\\.${forbidden}[^;]*to[^;]*(authenticated|anon)`,
        'i',
      );
      if (policy.test(sql) || grant.test(sql)) offenders.push(f);
    }
    ok(offenders.length === 0,
       `nothing grants a browser SELECT on ${forbidden}`
       + (offenders.length ? ` (found in: ${offenders.join(', ')})` : ''));
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
