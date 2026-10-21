// Admin Reports is clean and simple, and fits a phone, a pad and a computer.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 21 October 2026: "I want the UI to be clean and simple with the
// best available tools for all users in the Admin reports room. Make sure
// everything is well adapted to all devices, desktop, tab, mobile, etc."
//
// WHAT WAS WRONG, measured in a browser at 360, 390, 768, 1024, 1280 and
// 1440px before the change:
//   * a case opened UNDER the list of cases, which was one big card per case,
//     so on a phone with twenty earlier cases it began about 4,000px down;
//   * every closed case in the church was offered under "Hearings you may
//     watch", where nobody could watch it;
//   * a case on a phone was one column 5,900px long (7,900px for the judge),
//     and so was a case on a computer, where the rails leave it about 620px;
//   * what an act did ("It is on the record.") was said at the foot of the
//     case, out of sight of the button that did it.
//
// WHAT HOLDS NOW, each checked below and each broken on purpose once to watch
// the check go red. The rendered room itself is walked locally at those six
// sizes (it needs the court room's database, which the walks in CI do not
// have).
//
//   node tests/the-court-room-fits-every-screen.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const room = code('components/court/CourtRoom.tsx');
const hearing = code('components/court/Hearing.tsx');
const cssText = read('components/court/court.css');
const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** The block that opens at `at`, braces balanced, and where it ends. */
function blockAt(at) {
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { text: css.slice(at, i + 1), end: i + 1 };
  }
  return { text: '', end: css.length };
}
/** Every `@container (...)` block with this query, joined. */
function containerBlock(query) {
  const found = [];
  for (let at = css.indexOf(`@container (${query})`); at >= 0; at = css.indexOf(`@container (${query})`, at + 1)) {
    found.push(blockAt(at).text);
  }
  return found.join('\n');
}
/** The CSS with every @container and @media block taken out: what applies everywhere. */
const everywhere = (() => {
  let out = '';
  let depth = 0;
  let inAt = false;
  for (let i = 0; i < css.length; i++) {
    if (!inAt && depth === 0 && (css.startsWith('@container', i) || css.startsWith('@media', i))) inAt = true;
    if (css[i] === '{') depth++;
    if (!inAt) out += css[i];
    if (css[i] === '}' && --depth === 0) inAt = false;
  }
  return out;
})();

// ---------------------------------------------------------------------------
// 1. THE LIST, OR ONE CASE: NEVER A CASE UNDER THE LIST
// ---------------------------------------------------------------------------
{
  const branch = room.indexOf('{selectedCase ? (');
  const otherwise = room.indexOf(') : (', branch);
  const hearingAt = room.indexOf('<Hearing', branch);
  const listAt = room.indexOf('data-court-list', branch);
  ok(branch > 0 && hearingAt > branch && hearingAt < otherwise && listAt > otherwise
    && (room.match(/<Hearing\b/g) ?? []).length === 1,
    'a case is drawn in place of the list, with a way back, never below it');
  ok(/data-court-back/.test(room) && /onClick=\{\(\) => choose\(''\)\}/.test(room), 'and "All cases" brings the list back');
}

// ---------------------------------------------------------------------------
// 2. TWO SHELVES, AND NOTHING OFFERED THAT CANNOT BE DONE
// ---------------------------------------------------------------------------
{
  ok(/const nowWatch = leads \? watchable\.filter\(\(c\) => c\.status === 'open'\) : \[\];/.test(room),
    'only a hearing in session is offered to watch');
  ok(/const nowMine = mine\.filter\(\(c\) => c\.status !== 'closed'\);/.test(room)
    && /const earlierMine = mine\.filter\(\(c\) => c\.status === 'closed' && !lately\(c\)\);/.test(room),
    'what is still going is on Now; what has ended is on Earlier');
  ok(/const ruledLately = mine\.filter\(lately\);/.test(room) && /RULED_LATELY_MS = 7 \* 86_400_000/.test(room),
    'and a case ruled this week stays on Now, where somebody told of the ruling looks for it');
  ok(/shelfSize > 5 && \(/.test(room) && /data-court-find/.test(room), 'a long shelf can be searched');
  ok(/<button type="button" className="ct-case-open" onClick=\{onOpen\}/.test(room),
    'the whole row of a case opens it, not a small button at its end');
}

// ---------------------------------------------------------------------------
// 3. A CASE HAS TABS WHERE IT IS NARROW, AND TWO COLUMNS WHERE IT IS WIDE
// ---------------------------------------------------------------------------
{
  ok(/\.ct-panel:not\(\[data-active='true'\]\) \{ display: none; \}/.test(everywhere)
    && /\.ct-col \{ display: contents; \}/.test(everywhere),
    'tabs are the default, so a browser without container queries still gets tabs that work');
  const wide = containerBlock('min-width: 760px');
  ok(/\.ct-tabs \{ display: none; \}/.test(wide) && /\.ct-cols \.ct-panel \{ display: block; \}/.test(wide)
    && /\.ct-cols \{ display: grid; grid-template-columns:/.test(wide),
    'where the case itself is wide, every panel shows, in two columns, and the tabs go');
  ok(/\.ct-hearing \{[^}]*container-type: inline-size;/.test(everywhere),
    'and "wide" is the case\'s width, not the window\'s: beside the rails a 1280px window leaves it about 620px');
  ok(/\.ct-tabs \{[^}]*position: sticky;[^}]*top: calc\(var\(--beacon-chrome-top, 0px\) \+ var\(--app-header, 0px\)\);/.test(everywhere),
    'the tabs stay in reach under the app\'s own header');
  // .compact-ui button sets min-height 0 at (0,1,1); a lone .ct-tab would lose to it.
  ok(/\.ct-tabs \.ct-tab \{[^}]*min-height: 44px;/.test(everywhere),
    'a tab is never smaller than 44px');
  for (const key of ['record', 'exhibits', 'desk', 'tools']) {
    ok(new RegExp(`panel\\('${key}'`).test(hearing) && new RegExp(`key: '${key}'|key: '${key}' as Tab`).test(hearing),
      `the ${key} panel has a tab to reach it`);
  }
}

// ---------------------------------------------------------------------------
// 4. WHAT HAPPENED IS SAID WHERE THE PERSON IS LOOKING
// ---------------------------------------------------------------------------
{
  ok(/className="ct-toast compact-ui" role=\{error \? 'alert' : 'status'\}/.test(hearing),
    'what an act did is said in a message pinned to the screen, read out by a screen reader');
  ok(/\.ct-toast \{[^}]*position: fixed;[^}]*bottom: calc\(max\(env\(safe-area-inset-bottom, 0px\), var\(--tab-bar, 0px\)\) \+ 12px\);/.test(everywhere),
    'standing above the bottom bar and clear of a phone\'s home indicator');
  ok(/body:has\(\[data-talk-bubble\]\) \.ct-toast \{\s*bottom: calc\(max\(env\(safe-area-inset-bottom, 0px\), var\(--tab-bar, 0px\)\) \+ 82px\);/.test(everywhere),
    'and above the Talk bubble, rather than over it');
  ok(/setTimeout\(\(\) => setNotice\(''\), 6000\)/.test(hearing) && !/setTimeout\(\(\) => setError/.test(hearing),
    'good news goes on its own; a refusal stays until it is read');
}

// ---------------------------------------------------------------------------
// 5. NOTHING IS WIDER THAN A PHONE, AND NOTHING MOVES FOR SOMEBODY WHO ASKED
// ---------------------------------------------------------------------------
{
  const wideFixed = [...css.matchAll(/(?<![-\w])width:\s*(\d+)px/g)].filter((m) => Number(m[1]) > 320).map((m) => m[0]);
  ok(wideFixed.length === 0, `no part of the room is fixed wider than a small phone${wideFixed.length ? ` (${wideFixed.join(', ')})` : ''}`);
  const last = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  const stills = blockAt(last);
  ok(last > 0 && css.slice(stills.end).trim() === ''
    && /\.ct-switch input,\s*\.ct-switch input::after,\s*\.ct-more-chev \{ transition: none; \}/.test(stills.text),
    'and every movement in the room, the new switch and folds included, stops for anybody who asked for less motion');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
