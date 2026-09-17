// Leadership can see that somebody did something. Not what they did it with.
//
// ---------------------------------------------------------------------------
// ASKED FOR, IN THESE WORDS: "Head ED, ED, and Directors can detect the
// activities (Except for chat) of Guide and Explorer, but the Head ED, ED, and
// Directors can't see the references. ... the website can't be seen but the
// Director can see the label of the activity is not good."
//
// WHAT THIS FILE IS ACTUALLY FOR, because the obvious version of it is useless.
// A check that the SCREEN does not print an address passes on a screen that
// simply forgot to, and fails nothing on the day a different screen prints it.
// The rule has to be that the address is not THERE -- so what is asserted here
// is the absence of the column, the absence of it in every function's returned
// columns, and the absence of any migration putting it back.
//
// AND CHAT IS THE OWNER'S OWN EXCEPTION, written down so nobody quietly widens
// this later: "(Except for chat)". A leadership that can read a pastoral
// conversation has changed what the conversation is, and this record is the
// obvious place somebody would add it to.
//
//   node tests/leadership-sees-the-shape-not-the-thing.mjs
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
const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql')).sort();
const mine = files.find((f) => f.includes('leadership_sees_the_shape'));
ok(!!mine, 'the migration is present');
const sql = mine ? stripSql(read(`${dir}/${mine}`)) : '';

// ---------------------------------------------------------------------------
// 1. THE ADDRESS IS DROPPED, NOT NARROWED
// ---------------------------------------------------------------------------
//
// A column that exists and is not selected today is one that somebody selects
// next year, in a function written for a different reason, and nothing goes
// red. Dropping it means the leak cannot be reintroduced by an accident.
{
  ok(/alter table public\.library_activity\s+drop column if exists address/.test(sql),
     'the address column is dropped from the record');

  // AND NOTHING PUTS IT BACK. Every migration after this one is checked, so a
  // later hand adding `address` to this table fails here rather than shipping.
  const after = files.filter((f) => f > (mine ?? ''));
  const reinstated = after.filter((f) => {
    const src = stripSql(read(`${dir}/${f}`));
    return /alter table (public\.)?library_activity[\s\S]{0,400}?add column[^;]*address/i.test(src)
      || /create table[^;]*library_activity[\s\S]{0,800}?\baddress\b/i.test(src);
  });
  ok(reinstated.length === 0,
     `no later migration puts an address back on the record (${reinstated.join(', ') || 'none does'})`);
}

// ---------------------------------------------------------------------------
// 2. NO FUNCTION LEADERSHIP CAN CALL RETURNS ONE
// ---------------------------------------------------------------------------
{
  const feed = sql.slice(sql.indexOf('create or replace function private.library_activity_feed'));
  const signature = feed.slice(0, feed.indexOf('as $fn$'));
  ok(!/\baddress\b/.test(signature),
     'the activity feed returns no column called address');
  ok(/concern text/.test(signature) && /label text/.test(signature),
     'it returns the label instead, which is the thing that replaced it');
  ok(/host_mark text/.test(signature) && /seen_before bigint/.test(signature),
     'and a one-way mark, so "the fourth time" can be said without saying where');

  // THE PUBLIC WRAPPER MUST MATCH. Two signatures for one feed is how a column
  // gets added to one of them.
  const wrapper = sql.slice(sql.indexOf('create or replace function public.library_activity_feed'));
  ok(!/\baddress\b/.test(wrapper.slice(0, wrapper.indexOf('$$'))),
     'and neither does the public one in front of it');
}

// ---------------------------------------------------------------------------
// 3. THE LABEL IS ATTACHED BY THE DATABASE, NOT BY A SCREEN
// ---------------------------------------------------------------------------
//
// A row can be written by anything holding a session. A label applied in the
// browser is a label anybody can decline to apply, and the row would arrive
// looking exactly like an ordinary one.
{
  ok(/create or replace function private\.how_safe/.test(sql),
     'the judgement is made in the database');
  // READ FROM THE RAW SOURCE, NOT THE STRIPPED ONE, and that is not laziness.
  // The comment stripper blanks `--` to the end of the line, and `xn--` is a
  // real piece of a real rule that happens to contain two hyphens: stripped,
  // the rule vanishes and this reported a missing feature that was there. The
  // stripper can only ever produce a false FAIL, which is the safe direction
  // and still cost a round trip. String search, against what was written.
  const raw = mine ? read(`${dir}/${mine}`) : '';
  for (const flavour of ['javascript', 'xn--', 'porn', 'casino', 'bit\\.ly']) {
    ok(raw.includes(flavour), `and it knows about ${flavour.replace('\\', '')}`);
  }
  ok(/private\.record_activity\(/.test(sql)
     && (sql.match(/perform private\.record_activity\(/g) ?? []).length >= 3,
     'every way a link can arrive goes through the one labelling path');
  ok(/create trigger pocket_apps_activity/.test(sql),
     "a web app put in somebody's pocket is recorded, which nothing did before");
}

// ---------------------------------------------------------------------------
// 4. THE ALERT, AND WHO IT DOES NOT GO TO
// ---------------------------------------------------------------------------
{
  const alert = sql.slice(sql.indexOf("if verdict.concern = 'harmful' then"));
  ok(/insert into public\.notifications/.test(alert.slice(0, 900)),
     'a harmful label alerts somebody');
  ok(/role::text in \('admin', 'executive'\)/.test(alert.slice(0, 1200)),
     'and that somebody is leadership');
  ok(/leader\.id <> actor\.id/.test(alert.slice(0, 1200)),
     'never the person it is about, who is not told they are being looked at');
  ok(/verdict\.label/.test(alert.slice(0, 1200)) && !/p_url/.test(alert.slice(0, 1200)),
     'and the alert carries the label rather than the address');
}

// ---------------------------------------------------------------------------
// 5. A CASE CAN BE OPENED, THROUGH THE PATH THAT ALREADY EXISTS
// ---------------------------------------------------------------------------
{
  const opener = sql.slice(sql.indexOf('create or replace function public.open_case_from_activity'));
  ok(/return public\.report_person\(/.test(opener),
     'a case opened from the record is an ordinary report, not a second kind');
  ok(/event\.label/.test(opener) && !/event\.address/.test(opener),
     'and what it says is the label, because there is no address to say');
  ok(/event\.actor_id = me\.id/.test(opener),
     'nobody opens a case about themselves');
  ok(/role not in \('admin', 'executive'\)/.test(opener),
     'and nobody below leadership opens one from here at all');
}

// ---------------------------------------------------------------------------
// 6. CHAT IS NOT IN IT, AND THAT IS THE OWNER'S OWN EXCEPTION
// ---------------------------------------------------------------------------
{
  ok(!/\b(messages|threads|thread_messages|guide_room_messages|dm_messages)\b/.test(sql),
     'nothing in this record reads a conversation');

  const screen = stripTs(read('components/LiveLibraryRecord.tsx'));
  ok(!/\.address\b/.test(screen),
     'and the screen has no address to print either');
  ok(/concern/.test(screen) && /label/.test(screen),
     'it shows the label and how serious it is');
  ok(/openCaseFromActivity/.test(screen),
     'and offers the case from the row it is about');
}

// ---------------------------------------------------------------------------
// 7. WHAT THE APP'S OWN TYPE PROMISES
// ---------------------------------------------------------------------------
{
  const data = stripTs(read('lib/live/data.ts'));
  const type = data.slice(data.indexOf('export interface LibraryActivity'));
  const body = type.slice(0, type.indexOf('}'));
  ok(!/address/.test(body), 'LibraryActivity has no address field');
  ok(/concern:/.test(body) && /label: string/.test(body) && /seen_before/.test(body),
     'and carries the label, the seriousness and the count instead');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
