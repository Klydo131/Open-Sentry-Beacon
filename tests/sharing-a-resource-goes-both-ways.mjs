// A shared resource reaches the other person, once, in the right card.
//
// ---------------------------------------------------------------------------
// REPORTED AS THREE THINGS THAT TURNED OUT TO BE ONE SCREEN AND ONE PICKER:
//
//   Guide and Explorer could not exchange resources, and an Explorer's own
//   resources appeared again under "shared with you".
//
//   With two or more Explorers, a Guide's shares did not show up and the share
//   button worked only some of the time.
//
// THE DATABASE WAS NEVER THE PROBLEM, and that was worth establishing before
// touching anything. Checked: every Explorer could read every material shared
// with them, including those whose Guide walks with two people. No Explorer
// was missing a share. The rows were being written and were readable the whole time.
//
// WHAT WAS ACTUALLY WRONG.
//
// ONE. NO SCREEN EVER READ material_shares. The card headed "Shared with you --
// from your Guide" called listMaterials(), which returns everything the caller
// may READ. For an Explorer the policy makes that their own additions PLUS
// whatever was shared into their pairings. So sharing wrote a row that nothing
// displayed, and the card showed an Explorer their OWN resources under a
// heading saying their Guide had sent them.
//
// TWO. THE SAME LIST TWICE. On the Explorer's study room the shelf card and
// that card were the same query, so both drew the identical rows under two
// headings promising different things. That is the duplicate-list report.
//
// THREE. THE PICKER CLOSED ON THE FIRST TAP. A Guide with three Explorers
// shared with one, watched the list vanish, and had to find the row again for
// the next. Tapping a name that already had it was refused by the unique index
// with "That is already shared with them". Hence a button that worked only
// some of the time.
//
//   node tests/sharing-a-resource-goes-both-ways.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const ui = strip(read('components/LiveLibrary.tsx'));
const data = strip(read('lib/live/data.ts'));

// ---------------------------------------------------------------------------
// 1. "SHARED WITH YOU" READS THE SHARES
// ---------------------------------------------------------------------------
{
  const card = ui.slice(ui.indexOf('export function LiveSharedWithMe'));
  ok(/live\.listSharedWithMe\(pairingId\)/.test(card),
     'the card reads what was actually shared with this person');
  ok(!/live\.listMaterials\(\)/.test(card),
     'and no longer everything they merely have permission to read');
  ok(/from \{s\.shared_by_name/.test(card),
     'each row says who handed it over, rather than claiming it was the Guide');
}

// ---------------------------------------------------------------------------
// 2. YOUR OWN RESOURCE IS NOT "SHARED WITH YOU"
// ---------------------------------------------------------------------------
//
// A Guide and an Explorer share into the SAME pairing row, so without this
// every share comes straight back to whoever sent it. That is the reported
// duplicate arriving from the other end.
{
  const fn = data.slice(data.indexOf('export async function listSharedWithMe'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  ok(/r\.shared_by !== me/.test(body),
     'what I shared myself is not returned to me as something shared with me');
  ok(/from\('material_shares'\)/.test(body),
     'and it reads the share table rather than the materials table');
  ok(/materials\(\*\)/.test(body), 'joining through to the resource itself');
}

// ---------------------------------------------------------------------------
// 3. THE TWO CARDS CANNOT SHOW THE SAME ROW
// ---------------------------------------------------------------------------
//
// The Explorer's study room draws both. If the shelf still listed everything
// readable, fixing the card above would have left the duplicate exactly where
// it was.
{
  ok(/live\.listSharedWithMe\(sharesShownFor\)\.catch/.test(ui),
     'the shelf asks what was handed to this person');
  ok(/g\.material\.added_by !== profile\?\.id/.test(ui),
     'and keeps rows they added themselves, which are theirs to share on');
  ok(/setItems\(shelf\.filter\(\(m\) => !mine\.has\(m\.id\)\)\)/.test(ui),
     'while dropping rows whose only claim is somebody else handing them over');

  const page = strip(read('components/live/ExplorerPage.tsx'));
  ok(/<LiveSharedWithMe \/>/.test(page) && /<LiveLibraryForGuide/.test(page),
     'the Explorer still gets both cards, which is why they must differ');
}

// ---------------------------------------------------------------------------
// 4. A GUIDE WITH SEVERAL EXPLORERS CAN GIVE IT TO EACH
// ---------------------------------------------------------------------------
{
  ok(!/void share\(m\.id, p\.id, p\.ds_name\); setSharing\(''\)/.test(ui),
     'the picker no longer closes on the first tap');
  ok(/alreadyShared\.get\(m\.id\)\?\.has\(p\.id\)/.test(ui),
     'it knows who already has each resource');
  ok(/if \(!has\) \{\s*return \(\s*<button[\s\S]{0,120}void share\(/.test(ui) && /has it · <span[^>]*>Take it back/.test(ui),
     'and a name that has it offers taking it back, never the share the unique index would refuse');
  ok(/has it/.test(ui), 'saying so in words rather than failing silently');

  // Sharing updates that map immediately, or the second tap on the same name
  // still reaches "That is already shared with them" before any reload.
  ok(/setAlreadyShared\(\(was\) => \{/.test(ui),
     'and a fresh share marks that person as having it at once');

  // The shelf must still be usable when there is nobody to share with, which
  // is every Director and every unpaired Explorer.
  ok(/if \(!pairings\.length\) return;/.test(ui),
     'a screen with no pairings does not go looking for shares');
}

// ---------------------------------------------------------------------------
// 5. NOTHING HERE WIDENS WHO MAY READ WHAT
// ---------------------------------------------------------------------------
//
// Every change is about which of two cards draws a row somebody could already
// see. The database decided that before and still does; this is the check that
// says so out loud, because "fix the library" is exactly the kind of errand
// that grows a policy change nobody asked for.
{
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'));
  const today = migrations.filter((f) => f.startsWith('202609071'));
  ok(!today.some((f) => /librar|material|share/i.test(f)),
     'no migration was needed, because the permissions were never the fault');
  // NO `|| true`. The first draft of this line had one, which makes an
  // assertion that can never fail and therefore is not one.
  ok(/shares_read/.test(read('supabase/migrations/0008_library.sql')),
     'the share policy is still the one in 0008, untouched by this change');
}

// ---------------------------------------------------------------------------
// 6. AND THE GUIDE CAN SEE IT COMING THE OTHER WAY
// ---------------------------------------------------------------------------
//
// Reported after the above shipped: (a bug report)
//
// The database was never the problem here either. `shares_create` has let
// EITHER end of a pairing share since 20260901090000, `shares_read` is
// in_pairing(pairing_id) so both ends may read what was shared into it, and the
// rows were being written. The card that draws them was mounted on the
// Explorer's screen and nowhere else.
//
// AND IT WAS WORSE THAN ABSENT, which is the part worth a check of its own.
// Check 3 above makes the shelf SUBTRACT rows somebody else handed over, so
// they appear in the card instead. On a Guide's screen that subtraction ran
// with no card to catch the result: what an Explorer shared was taken off the
// Guide's shelf and drawn nowhere. Yesterday's fix for the Explorer's duplicate
// turned a share from an Explorer from indistinguishable into invisible.
{
  const guide = strip(read('components/live/GuidePages.tsx'));
  const room = guide.slice(guide.indexOf("tab === 'resources'"));
  ok(/<LiveSharedWithMe/.test(room),
     'a Guide is shown what their Explorer handed them');
  ok(/pairingId=\{pairing\.id\}/.test(room),
     'for the person whose screen they are on, not all five at once');
  ok(room.indexOf('<LiveSharedWithMe') < room.indexOf('<LiveLibraryForGuide'),
     'above their own shelf, because what somebody sent you is the news');

  // THE TWO MUST AGREE ON SCOPE. The shelf hides what the card shows. Scope one
  // and not the other and a resource from a DIFFERENT Explorer is subtracted
  // from the shelf while no card on this screen draws it -- the same
  // disappearance, one Explorer along.
  ok(/sharesShownFor=\{pairing\.id\}/.test(room),
     'and the shelf hides exactly what the card beside it is showing');

  ok(/\(!pairingId \|\| r\.pairing_id === pairingId\)/.test(data),
     'narrowing to one relationship is done where the rows are read');
  // A Guide walks from one Explorer to the next on the same component. If the
  // shelf does not re-read when the scope changes, the second person's screen
  // hides what was subtracted for the first.
  ok(/\}, \[profile\?\.id, sharesShownFor\]\);/.test(ui),
     'and the shelf re-reads when the Guide moves to a different Explorer');

  // What the Guide has already given, without opening every row to find out.
  //
  // THIS CHECK USED TO PIN THE ONE-EXPLORER SPELLING, and pinning the spelling
  // is what made it wrong. It read
  //
  //     /\{pairings\[0\]\.ds_name\.split\(' '\)\[0\]\} has this/
  //
  // which is the chip as it was written when only a Guide with a SINGLE
  // Explorer ever saw it. The chip was fenced behind `pairings.length === 1`,
  // so a Guide at the cap of five -- the person who most needs to keep track --
  // got nothing on the row, and this check was green for the whole time that
  // was true. It asserted an expression, so it could only ever confirm that the
  // expression had not been edited.
  //
  // It asks for the BEHAVIOUR now: a row says who already has it, however many
  // Explorers there are. Removing the fence is checked properly, with the
  // wording and the privacy boundary, in
  // tests/a-guide-sees-who-already-has-it.mjs; this one stays because the two
  // cards on this screen have to keep agreeing about scope, and that is what
  // the rest of this file is about.
  ok(/has this/.test(ui) && /have this/.test(ui),
     'and a row says who already has it, for one Explorer or for five');
  ok(!/pairings\.length === 1 && \(alreadyShared\.get/.test(ui),
     'rather than only when the Guide is carrying a single person');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
