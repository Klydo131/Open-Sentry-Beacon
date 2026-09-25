// The library nobody could add to, and the record that makes it safe to open.
//
// THE REPORT was a screenshot: "You do not have permission to do that. If that
// seems wrong, ask your Director." Nothing was wrong with anybody's
// permission. Proved against the live database and rolled back:
//
//   insert into materials (...) returning id   ->  refused, "new row violates
//                                                   row-level security policy"
//   the same insert with no returning clause   ->  allowed
//
// The app saves the row and asks for its id back in one statement, so the
// database applies the READ rule to the row it is about to hand back, and that
// rule looked the material up BY ID on a snapshot from before it existed.
//
// THIS IS THE BLOG BUG IN A SECOND PLACE. It was diagnosed wrongly twice there,
// and the whole reason it is written down in the handbook is so the next one is
// recognised. It was not, for weeks. So the check below is not only about the
// library: it refuses the shape anywhere in the data layer.
//
// The rest of this file holds the decision that came with the fix. A Guide and
// an Explorer share links freely; a Director reads a record of it afterwards
// for Guides and Explorers; an Executive Director reads it for Directors and
// sees nothing about a Guide or an Explorer; rows die at 30 days; each rank can
// stop the rank below sharing.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const sql = readFileSync('supabase/migrations/20260901090000_the_library_belongs_to_everybody.sql', 'utf8');
const data = strip(readFileSync('lib/live/data.ts', 'utf8'));
const record = strip(readFileSync('components/LiveLibraryRecord.tsx', 'utf8'));
const admin = strip(readFileSync('components/live/AdminPage.tsx', 'utf8'));
const shelf = strip(readFileSync('components/LiveLibrary.tsx', 'utf8'));
const explorer = strip(readFileSync('components/live/ExplorerPage.tsx', 'utf8'));

// ---------------------------------------------------------------------------
// 1. A read rule that a row nothing can see yet still satisfies.
// ---------------------------------------------------------------------------
{
  ok(/create policy materials_read on public\.materials[\s\S]{0,200}added_by = \(select auth\.uid\(\)\) or public\.can_read_material\(id\)/.test(sql),
     'the read rule answers the author from the row before it tries a lookup');

  // THE SHAPE, ANYWHERE. An insert that asks for its own row back only works
  // if the read rule can answer without looking the row up, and the two places
  // that got this wrong were written months apart by people who could not have
  // known about each other.
  // SEVEN OTHER TABLES ALSO INSERT AND ASK FOR THE ROW BACK, so every one of
  // their read rules was checked against the live database rather than guessed
  // at. Only two rules in the whole schema resolve a row by its own id:
  // `materials_read`, fixed above, and `profiles_read_paired` — and that one is
  // safe because `profiles_read_self` sits beside it and answers `id =
  // auth.uid()` directly. Every other rule reads the row in front of it.
  //
  // What is checked here is the property that made them safe, because it is the
  // one a future policy can quietly drop.
  const readBack = [...data.matchAll(/\.from\('([a-z_]+)'\)[\s\S]{0,900}?\.insert\([\s\S]{0,900}?\.select\(/g)]
    .map((m) => m[1]);
  ok(readBack.length > 0, `tables the app inserts into and reads back (${[...new Set(readBack)].join(', ')})`);
  ok(/create policy materials_read[\s\S]{0,200}added_by = \(select auth\.uid\(\)\) or/.test(sql),
     'materials answers the author directly BEFORE the lookup, which is the arm that saves the insert');
}

// ---------------------------------------------------------------------------
// 2. Everybody in the church may add. Blocked people may not.
// ---------------------------------------------------------------------------
{
  const create = sql.slice(sql.indexOf('create policy materials_create'), sql.indexOf('drop policy if exists shares_create'));
  ok(/'dm', 'ds', 'admin', 'executive'/.test(create),
     'an Explorer may add to the library, which they could not before');
  ok(/not public\.library_blocked\(\(select auth\.uid\(\)\)\)/.test(create),
     'and somebody who has been blocked may not');

  const share = sql.slice(sql.indexOf('create policy shares_create'));
  ok(/p\.dm_id = \(select auth\.uid\(\)\) or p\.ds_id = \(select auth\.uid\(\)\)/.test(share),
     'either person in a pairing may share into it, not only the Guide');
  ok(/not public\.library_blocked/.test(share.slice(0, 700)),
     'and a blocked person may not share either');

  ok(/<LiveLibraryForGuide/.test(explorer),
     "and an Explorer's own screen gives them the shelf to add to");
}

// ---------------------------------------------------------------------------
// 3. Each rank watches the rank below, and no further down.
// ---------------------------------------------------------------------------
// This is the half that a later change is most likely to get wrong, because
// "let leadership see everything" is always the easier line to write.
{
  const feed = sql.slice(sql.indexOf('function private.library_activity_feed'), sql.indexOf('create or replace function public.library_activity_feed'));
  ok(/me\.role = 'admin'\s+and event\.actor_role in \('dm', 'ds'\)/.test(feed),
     'a Director reads the record for Guides and Explorers');
  ok(/me\.role = 'executive' and event\.actor_role = 'admin'/.test(feed),
     'an Executive Director reads it for Directors');
  ok(!/executive.*in \('dm'/.test(feed),
     'and an Executive Director is not handed Guides and Explorers as well');
  ok(/raise exception 'Only church leadership may read the library record\.'/.test(feed),
     'nobody below leadership reads it at all');
  ok(/public\.leads_church\(event\.church_id\)/.test(feed),
     'and only for a church they actually lead');
}

// ---------------------------------------------------------------------------
// 4. Thirty days, without a scheduled job to forget.
// ---------------------------------------------------------------------------
{
  ok(/delete from public\.library_activity where occurred_at < now\(\) - interval '30 days'/.test(sql),
     'rows older than 30 days are deleted');
  const pruneCalls = (sql.match(/perform private\.prune_library_activity\(\)/g) ?? []).length;
  ok(pruneCalls >= 3,
     `and the pruning runs on write and on read rather than on a schedule (${pruneCalls} call sites)`);
  ok(/Kept for 30 days, then deleted/.test(record),
     'the screen says so, so a Director is not surprised by it');
  // THE WORDING MOVED AND THE INTENT DID NOT. This used to look for the phrase
  // "safeguarding report", which was the only way to make something outlast the
  // month when the screen had no control of its own. It has one now -- a case
  // can be opened from the row it is about -- so the assertion is on the thing
  // a Director can actually do rather than on the sentence that used to
  // describe it.
  ok(/open a case|safeguarding report/i.test(record),
     'and says what to do when something needs to outlast the month');
  ok(/openCaseFromActivity/.test(record),
     'and the way to do it is on the row, not in another room');
}

// ---------------------------------------------------------------------------
// 5. Blocking reaches down and never up, sideways, or at itself.
// ---------------------------------------------------------------------------
{
  const block = sql.slice(sql.indexOf('function private.set_library_block'));
  ok(/me\.role = 'admin' and target\.role::text in \('dm', 'ds'\)/.test(block),
     'a Director can block a Guide or an Explorer');
  ok(/me\.role = 'executive' and target\.role::text = 'admin'/.test(block),
     'an Executive Director can block a Director');
  ok(/if target\.id = me\.id then/.test(block),
     'and nobody can block themselves, because an account that can switch off its own oversight has none');
  ok(/public\.leads_church\(target\.church_id\)/.test(block),
     'only inside a church they lead');
  ok(/variant="danger"[\s\S]{0,400}Block/.test(record),
     'and the button that does it is drawn as a dangerous one');
}

// ---------------------------------------------------------------------------
// 6. The record is in front of the people who are meant to read it.
// ---------------------------------------------------------------------------
{
  ok(/<LiveLibraryRecord/.test(admin), 'the record is on the Admin screen');
  ok(/room === 'security'/.test(admin) && admin.indexOf('<LiveLibraryRecord') > admin.indexOf("room === 'security'"),
     'in the Security room, beside the audit it belongs with');
  ok(/audience=\{profile\?\.role === 'executive'/.test(admin),
     'and told which rank is reading, so the wording matches what they see');
}

// ---------------------------------------------------------------------------
// 7. A resource can be a file now, and the screen never touches storage itself.
// ---------------------------------------------------------------------------
// This section used to hold the opposite rule -- "the library holds links,
// files stay on the device" -- because a start-up on a free plan pays for
// every megabyte, and "just upload it" would otherwise arrive without anybody
// costing it. On 25 September 2026 the owner asked for exactly that: "I cant
// even upload files in the resources ... please fix that". It arrived costed:
// the bucket's existing 10 MB limit, no video, the file deleted with its
// resource. Those limits live in the data layer and the database, and are
// held by tests/a-resource-can-be-a-file.mjs. What stays here is the part that
// was always true: the screen goes through the data layer, never to storage.
{
  ok(!/storage\.from/.test(strip(readFileSync('components/LiveLibrary.tsx', 'utf8'))),
     'the library screen never talks to storage itself; the data layer does, with its limits');
  ok(!/files stay on your own device/i.test(shelf),
     'and no longer tells anybody their files cannot be kept');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
