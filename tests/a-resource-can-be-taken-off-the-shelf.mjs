// A resource you added can be taken off the shelf again.
//
// WHY THIS EXISTS. The church library could be added to and shared from, and
// never tidied. A link pasted with a typo, a resource that turned out to be the
// wrong one, a video the church decided against — all of it stayed for good,
// because the only control on a row was Share. The shelf could only ever grow.
//
// This is the same shape of gap as Lesson studies: `materials_drop` has
// permitted the delete the whole time — the person who added it, or anybody who
// manages the church — and only the app was missing. Nothing reports that kind
// of gap. There is no error and no refusal, just an absent button, which is why
// it is worth a test rather than a glance.
//
//   node tests/a-resource-can-be-taken-off-the-shelf.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const data = read('lib/live/data.ts');
const ui = read('components/LiveLibrary.tsx');

// ---- The data layer ----
ok(/export async function deleteMaterial\s*\(/.test(data), 'lib/live/data.ts exports deleteMaterial');
ok(/from\('materials'\)\s*\.delete\(\)/.test(data), 'and it deletes from the materials table');

// ---- The screen offers it ----
ok(/live\.deleteMaterial\(/.test(ui), 'the library screen calls deleteMaterial');
// "Delete", on the row. It was "Remove from library" behind a "More" button;
// on 25 September 2026 the owner asked for resources that are "easy to add,
// easy to delete", and the plainest word for it is the one on every phone.
const ASK = "canManage(m) ? 'Delete' : 'Hide'";
ok(ui.includes(ASK), 'and a row offers "Delete" (or "Hide", see below)');

// ---- It asks before it does it ----
// The shelf is a dense list where the controls sit side by side, and for a
// deleter the tap cannot be undone. A single tap that destroys something is
// the wrong shape, so the first one asks.
ok(/Yes, delete it/.test(ui), 'the first tap asks rather than deleting');
ok(/Keep it/.test(ui), 'and there is a way to say no');
const askIndex = ui.indexOf(ASK);
const doIndex = ui.indexOf('Yes, delete it');
ok(askIndex !== -1 && doIndex !== -1 && doIndex < askIndex,
   'the confirmation is a separate control from the one that opens it');

// ---- Drawn as the discouraged thing it is ----
// tests/destructive-is-discouraged.mjs owns the general rule; this checks the
// specific row, because a red class is easy to lose in a refactor.
const removeProps = ui.slice(Math.max(0, ui.lastIndexOf('<button', askIndex)), askIndex);
ok(/text-red-\d{3}/.test(removeProps), 'the remove control is red');

// ---- Who it is drawn for, and what it does for each of them ----
ok(/const canManage = /.test(ui), 'the screen works out whether this person may act on one');
ok(/added_by === profile\.id/.test(ui), 'the person who added it may');
ok(/profile\.role === 'admin'/.test(ui) && /profile\.role === 'executive'/.test(ui),
   'and so may somebody who leads the church, matching materials_drop');

// The policy is the boundary, not the button. Say so in the source, so the next
// person does not mistake a hidden control for a permission check.
ok(/A convenience, not a control/.test(ui),
   'and the source says the database is what actually refuses');

// ---- And corrected, which it never could be ------------------------------
//
// `materials_edit` has been in the database since migration 0008 and NOTHING
// called it. The library could be added to and taken from and not corrected,
// so a typo in a link had one remedy: delete the entry and type it all again.
// That falls hardest on the church's starter links, which are the ones most
// likely to need fixing because nobody chose them for this congregation.
{
  const data = read('lib/live/data.ts');
  const fn = data.slice(data.indexOf('export async function updateMaterial'));
  // NOT `indexOf('\\n}')`. updateMaterial takes an object parameter whose
  // closing brace sits at the start of a line, so that finds the end of the
  // SIGNATURE and the body checked below would be empty and pass nothing.
  const body = fn.slice(0, fn.indexOf('\nexport ', 1));
  ok(body.length > 0, 'there is a way to correct a resource at all');
  ok(/\.from\('materials'\)[\s\S]{0,80}\.update\(/.test(body),
     'it updates the row rather than replacing it with a new one');
  ok(/http\?:/.test(body) || /https\?/.test(body),
     'and refuses an address with no scheme, the same as adding one does');

  // THE POLICY IT LEANS ON. Naming it here means a future change to the policy
  // has somewhere to be noticed.
  const policy = read('supabase/migrations/0008_library.sql');
  const edit = policy.slice(policy.indexOf('create policy materials_edit'));
  ok(/added_by = \(select auth\.uid\(\)\) or public\.manages_church\(church_id\)/
       .test(edit.slice(0, 260)),
     'and the policy behind it still allows the owner and whoever manages the church');
}

// ONE RULE, ONE PLACE. `canManage` decides whether Edit is drawn at all and
// which of two things Remove is about to do. Two separate predicates would
// drift from each other and from the database the first time one changed.
ok(/const canManage = /.test(ui), 'one rule answers both controls');
ok(!/const canRemove = /.test(ui), 'and not two that can disagree');
ok((ui.match(/canManage\(m\)/g) || []).length >= 2, 'which both of them ask');
ok(/startEdit\(m\)/.test(ui) && />\s*Edit\s*</.test(ui),
   'and the Edit control is on the row it corrects');

// ===========================================================================
// REMOVE IS FOR EVERYBODY, and does two different things
// ===========================================================================
//
// THE GAP THIS CLOSES. Remove was drawn only for the person who added a
// resource and for church leadership, which is exactly who `materials_drop`
// permits to DELETE. But the shelf is shared: sixteen people see the same
// rows, most of them added by somebody else, and for all of those people the
// library was a list that could only grow. There was no control at all — not a
// refused one, an absent one.
//
// So Remove is on every row now and asks the database which of two things it
// is allowed to do: delete the row (yours, or you lead the church), or take it
// off YOUR shelf and leave it on everybody else's. A Guide pressing Remove on
// the church's starter link must not take it from fifteen other people without
// knowing they had.
{
  // ---- The data layer knows the difference and says which happened ----
  ok(/export async function deleteMaterial\(id: string\): Promise<'deleted' \| 'hidden'>/.test(data),
     'deleteMaterial reports which of the two it did');
  const fn = data.slice(data.indexOf("export async function deleteMaterial("));
  const body = fn.slice(0, fn.indexOf('\nexport ', 1));
  ok(/return 'deleted'/.test(body) && /return 'hidden'/.test(body),
     'both outcomes are reachable');
  ok(/material_hides'\)\s*\.upsert\(/.test(body),
     'the second one writes a hide rather than deleting somebody else’s row');
  // Pressing Remove twice is the same wish expressed again, not an error.
  ok(/\.upsert\(/.test(body) && !/\.insert\(\{ material_id/.test(body),
     'and pressing it twice is not an error');

  // ---- The screen draws it for everybody ----
  // The whole point: the control must NOT sit behind `canManage(m) && (`.
  ok(!/\{canManage\(m\) && \(confirming/.test(ui),
     'the Remove control is not gated on being allowed to delete');
  ok(/\{confirming === m\.id \? \(/.test(ui),
     'it is drawn for every row and every role');
  ok(ui.includes(ASK) && /Yes, hide it/.test(ui),
     'and says "Hide" to somebody who cannot delete it');
  ok(/'Yes, delete it' : 'Yes, hide it'/.test(ui),
     'while whoever may delete it reads "Delete", and each confirms in its own word');

  // ---- And says which one it is about to do BEFORE the tap ----
  // The flash afterwards was not enough. By the time it is read the row is
  // already gone, and the person cannot tell whether they took it from
  // themselves or from the whole church.
  ok(/takes it out of the church library, for everybody/.test(ui),
     'the confirmation names the consequence for a deleter');
  ok(/takes it off your shelf only/.test(ui),
     'and names the different consequence for everybody else');
  ok(/from the church library\./.test(ui) && /off your shelf\./.test(ui),
     'and the message afterwards distinguishes them too');
}

// ===========================================================================
// A HIDE WITH NO WAY BACK IS A TRAP
// ===========================================================================
//
// Hiding is per-person and permanent: it survives a reload, a new device, a
// reinstall. One mis-tap on the church's starter link and that person never
// sees it again, with nothing on screen to suggest anything is missing. The
// undo has to be reachable tomorrow, not only in the seconds after the tap.
{
  ok(/export async function listHiddenMaterials/.test(data),
     'there is a way to list what you have taken off your own shelf');
  ok(/export async function restoreMaterial/.test(data), 'and a way to put it back');
  const fn = data.slice(data.indexOf('export async function restoreMaterial'));
  const body = fn.slice(0, fn.indexOf('\nexport ', 1));
  ok(/material_hides'\)[\s\S]{0,60}\.delete\(\)/.test(body),
     'which deletes the hide rather than re-adding the resource');
  ok(/\.eq\('user_id', me_id\)/.test(body),
     'and only this person’s own hide');

  ok(/live\.listHiddenMaterials\(\)/.test(ui), 'the screen loads them');
  ok(/live\.restoreMaterial\(/.test(ui), 'and offers to put one back');
  ok(/Put it back/.test(ui), 'in those words');
  // Nobody who has never hidden anything should be made to think about it.
  ok(/putAway\.length > 0 && \(/.test(ui),
     'and the whole section is absent until there is something in it');

  // ---- The rows are this person’s and nobody else’s ----
  const dir = 'supabase/migrations';
  const file = fs.readdirSync(path.join(root, dir))
    .filter((f) => f.includes('a_shelf_of_your_own')).sort().pop();
  ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
  const sql = file ? read(`${dir}/${file}`) : '';
  ok(/create table if not exists public\.material_hides/.test(sql), 'material_hides exists');
  ok(/enable row level security/.test(sql), 'with RLS on');
  // Every policy on it is scoped to the caller. A hide readable by others
  // would leak what somebody chose not to look at, which is nobody's business.
  const policies = sql.match(/create policy[\s\S]*?;/g) || [];
  ok(policies.length >= 3, 'read, write and drop are all policed');
  ok(policies.every((p) => /user_id = \(select auth\.uid\(\)\)/.test(p)),
     'and every one of them is scoped to the person asking');
}

// ===========================================================================
// SHARING OUTSIDE THE APP
// ===========================================================================
//
// The buttons on a row hand a resource to somebody the church has already
// paired you with. That is not who most links are for: a mother, a neighbour,
// a group chat — none of whom have accounts, and all of whom were unreachable.
//
// The library holds LINKS, so this costs nothing: the address goes to the
// phone's own share sheet, and where there is no share sheet it is copied and
// the person is TOLD it was copied. A button that silently did nothing is the
// exact failure lib/share.ts was written to have fixed once.
{
  ok(/from '@\/lib\/share'/.test(ui), 'the library screen uses the shared share helper');
  ok(!/navigator\.share\(/.test(ui) && !/navigator\.clipboard/.test(ui),
     'and does not hand-roll the share sheet or the clipboard again');
  ok(/Share outside the app/.test(ui), 'a row offers to share outside the app');
  ok(/url: m\.external_url/.test(ui), 'passing the address, which is the whole resource');

  // Every outcome shareItem can return has something to say. 'cancelled' is
  // deliberately silent — the person chose to stop and does not need telling.
  ok(/=== 'shared'/.test(ui) && /=== 'copied'/.test(ui) && /=== 'cancelled'/.test(ui),
     'and every outcome the helper can return is answered');
  ok(/copied\. Paste it wherever you like/.test(ui),
     'including the desktop case, where the address is copied instead');

  // BOTH CARDS. An Explorer with no Guide yet sees only "Shared with you" —
  // the shelf above it is drawn beside a pairing and there is not one. Leave
  // the control off that card and the one person the church has not paired is
  // the one person who cannot pass anything on.
  ok((ui.match(/<SendOut onSend=/g) || []).length >= 2,
     'and it is on the Explorer’s card as well as the shelf');
  const shared = ui.slice(ui.indexOf('export function LiveSharedWithMe'));
  ok(/<SendOut onSend=/.test(shared), 'specifically inside LiveSharedWithMe');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
