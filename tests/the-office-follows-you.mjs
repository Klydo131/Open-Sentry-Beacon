// The Office's own documents follow their owner to every device, stay in the
// folders they were put in, and go onto a calendar.
//
// Asked for on 2 October 2026: "Both Sabbath school and evangelistic meetings
// can have multiple storage files place in the sub-room to be organize and
// there can be an option to put it automatically on their digital calendars",
// and "make sure it's on device first, but ALSO it's transparent to go to other
// devices that is login".
//
//   node tests/the-office-follows-you.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const sql = (p) => read(p).replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-follows-'));
const bundle = path.join(out, 'follows.mjs');
await build({
  stdin: {
    contents: "export * from './lib/plan-sync';\nexport * from './lib/calendar';\n"
      + "export { byFolder, folderNames } from './lib/folders';\n"
      + "export { tidyProgram, fromTemplate, copyForNextSabbath } from './lib/sabbath-program';\n"
      + "export { tidyMeeting, plannedSeries, meetingAsText } from './lib/evangelistic-meeting';\n",
    resolveDir: root,
    loader: 'ts',
  },
  alias: { '@': root },
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const S = await import(pathToFileURL(bundle).href);

// ---------------------------------------------------------------------------
// 1. THE NEWER COPY WINS, AND A DELETION STAYS DELETED
// ---------------------------------------------------------------------------
{
  const K = 'sabbath_program';
  const item = (id, updated, extra = {}) => ({ id, updated, ...extra });
  const row = (id, updated, deleted = false, body) => ({ id, kind: K, body: body ?? { id, updated }, updated, deleted });
  const tidy = (raw) => (raw && typeof raw === 'object' && typeof raw.id === 'string' ? { id: raw.id, updated: raw.updated ?? 0, ...raw } : null);
  const merge = (local, marks, remote) => S.mergePlans(K, local, marks, remote, tidy);

  let m = merge([item('a', 5)], {}, []);
  ok(m.push.length === 1 && m.push[0].id === 'a' && !m.changed, 'made on this device only: it goes up to the account');
  m = merge([], {}, [row('b', 7)]);
  ok(m.list.length === 1 && m.list[0].id === 'b' && m.changed && !m.push.length, 'made on another device: it comes down');
  m = merge([item('a', 5, { theme: 'old' })], {}, [row('a', 9, false, { id: 'a', updated: 9, theme: 'new' })]);
  ok(m.list[0].theme === 'new' && m.list[0].updated === 9 && !m.push.length, 'changed elsewhere more recently: the account\'s copy wins');
  m = merge([item('a', 12)], {}, [row('a', 9)]);
  ok(m.push.length === 1 && m.push[0].updated === 12 && !m.changed, 'changed here more recently: this copy goes up');
  m = merge([item('a', 5)], {}, [row('a', 8, true)]);
  ok(m.list.length === 0 && m.marks.a === 8 && m.changed, 'deleted elsewhere after its last change here: it goes from this device too');
  m = merge([item('a', 10)], {}, [row('a', 8, true)]);
  ok(m.list.length === 1 && m.push[0].deleted === false, 'changed here after it was deleted elsewhere: the change wins');
  m = merge([], { a: 10 }, [row('a', 8)]);
  ok(m.list.length === 0 && m.push.length === 1 && m.push[0].deleted && m.push[0].updated === 10,
     'deleted here, and an offline device\'s older copy is in the account: it is not brought back, and the deletion goes up');
  m = merge([], { a: 6 }, [row('a', 8)]);
  ok(m.list.length === 1 && !('a' in m.marks), 'deleted here, but changed elsewhere afterwards: the later change wins');
  m = merge([], { gone: 3 }, []);
  ok(m.push.length === 1 && m.push[0].deleted && m.push[0].id === 'gone', 'a deletion the account has not heard of goes up');
  m = merge([], {}, [row('x', 4, false, 'not an item'), { ...row('y', 4), kind: 'evangelistic_meeting' }]);
  ok(m.list.length === 0 && !m.push.length, 'a row that is not an item, or of the other kind, is left alone');
  m = merge([item('a', 9)], {}, [row('a', 9)]);
  ok(!m.changed && !m.push.length, 'and when both copies agree, nothing moves');

  const shelf = new Map();
  globalThis.window = { localStorage: { getItem: (k) => shelf.get(k) ?? null, setItem: (k, v) => shelf.set(k, String(v)) } };
  const nowMs = Date.UTC(2026, 9, 2);
  S.saveMarks('maria', K, { fresh: nowMs - 1000, stale: nowMs - 400 * 24 * 3600 * 1000, junk: 'x' });
  const kept = S.loadMarks('maria', K, nowMs);
  ok(Object.keys(kept).join() === 'fresh' && Object.keys(S.loadMarks('pastor', K, nowMs)).length === 0,
     'deletion marks are kept per account, and let go after a year');
  delete globalThis.window;
}

// ---------------------------------------------------------------------------
// 2. THE ACCOUNT'S COPY IS ITS OWNER'S ALONE
// ---------------------------------------------------------------------------
{
  const file = 'supabase/migrations/20261002150000_office_plans_follow_you.sql';
  const m = sql(file);
  ok(/alter table public\.office_plans enable row level security/.test(m), 'the table has row level security');
  const policies = [...m.matchAll(/create policy (\w+) on public\.office_plans([\s\S]*?);/g)];
  const permissive = policies.filter(([, , body]) => !/as restrictive/.test(body));
  const narrowing = policies.filter(([, , body]) => /as restrictive/.test(body));
  ok(permissive.length === 4 && permissive.every(([, , body]) => /owner_id = \(select auth\.uid\(\)\)/.test(body)
     && !/manages_church|is_paired|church_of|true\b/.test(body)),
     'every policy that lets anybody in is the owner\'s own, with no leadership branch: read, add, change, remove');
  ok(narrowing.length === 1 && /i_am_not_suspended\(\)/.test(narrowing[0][2]),
     'and the one restrictive rule only shuts a suspended account out');
  ok(/primary key \(owner_id, id\)/.test(m), 'an item is keyed by its owner and its id, so nobody can claim another\'s');
  ok(/owner_id\s+uuid not null default auth\.uid\(\)/.test(m) && !/owner_id/.test(code('lib/live/office-plans.ts').replace(/onConflict: 'owner_id,id'/, '')),
     'the owner is filled in by the database, never sent by the browser');
  ok(/revoke all on public\.office_plans from anon/.test(m), 'nobody signed out reaches it');
  ok(/octet_length\(body::text\) <= 400000/.test(m) && />= 1000 then/.test(m), 'one row cannot be enormous, and one account cannot fill the database');
  ok(/if new\.updated < old\.updated then\s+return null;/.test(m) && /before update on public\.office_plans/.test(m),
     'a slower device cannot overwrite a newer copy: the account only moves forward');
  ok(/alter publication supabase_realtime add table public\.office_plans/.test(m), 'it is published, so another device hears a change while open');
  ok(/isMissingFromDatabase\(error\)\) return null/.test(code('lib/live/office-plans.ts')),
     'a database without the table yet is device-only, not an error');
}

// ---------------------------------------------------------------------------
// 3. WHO GETS THE ACCOUNT'S COPY, AND WHO DOES NOT
// ---------------------------------------------------------------------------
{
  const office = code('app/office/page.tsx');
  ok((office.match(/store=\{officePlans\}/g) ?? []).length === 2, 'a church\'s own Office keeps programs and meetings with the account');
  const demoStart = office.indexOf('function DemoOffice');
  ok(demoStart > 0 && !/store=/.test(office.slice(demoStart, office.indexOf('export default function OfficePage'))),
     'the sample church never does: its invented people stay in the browser');
  const page = code('app/sabbath/page.tsx');
  ok(/store=\{officePlans\}/.test(page) && /<ThisSabbath owner=\{owner\} role=\{rememberedRole\(owner\)\} received=\{received\} meetings=\{meetings\} \/>/.test(page),
     'This Sabbath syncs a leader\'s plans when signed in, and the page with no signal works from the device alone');
  for (const f of ['components/SabbathProgram.tsx', 'components/EvangelisticMeetings.tsx']) {
    const c = code(f);
    ok(/usePlanSync\(\{/.test(c) && /sync\.deleted\(open\.id\)/.test(c) && /sync\.changed\(\)/.test(c),
       `${path.basename(f)}: every change is sent, and a deletion is remembered`);
  }
  ok(/useKeepUp\(KEEP_UP_PLANS, sync, !!store\)/.test(code('lib/use-plan-sync.ts')), 'and listens for a change made on another device');
}

// ---------------------------------------------------------------------------
// 4. FOLDERS
// ---------------------------------------------------------------------------
{
  const items = [{ f: 'Youth Week' }, { f: '' }, { f: 'advent' }, { f: 'Youth Week' }, { f: '  ' }];
  const groups = S.byFolder(items, (x) => x.f);
  ok(groups.map((g) => `${g.folder}:${g.items.length}`).join('|') === ':2|advent:1|Youth Week:2',
     'items not in a folder come first, then each folder by name, whatever its case');
  ok(S.folderNames(items, (x) => x.f).join('|') === 'advent|Youth Week', 'the folders in use are offered to pick from');
  const RLO = String.fromCharCode(0x202e);
  const p = S.tidyProgram({ id: 'p', folder: `  2026${RLO} Quarter 4 ${'x'.repeat(200)}`, sections: [] });
  ok(p.folder.startsWith('2026 Quarter 4') && p.folder.length <= 60, 'a stored folder is tidied and cut to its limit');
  ok(S.tidyProgram({ id: 'p', sections: [] }).folder === '' && S.tidyMeeting({ id: 'm' }).folder === '',
     'and a program or series saved before folders existed is in none');
  const reused = S.copyForNextSabbath({ ...S.fromTemplate('Grace SDA Church', new Date(2026, 9, 2)), folder: 'Quarter 4' }, new Date(2026, 9, 2));
  ok(reused.folder === 'Quarter 4', 'reusing a program next week keeps it in its folder');
  for (const f of ['components/SabbathProgram.tsx', 'components/EvangelisticMeetings.tsx']) {
    ok(/<FolderedList/.test(code(f)) && /<FolderField/.test(code(f)), `${path.basename(f)}: the list is drawn in folders, and each item can be put in one`);
  }
}

// ---------------------------------------------------------------------------
// 5. THE CALENDAR FILE
// ---------------------------------------------------------------------------
{
  const series = S.plannedSeries('Grace SDA Church', '2026-10-04', 3);
  series.name = 'Hope for Today';
  series.place = 'Riverside Hall';
  series.nights[0].topic = 'The Blessed Hope';
  series.nights[2].time = '';
  series.nights[1].ends = '5:00 PM';
  // A block for the team on the night itself, which a calendar must never carry.
  series.nights[0].blocks.push({ id: 'drivers', kind: 'list', title: 'Drivers', teamOnly: true,
    columns: [{ id: 'd', name: 'Driver' }], rows: [{ id: 'r', cells: { d: 'Anna Yu drives the Tans' } }] });
  const events = S.meetingEvents(series, null);
  ok(events.length === 2 && events[0].title === 'Hope for Today: Night 1, The Blessed Hope',
     'each night with a date and a start time is an event; a night with no time is left off');
  ok(events[0].start === 17 * 60 + 30 && events[0].end === 21 * 60 && events[1].end === events[1].start + 180,
     'a night runs from its start to its end, or three hours when the end is missing or before the start');
  ok(events[0].location === 'Riverside Hall, Grace SDA Church', 'its place is the hall, then the church');
  ok(!events[0].description.includes('Anna Yu drives the Tans') && events[0].description.includes("CHILDREN'S TIME"),
     'its words are what is shared: a team-only block never goes onto a calendar');
  ok(S.meetingEvents(series, series.nights[0].id).length === 1, 'one night chosen is one event');

  const ics = S.icsCalendar([{ ...events[0], description: 'Line one\nWith, commas; and \\ a backslash' + ' é'.repeat(60) }], 'Hope; for, Today', new Date(Date.UTC(2026, 9, 2, 9, 30)));
  const lines = ics.split('\r\n');
  ok(ics.endsWith('\r\n') && !/[^\r]\n/.test(ics), 'every line of the file ends the way the standard asks, with CRLF');
  ok(lines[0] === 'BEGIN:VCALENDAR' && lines.includes('VERSION:2.0') && lines.includes('END:VCALENDAR') && lines.includes('BEGIN:VEVENT'),
     'it is a calendar holding events');
  ok(lines.includes('DTSTART:20261004T173000') && lines.includes('DTEND:20261004T210000') && lines.includes('DTSTAMP:20261002T093000Z'),
     'times are floating local times, as the hall\'s clock reads, and it says when it was made');
  ok(ics.replace(/\r\n /g, '').includes(`\r\nUID:${series.id}-${series.nights[0].id}@hope-beacon\r\n`),
     'each event keeps the same id every time, so downloading again updates it rather than doubling it');
  ok(ics.includes('X-WR-CALNAME:Hope\\; for\\, Today'), 'commas and semicolons in a name are escaped');
  ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), 'no line is longer than 75 bytes, accented letters included');
  const unfolded = ics.replace(/\r\n /g, '');
  ok(unfolded.includes('DESCRIPTION:Line one\\nWith\\, commas\\; and \\\\ a backslash é é'), 'and unfolded, the words come back exactly');

  const link = S.googleCalendarLink(events[0]);
  ok(link.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&') && link.includes('dates=20261004T173000%2F20261004T210000'),
     'Google Calendar opens with the night filled in');

  const program = S.fromTemplate('Grace SDA Church', new Date(2026, 9, 2));
  program.sections[0].time = '9:00 AM';
  program.sections[1].time = '11:00 AM';
  const parts = S.programEvents(program);
  ok(parts.length === 2 && parts[0].date === '2026-10-03' && parts[0].start === 540 && parts[0].end === 660 && parts[1].end === 720,
     'a Sabbath program\'s timed parts are events: each until the next begins, or an hour');
  ok(S.programEvents({ ...program, date: '' }).length === 0, 'and with no date, nothing goes on a calendar');
  program.sections[0].lines[0] = { ...program.sections[0].lines[0], who: 'Grace Lim', note: 'Pianist plays the first verse through' };
  const noted = S.icsCalendar(S.programEvents(program), 'Sabbath', new Date(Date.UTC(2026, 9, 2, 9, 30))).replace(/\r\n /g, '');
  ok(noted.includes('Grace Lim') && !noted.includes('Pianist plays'),
     'a platform note never goes on a calendar, which may itself be shared');
  for (const f of ['components/SabbathProgram.tsx', 'components/EvangelisticMeetings.tsx']) {
    ok(/icsCalendar\(events/.test(code(f)) && /Add to calendar/.test(read(f)), `${path.basename(f)}: Add to calendar downloads the file`);
  }
  ok(/rel="noopener noreferrer"/.test(read('components/EvangelisticMeetings.tsx')), 'the Google Calendar link opens apart from the app');
  const notice = read('app/privacy/page.tsx').replace(/\s+/g, ' ');
  ok(/When you press Google Calendar<\/strong>[^.]*so Google receives them/.test(notice)
     && /A copy is also kept with your account/.test(notice) && /Only you can read that copy/.test(notice),
     'the privacy notice says what Google Calendar sends, and who reads the account copy');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
