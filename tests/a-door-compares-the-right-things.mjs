// No rule in the database compares a column with itself.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Inside a subquery an unqualified column name binds to the
// NEAREST relation that has a column of that name, not to the row the rule is
// about. So
//
//     exists (select 1 from public.trial_parties tp where tp.trial_id = trial_id)
//
// reads as "a party to this hearing" and means "a party to any hearing":
// `trial_id` is tp.trial_id. It is valid SQL and nothing warns. Two live
// policies had exactly this shape (see supabase/migrations/20260923180000_a_door_
// compares_the_right_things.sql); one of them gave a voice in every hearing a
// person could see to anybody called to one.
//
// THE RULE IS EXACT, NOT A STYLE PREFERENCE. If `x.col` is valid then x has a
// column called col, so a bare `col` in the same subquery can only mean x.col
// (or something nearer still). `x.col = col` is therefore always true. SQL
// functions resolve a column before a parameter of the same name, so the same
// holds in their bodies; PL/pgSQL refuses the ambiguity outright.
//
// Checked in the LAST definition of every policy and function across all
// migrations -- the ones a fresh database actually has -- so history that has
// since been replaced does not fail the build, and a new migration that
// reintroduces the shape does.
//
//   node tests/a-door-compares-the-right-things.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

// Comments out, so an explanation OF the trap -- which quotes it -- is not a
// case of it.
const strip = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const policies = new Map(); // "table policy" -> { file, body }
const functions = new Map(); // "schema.name" -> { file, body }

for (const file of files) {
  const text = strip(fs.readFileSync(path.join(dir, file), 'utf8'));

  // In file order, so a drop after a create removes it and a create after a
  // drop brings it back -- what the database would have.
  const events = [];
  for (const m of text.matchAll(/create\s+policy\s+"?(\w+)"?\s+on\s+(?:(\w+)\.)?"?(\w+)"?[\s\S]*?;/gi)) {
    events.push({ at: m.index, kind: 'create', key: `${m[2] || 'public'}.${m[3]} ${m[1]}`, body: m[0] });
  }
  for (const m of text.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+(?:(\w+)\.)?"?(\w+)"?/gi)) {
    events.push({ at: m.index, kind: 'drop', key: `${m[2] || 'public'}.${m[3]} ${m[1]}` });
  }
  events.sort((a, b) => a.at - b.at);
  for (const e of events) {
    if (e.kind === 'drop') policies.delete(e.key);
    else policies.set(e.key, { file, body: e.body });
  }

  // Functions, to the end of their dollar-quoted body whatever its tag.
  for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:(\w+)\.)?"?(\w+)"?\s*\(/gi)) {
    const rest = text.slice(m.index);
    const open = rest.match(/\$(\w*)\$/);
    if (!open) continue;
    const start = open.index + open[0].length;
    const close = rest.indexOf(open[0], start);
    if (close === -1) continue;
    functions.set(`${m[1] || 'public'}.${m[2]}`, { file, body: rest.slice(start, close) });
  }
}

/**
 * Every `x.col = col` or `col = x.col` in a CONDITION, where x is a table or an
 * alias that the same text brings in with FROM or JOIN.
 *
 * Both limits matter. `id = v_msg.id` in a function is a column against a
 * record variable, and `set reason = excluded.reason` is an assignment; neither
 * is the trap, and a guard that cries wolf on twenty-two correct lines gets
 * switched off. Only a relation in scope can capture the bare name.
 */
const KEYWORDS = new Set(['where', 'on', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'natural',
  'group', 'order', 'limit', 'offset', 'having', 'using', 'set', 'returning', 'lateral', 'union', 'for', 'and',
  'or', 'as', 'window', 'except', 'intersect', 'into', 'values', 'select', 'with', 'then', 'else', 'end', 'loop']);
function relationsIn(sql) {
  const names = new Set();
  for (const m of sql.matchAll(/\b(?:from|join)\s+(?:only\s+)?(?:\w+\.)?"?(\w+)"?(?:\s+(?:as\s+)?(\w+))?/gi)) {
    names.add(m[1].toLowerCase());
    if (m[2] && !KEYWORDS.has(m[2].toLowerCase())) names.add(m[2].toLowerCase());
  }
  return names;
}
function selfComparisons(sql) {
  const found = [];
  const rel = relationsIn(sql);
  const lead = String.raw`(?:\bwhere|\band|\bor|\bon|\bnot|\()\s*`;
  const forward = new RegExp(`${lead}(\\w+)\\.(\\w+)\\s*=\\s*(\\w+)(?![\\w.(])`, 'gi');
  for (const m of sql.matchAll(forward)) {
    if (rel.has(m[1].toLowerCase()) && m[2].toLowerCase() === m[3].toLowerCase()) found.push(m[0]);
  }
  const backward = new RegExp(`${lead}(\\w+)\\s*=\\s*(\\w+)\\.(\\w+)(?![\\w.(])`, 'gi');
  for (const m of sql.matchAll(backward)) {
    if (rel.has(m[2].toLowerCase()) && m[1].toLowerCase() === m[3].toLowerCase()) found.push(m[0]);
  }
  return found;
}

let bad = 0;
for (const [label, map] of [['policy', policies], ['function', functions]]) {
  for (const [key, { file, body }] of map) {
    for (const hit of selfComparisons(body)) {
      bad++;
      console.log(`BAD ${label} ${key} (${file}): \`${hit.replace(/\s+/g, ' ')}\` compares a column with itself -- qualify the outer one with its table name`);
    }
  }
}

console.log(`\nlooked at ${policies.size} policies and ${functions.size} functions`);
if (policies.size < 50 || functions.size < 50) {
  // A parser that finds nothing finds no faults either.
  console.log('BAD far fewer definitions than this repository has -- the parser is not reading the migrations');
  bad++;
}
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
