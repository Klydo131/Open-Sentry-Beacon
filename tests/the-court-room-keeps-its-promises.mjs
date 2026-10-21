// The court room keeps its promises: the door, the room, the record, the
// exhibits, and the screens that draw them.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: a court room for Directors and Executive
// Directors with one of the highest securities in the app at its door, digital
// forensic and exhibit tools, simple with simple advanced settings, and that
// looks like a court room.
//
// TWO HALVES, BECAUSE EACH CAN FAIL WITHOUT THE OTHER NOTICING.
//   * The database's rules are proven as invented people, against a database
//     built from nothing, by supabase/tests/the-court-room-holds.sql (run by
//     scripts/fresh-install.sh in CI). This file checks that proof is wired in
//     and that the migration still says what it proved.
//   * The forensic code runs here for real (tests/fixtures/the-court-room-
//     keeps-its-promises.ts): fingerprints, file types, picture details from
//     hostile files, the chain recomputed and broken on purpose.
// And the screens: a database without the update still gets the room it had.
//
//   node tests/the-court-room-keeps-its-promises.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const sqlCode = (p) => read(p).replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** One function's body from the migration, comments removed. */
const MIGRATION = 'supabase/migrations/20261020160000_the_court_room.sql';
const sql = sqlCode(MIGRATION);
function fn(name) {
  const at = sql.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const opening = /\bas\s+(\$[a-z_]*\$)/g;
  opening.lastIndex = at;
  const hit = opening.exec(sql);
  if (!hit) return '';
  const start = hit.index + hit[0].length;
  return sql.slice(start, sql.indexOf(`${hit[1]};`, start));
}

// ---------------------------------------------------------------------------
// 1. THE FORENSIC CODE, RUN
// ---------------------------------------------------------------------------
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-court-promises-'));
  const outfile = path.join(out, 'court.mjs');
  await build({
    entryPoints: [path.join(root, 'tests/fixtures/the-court-room-keeps-its-promises.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'es2020',
    alias: { '@': root }, outfile, logLevel: 'error',
  });
  const stdout = execFileSync(process.execPath, [outfile], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  const r = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() ?? '{}');
  if (r.threw) console.log(`the fixture threw: ${r.threw}`);

  ok(r.sha256Known && r.sha256Bytes, 'a fingerprint is SHA-256 as every other tool computes it, of text and of bytes');
  ok(JSON.stringify(r.sniffs) === JSON.stringify([
    'image/jpeg', 'image/png', 'application/pdf', 'text/html', 'image/svg+xml',
    'application/x-msdownload', 'video/quicktime', 'image/heic', 'text/plain']),
  `what a file really is comes from its bytes, not its name (${JSON.stringify(r.sniffs)})`);
  ok(JSON.stringify(r.runs) === '[true,true,true]', 'a web page, an SVG and a program are each known to run');
  ok(r.honest, 'a photo called a photo is agreed with');
  ok(r.disguisedRefused, 'a web page called photo.jpg is found, and not kept as an exhibit');
  ok(r.programRefused, 'a program called notes.txt is found, and not kept');
  ok(r.renamedFound, 'a photo called scan.pdf is found, and kept as the photo it is');
  ok(JSON.stringify(r.showAs) === JSON.stringify(['image', 'save', 'save', 'save', 'video', 'text', 'save']),
    `only pictures, sound, video and plain text are shown inside the app; SVG and web pages never (${JSON.stringify(r.showAs)})`);
  const p = r.picture ?? {};
  ok(p.make === 'FixtureCam' && p.model === 'Z9 Mark II' && p.taken === '2026:09:30 18:05:00',
    'a photo says which camera took it, and when');
  ok(p.hasLocation === true && p.latitude === -33.866667 && p.longitude === -151.21,
    `and where, south and west read as negative (${p.latitude}, ${p.longitude})`);
  ok(r.pngSize?.width === 256 && r.pngSize?.height === 200 && r.pngSize?.hasLocation === false, 'a PNG says its size');
  ok(r.hostileFilesDoNotThrow, 'a cut-short, scrambled or empty file reads as nothing rather than breaking the screen');
  ok(r.genesis, 'the record\'s first link is tied to its own case');
  ok(r.chainHolds, 'a chain built as the database builds it holds when recomputed here');
  ok(r.tamperFoundAt === 2, `a changed entry is found where it was changed (${r.tamperFoundAt})`);
  ok(r.removalFound, 'a removed entry is found');
  ok(r.otherCase, 'and a chain moved onto another case does not hold there');
  ok(r.savedHasEverything, 'a saved copy carries every fingerprint and how to check them with ordinary tools');
}

// ---------------------------------------------------------------------------
// 2. THE MIGRATION SAYS WHAT WAS PROVEN
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(path.join(root, MIGRATION)), 'the court room migration is present');
  const pass = fn('private.court_pass_until');
  ok(/leader and coalesce\(claims ->> 'aal', ''\) <> 'aal2'/.test(pass),
    'the door asks leadership for a finished two-step sign-in');
  ok(/not leader or e ->> 'method' = 'totp'/.test(pass), 'and for a code, not a password');
  ok(/make_interval\(mins => private\.court_pass_minutes\(\)\)/.test(pass) && /select 30/.test(fn('private.court_pass_minutes')),
    'and the pass lasts 30 minutes from the proof');

  ok(/revoke insert, update, delete on public\.trial_statements from anon, authenticated;\s*grant insert \(trial_id, author_id, body\) on public\.trial_statements to authenticated;/.test(sql),
    'a statement\'s time and fingerprint are the server\'s: callers may name only the case, themselves and their words');
  const stamp = fn('private.court_statement_stamp');
  ok(/new\.created_at\s*:= clock_timestamp\(\)/.test(stamp) && /new\.body_sha256 := private\.court_sha256\(new\.body\)/.test(stamp),
    'and the server stamps both');
  ok(!/create policy [a-z_]+ on public\.(court_record|court_exhibits|trial_statements)\s+for (update|delete)/.test(sql),
    'nothing in the court room can be changed or removed by a policy');
  ok(/revoke insert, update, delete on public\.court_record from anon, authenticated;/.test(sql)
    && /revoke insert, update, delete on public\.court_exhibits from anon, authenticated;/.test(sql),
    'and nobody signed in holds a grant to write the record or the exhibits directly');
  ok(/using \(private\.court_door_open\(\) and private\.court_on_the_bench\(trial_id\)\)/.test(sql),
    'the full record is the bench\'s to read');
  ok(/create policy trial_statements_read on public\.trial_statements\s+for select to authenticated\s+using \(private\.court_in_the_room\(trial_id\)\)/.test(sql),
    'what was said is read from a place in the room, not from being entitled to watch');

  for (const [col, fk] of [['author_id', 'trial_statements_author_id_fkey'], ['opened_by', 'trials_opened_by_fkey'], ['head_judge_id', 'trials_head_judge_id_fkey']]) {
    ok(new RegExp(`constraint ${fk}\\s+foreign key \\(${col}\\) references public\\.profiles\\(id\\) on delete set null`).test(sql),
      `the record outlives the account: ${col} is set to nothing, not cascaded`);
  }
  ok(/create table if not exists public\.court_record \([\s\S]*?\);/.test(sql)
    && !/references public\.profiles/.test(sql.match(/create table if not exists public\.court_record \([\s\S]*?\);/)?.[0] ?? 'references public.profiles'),
    'and the record itself holds no link to an account at all');

  const open = fn('public.open_trial');
  ok(/values \(subject\.church_id, me\.id, me\.id/.test(open), 'a case is placed in the church of the person it is about');
  ok(/other_\.church_id is distinct from subject\.church_id/.test(open), 'the other side must be of that church');
  ok(/rp\.church_id = subject\.church_id\s+and rp\.subject_id = p_subject/.test(open), 'and a linked report must be that church\'s report about that person');
  ok(/person\.church_id is distinct from t\.church_id/.test(fn('public.court_summon')), 'a witness must be of the case\'s church');

  const bucket = sql.match(/insert into storage\.buckets[\s\S]*?on conflict/)?.[0] ?? '';
  ok(/'court-exhibits',\s*'court-exhibits',\s*false/.test(bucket), 'exhibits sit in a private bucket');
  ok(!/text\/html|svg|javascript/.test(bucket), 'which refuses anything a browser would run');
  ok(!/create policy [a-z_]+ on storage\.objects\s+for (update|delete)[\s\S]{0,120}court-exhibits/.test(sql),
    'and has no rule that lets a file be replaced or removed');

  // The chain's text, in the same order in the database, in the browser and in the guide.
  const append = fn('private.court_append');
  const order = ['v_prev', 'v_seq::text', 'v_us::text', "coalesce(v_actor::text, '')", 'v_name', 'p_act', "coalesce(p_about, '')", "coalesce(p_detail, '')"];
  let at = append.indexOf('v_hash := encode(extensions.digest(');
  ok(at > 0 && order.every((part) => { const n = append.indexOf(part, at); if (n < 0) return false; at = n; return true; }),
    'the database hashes previous, position, time, actor id, actor name, act, about, detail, in that order');
  ok(/\[prev, String\(e\.seq\), String\(e\.at_us\), e\.actor_id \?\? '', e\.actor_name, e\.act, e\.about, e\.detail\]\.join\('\\n'\)/.test(code('lib/court/forensics.ts')),
    'and the browser recomputes the same eight, joined the same way');
  ok(/previous hash, position, time in',\s+'microseconds, actor id \(or nothing\), actor name, act, about, detail/.test(read('lib/court/record-text.ts')),
    'and a saved copy tells its reader the same order');
  const install = read('scripts/fresh-install.sh');
  ok(/supabase\/tests\/the-court-room-holds\.sql/.test(install), 'the behaviour proof runs on every fresh install, in CI');
  const proof = read('supabase/tests/the-court-room-holds.sql');
  ok(/if total < 60 then raise exception/.test(proof), 'and refuses to pass if most of its checks did not run');
}

// ---------------------------------------------------------------------------
// 3. THE SCREENS
// ---------------------------------------------------------------------------
{
  const page = code('app/cases/page.tsx');
  ok(/<LiveCourtRoom me=\{profile\}/.test(page), 'the Admin Reports page is the court room');
  ok(/const ALL: Role\[\] = \['executive', 'admin', 'dm', 'ds'\]/.test(page), 'and still admits every role, so the person a case is about can answer it');

  const room = code('components/court/CourtRoom.tsx');
  ok(/edition === 'cases'[\s\S]{0,900}<LiveHallOfJustice me=\{me\} \/>[\s\S]{0,80}<LiveCourt me=\{me\}/.test(room),
    'a church database without the update still gets the room it had');
  ok(/if \(!door\.open\) return <CourtDoorPanel/.test(room), 'a shut door draws the door, and nothing behind it');
  ok(/isCourtLocked\(cause\)\) \{ lock\(\)/.test(room) && /minutesLeft\(door\.until\) <= 0\) lock\(\)/.test(room),
    'a pass running out, or any call answering locked, shuts the door on screen');

  const pointer = code('components/court/CourtOrCases.tsx');
  ok(/edition === 'cases'/.test(pointer) && /href="\/cases"/.test(pointer), 'Safeguarding and Settings point at the court room once it exists');
  ok(/<CourtOrCases me=\{profile\} hall \/>/.test(code('components/live/AdminPage.tsx')), 'from the Admin room');
  ok(/<CourtOrCases\s+me=\{profile\}/.test(code('components/LiveAccountPages.tsx')), 'and from Settings');

  const door = code('lib/live/court-door.ts');
  const saved = door.indexOf('saveBrowserSession(payload.session)');
  ok(saved > 0 && door.indexOf('payload.second_step ||') > 0 && door.indexOf('payload.second_step ||') < saved,
    'a password never replaces a stronger session with a half-finished one');
  ok(/end\(before\.access_token\)/.test(door), 'and the session a password replaced is ended, so the phone holds one');

  const panel = code('components/court/CourtDoorPanel.tsx');
  const passwordWords = panel.slice(panel.indexOf("'To come in, type your password again"), panel.indexOf("'To come in, type your password again") + 200);
  ok(passwordWords.length > 0 && !/Executive/.test(passwordWords), 'what a member is told at the door names no Executive Director');

  // Read as written: the comment stripper would take `accept="image/*,..."`
  // for the start of a comment and swallow the code after it.
  const ex = read('components/court/Exhibits.tsx');
  ok(/as === 'image' \|\| as === 'audio' \|\| as === 'video'\) url = URL\.createObjectURL\(typed\)/.test(ex),
    'only pictures, sound and video are ever given an address in the app');
  ok(/type: as === 'save' \? 'application\/octet-stream'/.test(ex), 'anything else is handed over as plain bytes, never shown');
  ok(/!onBench \? 'Recorded in the picture \(shown to the bench only\)'/.test(ex), 'where a photo was taken is the bench\'s');
  ok(/courtExhibitHandled\(exhibit\.id, matches \? 'matched' : 'differed'\)/.test(ex), 'and every opening re-checks the fingerprint, on the record');

  const hearing = code('components/court/Hearing.tsx');
  // Since 21 October 2026 the gallery is drawn once, in the live room, not in
  // a panel of its own as well; the same rule holds there.
  const stage = code('components/court/CourtStage.tsx');
  ok(!/ct-gallery/.test(hearing)
    && /const bench = c\.my_place === 'judge' \|\| c\.my_place === 'opener' \|\| c\.my_place === 'observer';/.test(stage)
    && /\{bench && gallery\.length > 0 && \(/.test(stage),
    'the gallery is drawn for the bench only');
  // The judge's tools moved from behind Advanced settings to the judge's own
  // desk (asked for on 21 October 2026: "the best available tools for all
  // users"); the tools for examining evidence still wait behind it.
  ok(/\{c\.may_decide && \(/.test(hearing)
    && /c\.status === 'open' && c\.may_decide \? 'judge'/.test(hearing)
    && /\{desk === 'judge' && <JudgeTools/.test(hearing)
    && /\{advanced \? \(\s*<ForensicTools/.test(hearing),
    'deciding and the judge\'s tools are the judge\'s alone, and the tools for examining evidence wait behind Advanced settings');
  ok(fs.existsSync(path.join(root, 'docs/COURT-ROOM.md')), 'the developers\' guide is written');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
