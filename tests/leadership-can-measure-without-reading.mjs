// The analysis counts what people did. It cannot read what they said.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and
// Explorer activities please."
//
// THE DANGER IN A SCREEN LIKE THIS is not that it fails to count. It is that
// "analysis" is the word under which a conversation gets read: one more column
// would answer so many questions, and every column is a small argument on its
// own. So what is held here is the shape of the answer -- counts and dates --
// rather than any particular number.
//
//   node tests/leadership-can-measure-without-reading.mjs
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

const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
const stripTs = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const dir = 'supabase/migrations';
const file = fs.readdirSync(path.join(root, dir)).find((f) => f.includes('who_is_walking'));
ok(!!file, 'the migration is present');
const sql = file ? stripSql(read(`${dir}/${file}`)) : '';

// ---------------------------------------------------------------------------
// 1. EVERY COLUMN IS A COUNT OR A DATE
// ---------------------------------------------------------------------------
{
  const signature = sql.slice(sql.indexOf('returns table ('), sql.indexOf('language plpgsql'));
  const columns = [...signature.matchAll(/^\s*(\w+)\s+(uuid|text|integer|bigint|timestamptz)/gm)]
    .map((m) => [m[1], m[2]]);
  ok(columns.length >= 14, `the analysis returns a row of figures (${columns.length} columns)`);

  // THE ONLY text COLUMNS ARE NAMES AND A ROLE. A `text` column is where a
  // sentence somebody wrote would arrive, so each one is named out loud here
  // and a new one has to be argued for in this file.
  const words = columns.filter(([, type]) => type === 'text').map(([name]) => name);
  const allowed = ['person_name', 'person_role', 'walks_with'];
  const extra = words.filter((w) => !allowed.includes(w));
  ok(extra.length === 0,
     `the only words it returns are names and a role (${extra.join(', ') || 'no others'})`);
}

// ---------------------------------------------------------------------------
// 2. IT READS NO CONVERSATION AND NO ADDRESS
// ---------------------------------------------------------------------------
{
  ok(!/\b(messages|thread_messages|report_messages|trial_statements|guide_room_messages)\b/.test(sql),
     'nothing in it reads a conversation');
  ok(!/\baddress\b/.test(sql),
     'and there is no address for it to read');
  // The study room is the sharpest case: a Guide may see THAT their Explorer
  // has been working and never what they wrote.
  ok(!/study_docs/.test(sql),
     "and it does not reach into anybody's study room");
}

// ---------------------------------------------------------------------------
// 3. WHO MAY OPEN IT
// ---------------------------------------------------------------------------
{
  ok(/role not in \('admin', 'executive'\)/.test(sql),
     'only leadership may read it');
  ok(/p\.id <> me\.id/.test(sql),
     'and nobody appears in their own analysis');
  ok(/me\.role = 'admin'\s+and p\.role::text in \('dm', 'ds'\)/.test(sql),
     'a Director reads the Guides and Explorers');
  ok(/me\.role = 'executive' and p\.role::text in \('dm', 'ds', 'admin'\)/.test(sql),
     'an Executive Director reads those and the Directors');
}

// ---------------------------------------------------------------------------
// 4. THE QUIET ROW COMES FIRST, WHICH IS THE WHOLE POINT
// ---------------------------------------------------------------------------
{
  ok(/order by/.test(sql) && /desc/.test(sql.slice(sql.indexOf('order by'))),
     'the rows arrive in an order the screen does not have to invent');
  ok(/quiet_days/.test(sql), 'and silence is a figure rather than an absence');

  const screen = stripTs(read('components/LiveActivityAnalysis.tsx'));
  ok(/Explorers with no Guide/.test(screen),
     'the screen leads with the number that means somebody is being left');
  ok(/Quiet is not a verdict/.test(screen),
     'and says out loud that a quiet row is a prompt to ask, not a fact about anybody');
  ok(/no conversation and no addresses/i.test(screen),
     'and tells the Director what it cannot see');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
