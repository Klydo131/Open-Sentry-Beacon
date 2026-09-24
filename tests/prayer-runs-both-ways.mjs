// Prayer runs both ways, and every door it opens is the narrow one.
//
// ---------------------------------------------------------------------------
// WHAT THIS HOLDS. A Guide can ask the Explorers they walk with to pray for
// them, and an Explorer can answer "I am praying for this", exactly as it has
// always worked the other way round (supabase/migrations/20260924100000_a_
// guide_can_ask_for_prayer_too.sql). A request is somebody's words arriving on
// somebody else's screen, so the rules that make that safe are checked here
// rather than trusted:
//
//   WHO READS   the author; the one Explorer a Guide's request was written to,
//               while they walk together; a Guide reading their Explorers'
//               OWN requests. Not a second Guide, not another Explorer.
//   WHO WRITES  the author is the session -- the browser cannot name it, set a
//               status, or say who is praying. A Guide asks only an Explorer
//               they walk with, and never onto the church wall.
//   WHO CHANGES the other side may move open -> praying and nothing else;
//               only the author withdraws.
//   WHO IS TOLD whoever asked, when somebody prays; the other side, when
//               somebody asks. Never with the prayer's words, which would
//               appear on a locked phone.
//   A WAY OUT   whoever a request was written TO can report it, from the
//               request, and the words are copied into the report.
//
// And both halves of the app agree: the live screens and the sample app split
// requests by who wrote them, so a Guide's own ask is never counted as an
// Explorer "waiting for prayer", and never offered to anybody else to withdraw.
//
// Read from the LAST definition of every policy and function across all
// migrations, the one a fresh database has.
//
//   node tests/prayer-runs-both-ways.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const strip = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s) => s.replace(/\s+/g, ' ').toLowerCase();

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const policies = new Map();
const functions = new Map();
const texts = [];
for (const file of files) {
  const text = strip(fs.readFileSync(path.join(dir, file), 'utf8'));
  texts.push({ file, text });
  const events = [];
  for (const m of text.matchAll(/create\s+policy\s+"?(\w+)"?\s+on\s+(?:(\w+)\.)?"?(\w+)"?[\s\S]*?;/gi)) {
    events.push({ at: m.index, kind: 'create', key: `${m[2] || 'public'}.${m[3]} ${m[1]}`, body: m[0] });
  }
  for (const m of text.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+(?:(\w+)\.)?"?(\w+)"?/gi)) {
    events.push({ at: m.index, kind: 'drop', key: `${m[2] || 'public'}.${m[3]} ${m[1]}` });
  }
  events.sort((a, b) => a.at - b.at);
  for (const e of events) {
    if (e.kind === 'drop') policies.delete(e.key);
    else policies.set(e.key, { file, body: squash(e.body) });
  }
  for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:(\w+)\.)?"?(\w+)"?\s*\(/gi)) {
    const rest = text.slice(m.index);
    const open = rest.match(/\$(\w*)\$/);
    if (!open) continue;
    const start = open.index + open[0].length;
    const close = rest.indexOf(open[0], start);
    if (close === -1) continue;
    functions.set(`${m[1] || 'public'}.${m[2]}`, {
      file, head: squash(rest.slice(0, open.index)), body: squash(rest.slice(start, close)),
    });
  }
}
const policy = (name) => policies.get(`public.prayer_requests ${name}`)?.body ?? '';
const fn = (name) => functions.get(name) ?? { head: '', body: '' };

// ---------------------------------------------------------------------------
// 1. WHO READS
// ---------------------------------------------------------------------------
{
  const read = policy('prayer_read');
  ok(read.includes('author_id = (select auth.uid())'), 'the author always reads their own request');
  ok(read.includes('ds_id = (select auth.uid()) and author_id in (select private.people_i_walk_with())'),
    'an Explorer reads a request written to them only while they walk with its author');
  ok(read.includes('author_id = ds_id and ds_id in (select private.my_explorers())'),
    "a Guide reads an Explorer's OWN requests, not another Guide's asks of that Explorer");
  // THE REGRESSION. The rule before this read `ds_id in people_i_walk_with()`,
  // which on its own would hand a Guide's request to every Guide of the same
  // Explorer.
  ok(!/or\s+ds_id\s+in\s+\(select private\.people_i_walk_with\(\)\)/.test(read),
    'no bare "ds_id in people_i_walk_with()" arm that would show one Guide\'s ask to another');

  const update = policy('prayer_update');
  ok(update.includes('author_id = (select auth.uid())') && update.includes('private.my_explorers()')
     && !/is_paired_with\(/.test(update),
    'the update rule is the read rule, not the old per-row is_paired_with()');

  const helper = fn('private.my_explorers');
  ok(/p\.dm_id = \(select auth\.uid\(\)\)/.test(helper.body) && /p\.status = 'active'/.test(helper.body)
     && /is_approved_user\(\)/.test(helper.body),
    'my_explorers() is the active, approved Guide half of a pairing');
}

// ---------------------------------------------------------------------------
// 2. WHO WRITES
// ---------------------------------------------------------------------------
{
  const create = policy('prayer_create');
  ok(create.includes('author_id = (select auth.uid())'), 'a request is written in the caller\'s own name');
  ok(/ds_id in \(select private\.my_explorers\(\)\) and not share_with_church/.test(create),
    'a Guide asks only an Explorer they walk with, and never onto the church wall');
  ok(policy('prayer_delete').includes('author_id = (select auth.uid())')
     && !policy('prayer_delete').includes('ds_id'),
    'only the author withdraws a request');

  // The insert grant: the four columns the app writes, and a later migration
  // must not hand the whole row back.
  const narrow = /grant\s+insert\s*\(\s*ds_id\s*,\s*church_id\s*,\s*body\s*,\s*share_with_church\s*\)\s*on\s+public\.prayer_requests\s+to\s+authenticated/i;
  const at = texts.findIndex((t) => narrow.test(t.text));
  ok(at !== -1, 'the browser may insert ds_id, church_id, body and share_with_church, and nothing else');
  ok(texts.some((t) => /revoke\s+insert\s+on\s+public\.prayer_requests\s+from\s+authenticated/i.test(t.text)),
    'the blanket insert grant was revoked first');
  // Everything AFTER the narrow grant: the rest of its own file, then every
  // later file. A whole-row grant two lines further down the same migration
  // reopens it just as surely as one next month.
  const after = at === -1 ? [] : [
    { file: texts[at].file, text: texts[at].text.slice(texts[at].text.search(narrow) + 1) },
    ...texts.slice(at + 1),
  ];
  const reopened = after.filter((t) =>
    /grant[^;]*\binsert\b(?![^;]*\()[^;]*on[^;]*public\.prayer_requests[^;]*to[^;]*authenticated/i.test(t.text)
    || /grant[^;]*\ball\b[^;]*on[^;]*public\.prayer_requests[^;]*to[^;]*authenticated/i.test(t.text));
  ok(reopened.length === 0,
    `nothing after it grants the whole row again${reopened.length ? ` (${reopened.map((t) => t.file).join(', ')})` : ''}`);

  const author = texts.find((t) =>
    /alter\s+table\s+public\.prayer_requests\s+add\s+column\s+if\s+not\s+exists\s+author_id/i.test(t.text));
  ok(Boolean(author) && /alter\s+column\s+author_id\s+set\s+default\s+auth\.uid\(\)/i.test(author.text)
     && /set\s+not\s+null/i.test(author.text),
    'author_id is filled from the session and can never be empty');
}

// ---------------------------------------------------------------------------
// 3. WHO CHANGES, AND WHO IS TOLD
// ---------------------------------------------------------------------------
{
  const rule = fn('private.a_prayer_moves_by_its_rules');
  ok(/is distinct from old\.author_id/.test(rule.body)
     && /not \(old\.status = 'open' and new\.status = 'praying'\)/.test(rule.body)
     && /raise exception/.test(rule.body),
    'anybody but the author may move a request from open to praying, and nothing else');
  ok(texts.some((t) => /create\s+trigger\s+prayer_a_status_moves_by_its_rules\s+before\s+update\s+of\s+status\s+on\s+public\.prayer_requests/i.test(t.text)),
    'and that rule runs before every status change');

  const praying = fn('public.prayer_says_somebody_is_praying');
  ok(/notify_user\( new\.author_id,/.test(praying.body) && !/notify_user\( new\.ds_id,/.test(praying.body),
    '"somebody is praying" goes to whoever ASKED, which is not always the Explorer');
  ok(/if new\.author_id = auth\.uid\(\) then return new;/.test(praying.body),
    'marking your own request sends nobody a message');

  const asked = fn('private.prayer_asked_tells_the_other_side');
  ok(/asked for prayer/.test(asked.body) && /asked you to pray for them/.test(asked.body),
    'the other side is told when somebody asks, in both directions');
  ok(texts.some((t) => /create\s+trigger\s+hold_the_pace\s+before\s+insert\s+on\s+public\.prayer_requests[\s\S]*?hold_the_pace\('author_id'\)/i.test(t.text)),
    'asking is held to the same pace as a conversation, since each ask notifies');

  // NO PRAYER TEXT ON A LOCKED PHONE. Every notify_user call in every prayer
  // function, checked for the words of the request.
  const prayerFns = [...functions.entries()].filter(([k]) => /prayer/.test(k));
  const leaks = [];
  for (const [k, { body }] of prayerFns) {
    for (const m of body.matchAll(/notify_user\(([^;]*?)\);/g)) {
      if (/\.body\b|p_body|v_detail/.test(m[1])) leaks.push(k);
    }
  }
  ok(prayerFns.length >= 3 && leaks.length === 0,
    `no prayer notification carries the prayer's words${leaks.length ? ` (${leaks.join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 4. A WAY OUT, ON THE SAME SCREEN
// ---------------------------------------------------------------------------
{
  const report = fn('private.report_prayer_request');
  ok(/security definer/.test(report.head) && /set search_path = ''/.test(report.head),
    'reporting is a definer function with an empty search path');
  ok(/v_request\.author_id = v_me\.id/.test(report.body) && /raise exception/.test(report.body),
    'nobody reports their own request');
  ok(/v_request\.ds_id = v_me\.id and v_request\.author_id in \(select private\.people_i_walk_with\(\)\)/.test(report.body)
     && /v_request\.author_id = v_request\.ds_id and v_request\.ds_id in \(select private\.my_explorers\(\)\)/.test(report.body),
    'only somebody a request was written TO can report it');
  ok(/v_request\.body/.test(report.body) && /insert into public\.reports/.test(report.body),
    'the words are copied into the report, so it outlives a withdrawn request');
  ok(/role in \('admin', 'executive'\)/.test(report.body), 'every Director of the church is told');
  const all = texts.map((t) => t.text).join('\n');
  ok(/revoke\s+all\s+on\s+function\s+public\.report_prayer_request\(uuid,\s*text,\s*text\)\s+from\s+public,\s*anon/i.test(all)
     && /grant\s+execute\s+on\s+function\s+public\.report_prayer_request\(uuid,\s*text,\s*text\)\s+to\s+authenticated/i.test(all),
    'signed-in members only');
}

// ---------------------------------------------------------------------------
// 5. BOTH HALVES OF THE APP
// ---------------------------------------------------------------------------
{
  const data = fs.readFileSync('lib/live/data.ts', 'utf8');
  const list = data.slice(data.indexOf('export async function listPrayerRequests'));
  ok(/\.select\('[^']*\bauthor_id\b[^']*'\)/.test(list.slice(0, 600)),
    'the live list asks for author_id, so the screens can tell the two kinds apart');
  const ask = data.slice(data.indexOf('export async function askForPrayer'), data.indexOf('export async function listPrayerRequests'));
  ok(ask.length > 0 && !/author_id|status|praying_/.test(ask.slice(ask.indexOf('.insert('))),
    'askForPrayer never sends an author, a status or who is praying');
  ok(/rpc\('report_prayer_request'/.test(data), 'the live app reports through the definer function');

  const livePrayer = fs.readFileSync('components/LivePrayer.tsx', 'utf8');
  const explorer = livePrayer.slice(livePrayer.indexOf('export function LiveAskForPrayer'),
    livePrayer.indexOf('export function LivePrayerForGuide'));
  ok(/filter\(live\.isExplorersOwn\)/.test(explorer) && /<ReportPrayer\b/.test(explorer)
     && /<PrayingFor\b/.test(explorer),
    "the Explorer's room splits their own from their Guide's, and can pray for and report the Guide's");
  const guide = livePrayer.slice(livePrayer.indexOf('export function LivePrayerForGuide'));
  ok(/<AskThemToPray\b/.test(guide) && /<ReportPrayer\b/.test(guide) && /deletePrayerRequest/.test(guide),
    'the Guide can ask, report what an Explorer wrote, and withdraw their own ask');

  const guidePages = fs.readFileSync('components/live/GuidePages.tsx', 'utf8');
  const counts = [...guidePages.matchAll(/status\s*(?:!==|===)\s*'open'[^\n]*/g)].map((m) => m[0]);
  ok(counts.length >= 2 && counts.every((c) => /isExplorersOwn/.test(c)),
    "the Guide's \"asked for prayer\" badges count only the Explorers' own requests");

  const store = fs.readFileSync('lib/demo/store.tsx', 'utf8');
  const setStatus = store.slice(store.indexOf('const setPrayerStatus = useCallback'), store.indexOf('const askForPrayer = useCallback'));
  ok(/pr\.status === 'open' && status === 'praying'/.test(setStatus),
    'the sample app enforces the same open -> praying rule');
  ok(/const askForPrayer = useCallback/.test(store) && /const reportPrayerRequest = useCallback/.test(store)
     && /const withdrawPrayerRequest = useCallback/.test(store),
    'the sample app can ask, report and withdraw too');
  const demoGuide = fs.readFileSync('app/dm/[id]/page.tsx', 'utf8');
  ok(!/setPrayerStatus\([^)]*'answered'\)/.test(demoGuide),
    'the sample Guide no longer marks somebody else\'s prayer answered');
  const demoExplorer = fs.readFileSync('app/ds/page.tsx', 'utf8');
  ok(/prayerAuthor\(r\) !== me\.id/.test(demoExplorer) && /reportPrayerRequest/.test(demoExplorer),
    "the sample Explorer sees their Guide's asks, and can report one");
}

console.log(bad === 0 ? '\nPrayer runs both ways, through narrow doors.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
