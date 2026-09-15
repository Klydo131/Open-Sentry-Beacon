// Taking the door away must not take the room away.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. "Take out the cases in both Guide and Explorer, rebrand it
// and put it on settings and make a sub room called 'Admin Reports'."
//
// The door was the problem: a Guide or an Explorer had a scales-of-justice link
// in their sidebar at all times, on every screen, when almost none of them will
// ever be party to a proceeding. It reads as an accusation waiting to happen.
//
// THE HALF THAT IS EASY TO LOSE WITH IT, and which app/cases/page.tsx has said
// in a comment since the day it was written: an Explorer called into a case is
// the person in it with the LEAST standing. Their answer has to be reachable
// without anybody having to tell them where to look, and they can post even
// while suspended, because suspending somebody pending a hearing must not take
// away their side of it.
//
// Deleting a navigation entry is one line. Deleting a navigation entry and
// leaving the people a case is about with no way in is the same one line. The
// two are indistinguishable in a diff, which is exactly why this exists.
//
//   node tests/a-case-is-reachable-by-whoever-is-in-it.mjs
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

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const shell = strip(read('components/LiveAppShell.tsx'));
const rails = strip(read('components/RoomRails.tsx'));
const settings = strip(read('components/LiveAccountPages.tsx'));
const page = strip(read('app/cases/page.tsx'));

// ---------------------------------------------------------------------------
// 1. THE DOOR IS GONE FROM A GUIDE AND AN EXPLORER
// ---------------------------------------------------------------------------
{
  // Leadership may keep it; nobody else. Asserted by requiring the nav entry to
  // sit behind a role test naming admin or executive, rather than by counting
  // occurrences -- a count passes the day somebody adds it back somewhere else.
  const entry = /\.\.\.\(role === 'admin' \|\| role === 'executive'[\s\S]{0,200}?href: '\/cases'/.test(shell);
  ok(entry, 'the header offers Admin Reports to leadership only');

  // MATCHED AT THE START OF A LINE, because the gated entry above legitimately
  // contains the same characters -- `? [{ href: '/cases'` -- and forbidding the
  // substring outright failed the very arrangement it is meant to require. An
  // UNCONDITIONAL entry is one that opens its own line in the list; a gated one
  // is preceded by the spread and the ternary.
  ok(!/^\s*\{ href: '\/cases'/m.test(shell),
     'and not as a plain entry every role gets');

  // The rails: leadership's list may hold it, the member lists may not. The two
  // member lists are the ones inside a `role === 'ds'` or `role === 'dm'` block.
  for (const who of ['ds', 'dm']) {
    const block = new RegExp(`if \\(role === '${who}'\\)[\\s\\S]*?\\n  \\}`).exec(rails);
    ok(!!block, `the ${who} rail block can be found`);
    ok(block ? !/\bcases,/.test(block[0]) : false,
       `${who === 'ds' ? 'an Explorer' : 'a Guide'} has no Admin Reports entry in their rail`);
  }
}

// ---------------------------------------------------------------------------
// 2. THE ROOM IS STILL REACHABLE BY THE PEOPLE A CASE IS ABOUT
// ---------------------------------------------------------------------------
//
// THE ONE THAT MATTERS.
{
  const line = settings.split('\n').find((l) => /id: 'reports'/.test(l)) ?? '';
  ok(/id: 'reports'/.test(line) && !/\?|&&|leads|role/.test(line),
     'Settings offers an Admin Reports folder with no role test on it');

  ok(/room === 'reports'/.test(settings) && /<LiveCourt/.test(settings),
     'and that folder actually draws the courtroom, not a placeholder');

  // The route must still admit everybody: a notification about a case links
  // straight to /cases, and narrowing the page would refuse the person it is
  // about even though Settings offered them the folder.
  ok(/const ALL: Role\[\] = \['executive', 'admin', 'dm', 'ds'\]/.test(page),
     'and /cases itself still admits every role, so a notification link works');
}

// ---------------------------------------------------------------------------
// 3. IT IS CALLED THE SAME THING EVERYWHERE
// ---------------------------------------------------------------------------
//
// Somebody told "open Admin Reports" who finds a room called Cases has been
// given a wrong instruction, which is its own small failure.
{
  ok(/Admin Reports/.test(page), 'the room calls itself Admin Reports');
  ok(!/⚖️ Cases</.test(page), 'and not Cases any more');
  ok(/label: 'Admin Reports'/.test(rails), 'the rail calls it that too');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
