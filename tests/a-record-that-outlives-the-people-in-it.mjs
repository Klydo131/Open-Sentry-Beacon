// The record survives the people leaving, or it is not a record.
//
// ---------------------------------------------------------------------------
// ASKED FOR AS. and.
//
// THE THING THAT MAKES THIS TABLE DIFFERENT FROM EVERY OTHER TABLE. Thirty-seven
// tables cascade off `profiles`. Deleting an account does not leave its history
// behind -- it takes the pairings, the prayer requests, the materials, the
// lessons, the meetings and the journey events with it. A record meant to
// outlive an account therefore cannot hold a foreign key to one, and the single
// most valuable check in this file is the one that says it holds none.
//
//   node tests/a-record-that-outlives-the-people-in-it.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const mine = strip(read('supabase/migrations/20260908150000_a_record_that_outlives_the_people_in_it.sql'));
const table = mine.slice(mine.indexOf('create table'), mine.indexOf(');') + 2);

// 1. IT OUTLIVES THEM
ok(/create table if not exists public\.activity_record/.test(mine), 'the record exists');
ok(!/references public\.profiles/.test(table),
   'and holds no link to a profile, so no cascade can empty it');
ok(!/references auth\.users/.test(table), 'nor to an account');
ok(/references public\.churches/.test(table),
   'only to the church, which is what it is a record of');

// 2. IT CARRIES NO PERSON
//
// The rule cannot be enforced in SQL, so what IS enforceable is checked: the
// columns are a subject and a bag of facts, and nothing here names a field
// that would invite a name into it.
ok(/subject\s+text not null/.test(table) && /facts\s+jsonb not null/.test(table),
   'a subject and its facts, and no column shaped like an identity');
for (const forbidden of ['full_name', 'email', 'phone', 'photo_path', 'body']) {
  ok(!new RegExp(`\\b${forbidden}\\b`).test(table), `no ${forbidden} column`);
}

// 3. IT IS NOT READABLE BY THE WHOLE CHURCH
//
// The audit invariant is that every table has row level security. A new table
// added without it is the easiest way to lose that, and this one holds the
// shape of everybody's participation.
ok(/alter table public\.activity_record enable row level security/.test(mine),
   'row level security is on');
const rd = mine.slice(mine.indexOf('create policy activity_record_read'));
ok(/using \(public\.manages_church\(church_id\)\)/.test(rd.slice(0, rd.indexOf(';') + 1)),
   'and only somebody who manages the church may read it');
const wr = mine.slice(mine.indexOf('create policy activity_record_write'));
ok(/with check \(public\.manages_church\(church_id\)\)/.test(wr.slice(0, wr.indexOf(';') + 1)),
   'or write to it');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
