// A resource is yours until you hand it to somebody.
//
// ---------------------------------------------------------------------------
// REPORTED AS: "Why is it the resources are shared by other guides and
// Explorers, it should be contained and personal with each other, not a group
// study" -- and then, exactly: "not a group study by OTHER guides and
// explorers. If the Guide has multiple explorers, it should be private for
// those designated explorers."
//
// HALF OF IT WAS ALREADY TRUE, and saying which half is the point of the first
// two blocks below. A share belongs to ONE pairing and `shares_read` is
// `in_pairing(pairing_id)`, so a Guide walking with five people hands something
// to one of them and the other four cannot see it. Explorers never had the
// church-wide arm of `can_read_material` at all. Nothing leaked between
// Explorers, then or now.
//
// WHAT DID LEAK: every Guide and every Director could read every resource in
// the church -- another Guide's private bookmark, an Explorer's own addition.
// Not by anybody's decision. `materials.is_published` DEFAULTED TO TRUE and no
// screen in this app has ever set it, so "published to the whole church" meant
// "exists". The column was built for a decision nobody was ever asked to make.
//
// Measured before the change: twelve resources, all twelve published, eleven of
// them also shared into a pairing.
//
// THE OWNER'S TWO DECISIONS, both recorded here so a later reader does not
// mistake them for oversights:
//
//   Private by default, with leadership able to put something on the church
//   shelf deliberately. Not "no church shelf at all", which was the other
//   option offered.
//
//   The twelve already published STAY published. Nothing anybody can see today
//   disappears. So this migration writes no rows, and a check below says so.
//
//   node tests/a-resource-is-personal-until-it-is-shared.mjs
//
// Reads the migration, since this sandbox has no database of its own. The live
// effect is verified separately, by probing as a real Guide.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
const stripTs = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const MINE = 'supabase/migrations/20260908120000_a_resource_is_personal_until_it_is_shared.sql';
const dir = path.join(root, 'supabase', 'migrations');
const allSql = stripSql(
  fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'),
);
const mine = stripSql(read(MINE));

// ---------------------------------------------------------------------------
// 1. PRIVATE BY DEFAULT
// ---------------------------------------------------------------------------
{
  ok(/alter column is_published set default false/i.test(mine),
     'a new resource is not published to the church by default');

  // The default alone is a suggestion: an insert naming the column walks past
  // it. The policy is what makes it a rule on the way in.
  const create = allSql.slice(allSql.lastIndexOf('create policy materials_create'));
  const body = create.slice(0, create.indexOf(';') + 1);
  ok(/is_published = false or public\.manages_church\(church_id\)/.test(body),
     'and cannot be created published unless you manage the church');
  ok(/auth_role\(\) in \('dm', 'ds', 'admin', 'executive'\)/.test(body),
     'while everybody approved may still add one, Explorers included');
  ok(/not public\.library_blocked/.test(body),
     'and somebody blocked from the library still cannot');
}

// ---------------------------------------------------------------------------
// 2. AND NOT PROMOTABLE BY ANYBODY ELSE AFTERWARDS
// ---------------------------------------------------------------------------
//
// `materials_edit` lets whoever added a row update it, which is right for a
// title and wrong for this flag. Without the trigger the default is a
// suggestion: anybody could set it back to true on their own row and reach the
// whole church by a second route.
{
  ok(/create trigger materials_publishing_is_leaderships/.test(mine),
     'putting something on the church shelf is guarded in the database');
  ok(/before update of is_published on public\.materials/.test(mine),
     'on the column itself, so an ordinary edit pays nothing for it');

  const fn = mine.slice(mine.indexOf('only_leadership_publishes()'));
  const guard = fn.slice(0, fn.indexOf('$$;') + 3);
  ok(/new\.is_published and not coalesce\(old\.is_published, false\)/.test(guard),
     'and it refuses a PROMOTION rather than any write at all');
  ok(/not public\.manages_church\(new\.church_id\)/.test(guard),
     'from anybody who does not manage that church');
  ok(/raise exception/.test(guard), 'loudly, rather than by quietly dropping it');

  // Taking something back OFF the shelf must stay open to whoever may edit the
  // row. Undoing exposure needs no permission, and a rule that made somebody
  // ask a Director to un-publish their own mistake would be the wrong rule.
  ok(!/old\.is_published and not new\.is_published/.test(guard),
     'taking it back off the shelf is refused to nobody');
}

// ---------------------------------------------------------------------------
// 3. NOTHING ALREADY VISIBLE DISAPPEARS
// ---------------------------------------------------------------------------
//
// The owner chose this: apply the new rule going forward, leave the twelve
// existing rows where they are. A backfill would have been the tidier-looking
// option and would have taken things off screens people are using today.
{
  ok(!/update public\.materials/i.test(mine),
     'the migration rewrites no existing resource');
  ok(!/insert into/i.test(mine), 'and writes no rows at all');
  ok(!/is_published = false where/i.test(mine),
     'in particular it does not quietly un-publish what is already on the shelf');
}

// ---------------------------------------------------------------------------
// 4. WHAT WAS ALREADY TRUE, AND STAYS TRUE
// ---------------------------------------------------------------------------
//
// "If the Guide has multiple explorers, it should be private for those
// designated explorers." It is, and it was. Pinned down here because it is now
// load-bearing: with the church-wide pool closed, this is the ONLY thing
// keeping one Explorer out of another Explorer's shares.
{
  const shares = allSql.slice(allSql.lastIndexOf('create policy shares_read'));
  // Either spelling of the same rule: in_pairing(pairing_id), asked per row,
  // or pairing_id in (select private.my_pairing_ids()), asked once per request
  // (20260923200000_the_rules_ask_once, proven identical for every account).
  ok(/using \((?:public\.in_pairing\(pairing_id\)|pairing_id in \(select private\.my_pairing_ids\(\)\))\)/
       .test(shares.slice(0, shares.indexOf(';') + 1)),
     'a share is readable only inside the one pairing it was made into');
  // And the set means the same two people, while approved.
  const mine = allSql.slice(allSql.lastIndexOf('create or replace function private.my_pairing_ids'));
  const setDef = mine.slice(0, mine.indexOf('$$;', mine.indexOf('$$') + 2));
  ok(/p\.dm_id = \(select auth\.uid\(\)\) or p\.ds_id = \(select auth\.uid\(\)\)/.test(setDef)
       && /is_approved_user\(\)/.test(setDef),
     'and that set is the pairings the reader is in, while approved');

  // ANCHORED ON THE DEFINITION, NOT ON ANY MENTION. `lastIndexOf` on the bare
  // name lands on the GRANT at the bottom of the file, and the slice that
  // follows runs into whatever function is defined next -- so the check read a
  // body that was not this one, and stayed green while the real definition was
  // gutted. Caught by breaking it on purpose.
  const inPairing = allSql.slice(allSql.lastIndexOf('create or replace function public.in_pairing'));
  const def = inPairing.slice(0, inPairing.indexOf('$$;'));
  ok(/dm_id = \(select auth\.uid\(\)\) or ds_id = \(select auth\.uid\(\)\)/.test(def),
     'and that means the two people in it, nobody else');
  // Found while writing this: the current definition also requires the caller
  // to still be approved, so revoking somebody closes their side of every
  // pairing they were in. Worth pinning down rather than leaving as a detail
  // one migration deep.
  ok(/public\.is_approved_user\(\)/.test(def),
     'and only while their account is still approved');

  const canRead = allSql.slice(allSql.lastIndexOf('create or replace function public.can_read_material'));
  ok(/auth_role\(\) in \('dm','admin','executive'\)/.test(canRead.slice(0, canRead.indexOf('$$;'))),
     'the church shelf was never readable by an Explorer in the first place');
}

// ---------------------------------------------------------------------------
// 5. THE SCREEN SAYS WHICH ROWS ARE PUBLIC, AND OFFERS THE CHOICE TO ONE ROLE
// ---------------------------------------------------------------------------
{
  const ui = stripTs(read('components/LiveLibrary.tsx'));
  ok(/On the church shelf/.test(ui),
     'a row that the whole church can see says so');
  ok(/canPublish = profile\?\.role === 'admin' \|\| profile\?\.role === 'executive'/.test(ui),
     'and only leadership is offered the control');
  ok(/Put it on the church shelf/.test(ui) && /Take it off the church shelf/.test(ui),
     'both directions, in words that say what happens');

  const data = stripTs(read('lib/live/data.ts'));
  const fn = data.slice(data.indexOf('export async function setMaterialPublished'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  ok(/\.select\('id'\)/.test(body),
     'the call asks for the row back, so a refusal cannot read as success');
  ok(/data\.length === 0/.test(body) && /throw new Error/.test(body),
     'and says so when the database refused');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
