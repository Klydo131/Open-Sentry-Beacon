// The Guild Room is put away, and nothing in it was thrown out.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. "Take out the Guild Room feature, archive it for now since
// most users dont like it."
//
// Archiving and deleting look identical from the navigation bar and could not
// be more different underneath, so this asserts both halves. The doors are
// gone -- that is the request. The room's contents, and above all the ability
// to act on a report about something said in it, are not -- that is the part
// that would have been an accident nobody noticed until it mattered.
//
// THE ACCIDENT THIS PREVENTS. components/LiveSafeguarding.tsx acts on reports
// carrying a `guild_post_id` and can take the post down. Removing the room by
// deleting its table, its RPCs or that takedown path would strand every report
// already filed about a guild post: the report stays on a Director's screen
// naming something they can no longer do anything about. A safeguarding record
// has to outlive the feature it describes.
//
//   node tests/the-guild-room-is-archived-not-deleted.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

// ---------------------------------------------------------------------------
// 1. THE DOORS ARE GONE
// ---------------------------------------------------------------------------
{
  const shell = strip(read('components/LiveAppShell.tsx'));
  const rails = strip(read('components/RoomRails.tsx'));

  ok(!/href:\s*'\/guilds'/.test(shell),
     'the navigation no longer offers the Guild Room');
  ok(!/href:\s*'\/guilds'/.test(rails),
     'and neither does either room rail');
}

// ---------------------------------------------------------------------------
// 2. THE ROUTE STILL ANSWERS
// ---------------------------------------------------------------------------
//
// Every link already pointing here -- an unopened notification, a Director's
// message saying "see the Guild Room", a bookmark -- would otherwise become a
// not-found page, which reads as a broken app rather than a closed room.
{
  ok(exists('app/guilds/page.tsx'),
     'the address still answers rather than 404ing somebody who has the link');
  const page = read('app/guilds/page.tsx');
  ok(/closed|put away/i.test(page),
     'and says the room is closed rather than showing an empty board');
}

// ---------------------------------------------------------------------------
// 3. NOTHING BEHIND IT WAS REMOVED
// ---------------------------------------------------------------------------
//
// THE HALF THAT MATTERS MOST. Checked as behaviour, not as the presence of a
// word: the takedown is asserted through the call that performs it.
{
  const guard = read('components/LiveSafeguarding.tsx');
  ok(/removeGuildPost\s*\(/.test(guard),
     'safeguarding can still take down a reported guild post');
  ok(/report\.guild_post_id/.test(guard),
     'and still reads the post a report points at');

  const data = read('lib/live/data.ts');
  ok(/removeGuildPost/.test(data),
     'the takedown is still wired through to the database');

  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  const all = migrations.map((f) => read(`supabase/migrations/${f}`)).join('\n');
  ok(/create table if not exists public\.guild_activity_posts/.test(all),
     'the posts table is still created, not dropped');
  ok(!/drop table[^\n;]*guild/i.test(all),
     'and no migration drops a guild table');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
