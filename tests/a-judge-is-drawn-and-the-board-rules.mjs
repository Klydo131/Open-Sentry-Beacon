// A judge is drawn, the hearing ends with a recommendation, the Church Board
// rules, and the room shows who is in it.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: "The judge will be random picked by the Church
// Directors base on the case, the final ruling will be outside of the Court
// and will be presented by the Church Board, they will be the people who will
// have the final words to say." "I want the UI to be some kind of a game
// avatar for live session court." And Admin Reports is no longer beta.
//
// TWO HALVES, as for the court room itself.
//   * The rules are proven as invented people, from nothing, on the Supabase
//     image and on plain Postgres, by supabase/tests/a-judge-is-drawn-and-the-
//     board-rules.sql (scripts/fresh-install.sh, in CI). This file checks it is
//     wired in, and that the newest definition of each rule still says what
//     was proven.
//   * The draw is worked out here, in Node, independently, and the browser's
//     own check (lib/court/forensics.ts, checkDraw) must agree with it, and
//     must find a draw that was changed.
//
//   node tests/a-judge-is-drawn-and-the-board-rules.mjs
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const sqlCode = (text) => text.replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const MIGRATION = 'supabase/migrations/20261020200000_a_judge_is_drawn_and_the_church_board_rules.sql';
const migDir = 'supabase/migrations';
const migrations = fs.readdirSync(path.join(root, migDir)).filter((f) => f.endsWith('.sql')).sort();

/** The newest definition of a function across every migration, comments removed. */
function latest(name) {
  for (const file of [...migrations].reverse()) {
    const sql = sqlCode(read(`${migDir}/${file}`));
    const at = sql.indexOf(`create or replace function ${name}(`);
    if (at < 0) continue;
    const opening = /\bas\s+(\$[a-z_]*\$)/g;
    opening.lastIndex = at;
    const hit = opening.exec(sql);
    if (!hit) return { file, body: '' };
    const start = hit.index + hit[0].length;
    return { file, body: sql.slice(start, sql.indexOf(`${hit[1]};`, start)) };
  }
  return { file: '', body: '' };
}

// ---------------------------------------------------------------------------
// 1. THE PROOF IS WIRED IN
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(path.join(root, MIGRATION)), 'the migration is present');
  ok(/-f "\$here\/supabase\/tests\/a-judge-is-drawn-and-the-board-rules\.sql"/.test(read('scripts/fresh-install.sh')),
    'a fresh install runs the proof, on the Supabase image and on plain Postgres');
  const proof = read('supabase/tests/a-judge-is-drawn-and-the-board-rules.sql');
  ok(/if total < 40 then raise exception/.test(proof) && /\nrollback;\s*$/.test(proof),
    'the proof needs at least 40 checks and changes nothing it leaves behind');
}

// ---------------------------------------------------------------------------
// 2. THE DRAW
// ---------------------------------------------------------------------------
{
  const open = latest('public.open_trial').body;
  ok(/values \(subject\.church_id, me\.id, null, p_report/.test(open) && /private\.court_draw_judge\(t_id\)/.test(open),
    `opening a case seats nobody; its judge is drawn (${latest('public.open_trial').file})`);
  const pool = latest('private.court_judge_pool').body;
  ok(/auth\.mfa_factors[\s\S]*?status::text = 'verified'/.test(pool), 'only leaders who can open the door are free to judge');
  ok(/tp\.part in \('accused', 'reporter', 'witness'\)/.test(pool) && /p\.id is distinct from t\.subject_id/.test(pool),
    'never the person it is about, nor anybody called to it');
  ok(/act = 'judge_stepped_down'/.test(pool), 'nor a leader who stepped down from it');
  ok(/p\.role = 'executive'/.test(pool) && /about_lead/.test(pool), 'a case about a leader is drawn from Executive Directors');
  const draw = latest('private.court_draw_judge').body;
  ok(/x is distinct from t\.opened_by/.test(draw) && /nobody else was free/i.test(draw),
    'never the one who brought it, unless nobody else is free, and then the record says so');
  ok(/'Hope Beacon judge draw' \|\| chr\(10\) \|\| p_trial::text \|\| chr\(10\) \|\| head/.test(draw)
    && /substr\(seed, 1, 12\)/.test(draw) && /% n/.test(draw),
    'the draw is the SHA-256 of the case and the record before it, which nobody can choose');
  ok(/'drawn=' \|\| pick::text \|\| ';from=' \|\| array_to_string\(pool, ','\)/.test(draw),
    'and who was drawn, from whom, is written on the record');
}

// The browser's check, run here against a draw worked out independently.
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-draw-'));
  const outfile = path.join(out, 'forensics.mjs');
  await build({
    entryPoints: [path.join(root, 'lib/court/forensics.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'es2020', outfile, logLevel: 'error',
  });
  const { checkDraw } = await import(pathToFileURL(outfile).href);
  const trial = crypto.randomUUID();
  const pool = Array.from({ length: 7 }, () => crypto.randomUUID()).sort();
  const prev = crypto.randomBytes(32).toString('hex');
  const seed = crypto.createHash('sha256').update(`Hope Beacon judge draw\n${trial}\n${prev}`).digest('hex');
  const drawn = pool[parseInt(seed.slice(0, 12), 16) % pool.length];
  const entry = (about, prevHash = prev) => ({
    seq: 3, at: '', at_us: 0, actor_id: null, actor_name: '', act: 'judge_drawn',
    about, detail: '', prev_hash: prevHash, hash: '',
  });
  const fair = await checkDraw(trial, entry(`drawn=${drawn};from=${pool.join(',')}`));
  ok(fair.holds && fair.from === 7, 'the browser works a draw out the same way the database draws it');
  const other = pool.find((x) => x !== drawn);
  ok(!(await checkDraw(trial, entry(`drawn=${other};from=${pool.join(',')}`))).holds,
    'a record naming somebody else as drawn is found');
  ok(!(await checkDraw(trial, entry(`drawn=${drawn};from=${[...pool].reverse().join(',')}`))).holds,
    'and so is a pool written in another order');
  fs.rmSync(out, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 3. THE HEARING ENDS; THE CHURCH BOARD RULES
// ---------------------------------------------------------------------------
{
  const close = latest('public.court_close_hearing').body;
  ok(/status = 'with_board'/.test(close) && /'hearing_closed'/.test(close),
    'the judge ends the hearing, which seals the record and sends the case to the Church Board');
  ok(!/suspend_member|remove_member_by_leader/.test(close), 'and ending the hearing touches nobody\'s account');
  const old = latest('public.close_trial').body;
  ok(!/suspend_member|remove_member_by_leader|update public\.trials/.test(old) && /Church Board/.test(old),
    'the old way of ending a case decides nothing, and says why');
  const ruling = latest('public.court_record_ruling').body;
  ok(/if p_carry_out and p_ruling = 'suspended' then/.test(ruling) && /elsif p_carry_out and p_ruling = 'removed' then/.test(ruling),
    'a ruling is carried out only when the one writing it down asks');
  ok(ruling.indexOf("public.discipline_check(t.subject_id)") > -1
    && ruling.indexOf("public.discipline_check(t.subject_id)") < ruling.indexOf("court_append(p_trial, 'ruling'"),
    'and only if the usual rules let them, asked before anything is written');
  ok(/place = 'judge' or \(place in \('opener', 'observer'\) and private\.may_sit_on_trial\(p_trial\)\)/.test(ruling),
    'it is written down by the judge or a leader who sat on the case, never by somebody called to it');
  ok(/'The Church Board''s ruling is already written down\.'/.test(ruling), 'once');
  ok(/'ruling_holds'/.test(latest('public.court_check_record').body), 'and the record checks the ruling against its fingerprint');
  ok(/'recommendation', case when bench then t\.recommendation else null end/.test(latest('public.court_case').body),
    'the judge\'s recommendation is for the bench');
}

// ---------------------------------------------------------------------------
// 4. THE LIVE ROOM
// ---------------------------------------------------------------------------
{
  const here = latest('public.court_here').body;
  ok(/court_require_door\(\)/.test(here) && /court_place\(p_trial\) is null then/.test(here),
    'saying "I am here" takes the door and a place in the case');
  ok(/court_here\|/.test(latest('public.refuse_suspended_requests').body), 'which somebody answering on leave may also say');
  ok(/status = 'open'/.test(here) && /delete from public\.court_presence where trial_id = p_trial/.test(latest('public.court_close_hearing').body),
    'who had the room open is kept only while the hearing is in session');
  const hearing = code('components/court/Hearing.tsx');
  ok(/<CourtStage full=\{full\} meId=\{me\.id\} \/>/.test(hearing), 'every hearing is drawn as a room with its people in it');
  ok(/document\.visibilityState !== 'visible'/.test(hearing) && /if \(!inSession\) return;/.test(hearing),
    'a screen says it is here only while the hearing is in session and somebody is looking at it');
  ok(!/courtDecide|close_trial/.test(hearing), 'no screen decides a case any more');
  // Button keeps a fixed list of props (components/ui.tsx) and drops any other
  // data- attribute without a word, so a marker written on one never reaches
  // the page. It goes on a wrapper. (The tag is read past the "=>" of an
  // onClick arrow, which would otherwise end it early.)
  const marked = ['Hearing', 'CourtRoom', 'AnswerRoom', 'CourtStage', 'Exhibits', 'CourtDoorPanel']
    .filter((f) => /<Button\b(?:=>|[^>])*?\sdata-(?!quest)[a-z-]+/.test(code(`components/court/${f}.tsx`)));
  ok(marked.length === 0, `no court button carries a marker that would be dropped${marked.length ? ` (${marked.join(', ')})` : ''}`);
  const stage = code('components/court/CourtStage.tsx');
  ok(!/@\/lib\/live\/data|rpc\(|fetch\(/.test(stage), 'the room asks the database nothing; it draws what the case already said');
  const avatar = code('lib/court/avatar.ts');
  ok(/export function lookFor\(id: string\)/.test(avatar) && !/fetch|localStorage|photo/i.test(avatar),
    'an avatar is worked out from an account id alone: no photo, nothing stored');
  const css = read('components/court/court.css');
  ok(css.lastIndexOf('@media (prefers-reduced-motion: reduce)') > css.lastIndexOf('animation: ct-'),
    'the avatars stop moving for anybody who asked for less motion');
}

// ---------------------------------------------------------------------------
// 5. ADMIN REPORTS IS NO LONGER BETA, AND PEOPLE ARE TOLD HOW A CASE ENDS
// ---------------------------------------------------------------------------
{
  ok(!/href: '\/cases'[^}]*beta: true/.test(code('components/RoomRails.tsx')), 'Admin Reports carries no Beta chip');
  ok(!/Still on beta/.test(read('app/cases/page.tsx')), 'nor a beta banner');
  const justice = read('docs/JUSTICE.md');
  ok(/drawn at random/i.test(justice) && /Church Board/.test(justice), 'the members\' guide says how a judge is chosen and who rules');
  const faq = read('lib/faq.ts');
  ok(/Church Board/.test(faq) && /drawn at random/i.test(faq), 'and so does the FAQ');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
