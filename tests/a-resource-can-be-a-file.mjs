// A resource can be a file: dragged in, kept by the church, sent, and deleted.
//
// ---------------------------------------------------------------------------
// WHY. On 25 September 2026 the owner said: "I cant even upload files in the
// resources but I can do that in the Library for all users ... files must be
// drag and drop please, and easy to share for all users ... Easy to add, easy
// to delete."
//
// The library was links only, on purpose, and the reason was cost: a start-up
// on a free plan pays for every megabyte. So this file holds the two halves of
// the answer together -- that it is EASY (a drop box, a whole card that takes a
// drop, Send and Delete on the row) and that it is SAFE and COSTED (the
// church's existing 10 MB bucket, no video, nobody able to borrow somebody
// else's file, and the file gone when its resource is).
//
// Each check below was broken on purpose and seen to go red; the ways are in
// the commit that added this file.
//
//   node tests/a-resource-can-be-a-file.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const read = (f) => fs.readFileSync(f, 'utf8');
// Comments out, so an explanation of a rule can never stand in for the rule.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '').replace(/--[^\n]*/g, '');

const MIGRATION = 'supabase/migrations/20260925100000_a_resource_can_be_a_file.sql';

// ---------------------------------------------------------------------------
// 1. THE DATABASE: A LINK OR A FILE, AND ONLY EVER YOUR OWN FILE
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(MIGRATION), `the migration is present (${MIGRATION})`);
  const sql = code(read(MIGRATION));

  ok(/constraint materials_link_or_file check \(\s*\(external_url is not null and file_path is null\)\s*or \(external_url is null and file_path is not null and file_name is not null\)/.test(sql),
    'a resource is a link or a file, never both and never neither');
  ok(/constraint materials_file_is_the_adders check \([\s\S]*?split_part\(file_path, '\/', 2\) = added_by::text/.test(sql),
    'a resource may only point at a file in the folder of whoever added it');
  ok(/file_path ~ '\^library\/\[0-9a-f-\]\{36\}\/\[\^\/\]\+\$'/.test(sql),
    'and only at one directly inside it -- no deeper path, no other folder');

  // The browser may no longer rewrite who added a resource, which church it is
  // in, or which file it points at. Without that, the check above is one
  // UPDATE away from meaningless.
  const revokeAt = sql.search(/revoke insert, update on public\.materials from authenticated;/);
  const upd = sql.match(/grant update \(([^)]*)\)\s*on public\.materials to authenticated;/);
  ok(revokeAt !== -1 && upd && sql.indexOf(upd[0]) > revokeAt,
    'the old blanket write grant is taken back before the narrow one is given');
  const updCols = (upd?.[1] ?? '').split(',').map((c) => c.trim());
  ok(upd && ['church_id', 'added_by', 'file_path', 'file_name', 'file_type', 'file_size'].every((c) => !updCols.includes(c)),
    `and nothing that says whose or which file can be changed afterwards (updatable: ${updCols.join(', ')})`);

  const policy = (name) => sql.slice(sql.indexOf(`create policy ${name}`), sql.indexOf(';', sql.indexOf(`create policy ${name}`)));
  const write = policy('library_file_write');
  ok(/for insert to authenticated/.test(write)
     && /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/.test(write)
     && /not public\.library_blocked/.test(write),
    'a file can only be uploaded into your own folder, and not by somebody stopped from sharing');
  const readP = policy('library_file_read');
  ok(/exists \(select 1 from public\.materials m where m\.file_path = objects\.name\)/.test(readP),
    'who can open a file is decided by who can read the resource that points at it');
  ok(!/manages_church|auth_role/.test(readP),
    'and leadership gets no extra reach into the files themselves');
  const drop = policy('library_file_drop');
  ok(/for delete to authenticated/.test(drop) && /manages_church/.test(drop),
    'the uploader, or the church\'s leaders, can delete a file');

  ok(/raw like 'upload:%'/.test(sql) && /A file that installs something/.test(sql),
    'the library record still names a file that installs something as harmful');
}

// ---------------------------------------------------------------------------
// 2. THE COST: THE BUCKET THE APP ALREADY HAD, AND NOTHING LEFT BEHIND
// ---------------------------------------------------------------------------
{
  const bucket = code(read('supabase/migrations/0022_conversation_attachments.sql'));
  ok(/'pairing-media',\s*'pairing-media',\s*false,\s*10485760/.test(bucket),
    'files go in the private bucket with its 10 MB limit');
  const accept = read('lib/live/attachments.ts');
  ok(!/video\//.test(accept) && !/\.mp4'/.test(accept),
    'and no video can be chosen: a video is a link, which costs the church nothing to hold');

  const data = read('lib/live/data.ts');
  ok(/export const MAX_RESOURCE_FILE = 10 \* 1024 \* 1024;/.test(data), 'the app knows the same limit');
  const add = code(data.slice(data.indexOf('export async function addMaterialFile'), data.indexOf('export async function materialFileUrl')));
  ok(add.indexOf('MAX_RESOURCE_FILE') !== -1 && add.indexOf('MAX_RESOURCE_FILE') < add.indexOf('.upload('),
    'and refuses a file over it before any of it is sent');
  const pathLine = (add.match(/const path = [^\n]*/) ?? [''])[0];
  ok(/`library\/\$\{me_id\}\/\$\{uuid\(\)\}/.test(pathLine) && !/file\.name\b(?!\.split)/.test(pathLine),
    'a file is stored under the uploader\'s id and a random name, never the name somebody typed');
  const failed = add.slice(add.indexOf('if (error) {'));
  ok(/\.remove\(\[path\]\)/.test(failed.slice(0, failed.indexOf('}'))),
    'if the resource cannot be written, the file comes back out');

  const del = code(data.slice(data.indexOf('export async function deleteMaterial'), data.indexOf('export async function', data.indexOf('export async function deleteMaterial') + 10)));
  const removeFile = del.indexOf(".remove([found.file_path])");
  const deleteRow = del.indexOf(".from('materials').delete()");
  ok(removeFile !== -1 && deleteRow !== -1 && removeFile < deleteRow,
    'deleting a resource deletes its file, first, while the resource still says whose it is');

  const url = code(data.slice(data.indexOf('export async function materialFileUrl'), data.indexOf('export async function materialFileForSharing')));
  ok(/createSignedUrl\(path, 60 \* 60/.test(url), 'a file is opened by a short-lived signed address');
  const upd = code(data.slice(data.indexOf('export async function updateMaterial'), data.indexOf('export async function', data.indexOf('export async function updateMaterial') + 10)));
  ok(/url !== undefined \? \{ external_url: url \} : \{\}/.test(upd),
    'editing a file never writes a link onto it');
}

// ---------------------------------------------------------------------------
// 3. EASY TO ADD: DRAG IT IN, OR CHOOSE IT
// ---------------------------------------------------------------------------
{
  const drop = read('components/FileDrop.tsx');
  ok(/onDrop=\{/.test(drop) && /dataTransfer\.files/.test(drop), 'the file box takes a drop');
  ok(/type="file"/.test(drop) && /accept=\{ATTACHMENT_ACCEPT\}/.test(drop),
    'and on a phone, where nothing can be dragged, it is a button that opens the picker');
  ok(/includes\('Files'\)/.test(drop), 'only files: text or a link dragged across is left alone');
  // Clearing the input before the files are read aborts the read on WebKit.
  const change = drop.slice(drop.indexOf('onChange='));
  ok(change.indexOf('onFiles(picked)') !== -1 && change.indexOf('onFiles(picked)') < change.indexOf(".value = ''"),
    'the picker is cleared only after the files are handed over');

  const lib = read('components/LiveLibrary.tsx');
  const shelf = code(lib.slice(lib.indexOf('export function LiveLibraryForGuide'), lib.indexOf('export function LiveSharedWithMe')));
  ok(/<FileDrop\b[^>]*onFiles=\{\(files\) => void addFiles\(files\)\}/.test(shelf), 'the add panel has the file box');
  const cardDrop = shelf.slice(shelf.indexOf('onDrop={(e) => {'), shelf.indexOf('onDrop={(e) => {') + 300);
  ok(/draggingFiles\(e\)/.test(cardDrop) && /void addFiles\(/.test(cardDrop),
    'and the whole card takes a drop too');
  const addFiles = shelf.slice(shelf.indexOf('const addFiles = async'), shelf.indexOf('const startEdit ='));
  ok(addFiles.indexOf('live.MAX_RESOURCE_FILE') !== -1
     && addFiles.indexOf('live.MAX_RESOURCE_FILE') < addFiles.indexOf('live.addMaterialFile('),
    'a file too big is refused by name before a slow upload, not after');
  ok(/for \(let i = 0; i < files\.length; i\+\+\)/.test(addFiles) && /state: 'failed'/.test(addFiles),
    'several files go one at a time, and one refusal does not stop the rest');
  ok(/Tap Send to share it/.test(addFiles), 'and the next step is said, not guessed');
}

// ---------------------------------------------------------------------------
// 4. EASY TO SHARE AND TO DELETE
// ---------------------------------------------------------------------------
{
  const lib = read('components/LiveLibrary.tsx');
  const item = code(lib.slice(lib.indexOf('function Item('), lib.indexOf('// The library, with sharing')));
  ok(/live\.materialFileUrl\(m\.file_path!\)/.test(item) && !/useState<string>\(.*signed/i.test(item),
    'tapping a file asks for a fresh address, never a stored one');

  const out = code(lib.slice(lib.indexOf('async function sendOutMaterial'), lib.indexOf('function siteOf')));
  ok(/shareItem\(\{ title: m\.title, text: m\.description \|\| m\.title, file \}\)/.test(out),
    '"Share outside the app" hands over the file itself, not a link to a private shelf');
  ok(/canShareFiles\(file\)/.test(out) && /await saveFile\(m\)/.test(out),
    'and where the device cannot share a file, it is saved to be attached instead');

  const shared = code(lib.slice(lib.indexOf('export function LiveSharedWithMe')));
  ok(/sendOutMaterial\(m\)/.test(shared), 'somebody who was sent a file can pass it on the same way');

  ok(/and deletes the file/.test(lib), 'deleting a file says, before the tap, that the file goes too');
  const editAt = lib.indexOf(') : editing === m.id ? (');
  const editPanel = lib.slice(editAt, lib.indexOf('void saveEdit(m)', editAt));
  ok(/\{!m\.file_path && \(/.test(editPanel) && editPanel.indexOf('{!m.file_path && (') < editPanel.indexOf('edit-url-'),
    'editing a file does not ask for a link it does not have');
}

console.log(bad === 0 ? '\nA file goes on the shelf, out to people, and off again.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
