// Evangelistic meetings: a series of nights, each planned however the church
// plans it, kept on the planner's own device and shared as a post.
//
// ASKED FOR on 2 October 2026: "Make sure Evangelistic Meetings are super
// customizable, unlike Sabbath program it has a template that can put input,
// but for EMs users can have much more freedom to customise their meeting."
// The owner then chose all four kinds of freedom offered:
//
//   * BLOCKS. A night, and the series as a whole, is a list of blocks the
//     planner chooses and orders: a list, a paragraph, a checklist. "A
//     program", "a team" and "a schedule" are only lists with their columns
//     already named.
//   * THEIR OWN COLUMNS. A list names its own columns, up to six, where the
//     Sabbath program has its fixed three (what, details, who).
//   * MANY NIGHTS. Each night has its own date, time, topic and blocks, and one
//     night can be copied to make the next.
//   * THEIR OWN LOOK. A colour and a heading style for the Word file and the
//     picture.
//
// KEPT ON THE DEVICE AND SHARED AS A POST, the owner's choice, exactly as the
// Sabbath program is (lib/sabbath-program.ts says what that gives and costs).
//
// A BLOCK CAN BE THE TEAM'S ONLY. Planning a campaign means writing down
// things that are not for the public: the jobs still to do, who is driving
// whom. A block marked "team only" is in the team's copy of the Word file and
// nowhere else: never in the picture, never in a post. A checklist starts that
// way, because a to-do list is the team's.

import { uuid } from '@/lib/uuid';
import {
  dateLabel, dayKey, keep, manyLines, oneLine, readKept, type ReceivedProgram,
} from '@/lib/sabbath-program';

export interface MeetingColumn {
  id: string;
  name: string;
}

export interface MeetingRow {
  id: string;
  /** What each column says on this line, by the column's id. */
  cells: Record<string, string>;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface BlockBase {
  id: string;
  title: string;
  /** In the team's copy of the Word file only: never a picture, never a post. */
  teamOnly: boolean;
}

export interface ListBlock extends BlockBase {
  kind: 'list';
  columns: MeetingColumn[];
  rows: MeetingRow[];
}

export interface TextBlock extends BlockBase {
  kind: 'text';
  body: string;
}

export interface ChecklistBlock extends BlockBase {
  kind: 'checklist';
  items: ChecklistItem[];
}

export type MeetingBlock = ListBlock | TextBlock | ChecklistBlock;

export interface MeetingNight {
  id: string;
  /** YYYY-MM-DD, or '' when not chosen yet. */
  date: string;
  /** As the church writes it: "5:30 PM", "17:30". */
  time: string;
  /** When the night ends, the same way. What a calendar needs; '' when not said. */
  ends: string;
  topic: string;
  blocks: MeetingBlock[];
}

export type HeadingStyle = 'classic' | 'clean' | 'friendly';
export type TitleAlign = 'centre' | 'left';

export interface MeetingLook {
  /** '#rrggbb'. */
  colour: string;
  headings: HeadingStyle;
  align: TitleAlign;
}

export interface EvangelisticMeeting {
  id: string;
  /** A folder of the planner's own, to keep many series in order. '' for none. */
  folder: string;
  /** What the series is called: "Hope for Today". */
  name: string;
  church: string;
  place: string;
  /** A line under the name: "Every night from 5:30 PM, all are welcome". */
  tagline: string;
  look: MeetingLook;
  /** Blocks for the whole series: about the meetings, the team, the to-do list. */
  blocks: MeetingBlock[];
  nights: MeetingNight[];
  updated: number;
}

/** Ceilings, so a stored meeting cannot grow without end or break a page. */
export const MEETING_LIMITS = {
  meetings: 60,
  folder: 60,
  nights: 31,
  blocks: 20,
  columns: 6,
  rows: 60,
  items: 60,
  name: 120,
  church: 120,
  place: 160,
  tagline: 200,
  title: 80,
  column: 40,
  cell: 300,
  text: 4000,
  item: 200,
  topic: 160,
  time: 20,
  received: 20,
} as const;

// ---------------------------------------------------------------------------
// THE LOOK
// ---------------------------------------------------------------------------

/** Colours chosen to be readable as headings on white: each is 7:1 or better. */
export const COLOURS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Navy', hex: '#0b1f3a' },
  { name: 'Forest', hex: '#1f5130' },
  { name: 'Burgundy', hex: '#7a1f2b' },
  { name: 'Ocean', hex: '#0f4c75' },
  { name: 'Plum', hex: '#5b2a6e' },
  { name: 'Rust', hex: '#9a3412' },
  { name: 'Teal', hex: '#115e59' },
  { name: 'Charcoal', hex: '#2b2b2b' },
];

export const DEFAULT_LOOK: MeetingLook = { colour: '#0b1f3a', headings: 'classic', align: 'centre' };

/** The ink used for words when a chosen colour is too light to read on white. */
export const INK = '#1f2937';

/** '#rrggbb', lower case, or null when it is not a colour. */
export function hexColour(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/** How a colour reads against white, as a WCAG contrast ratio (1 to 21). */
export function contrastOnWhite(hex: string): number {
  const colour = hexColour(hex);
  if (!colour) return 1;
  const channel = (i: number) => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const light = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (light + 0.05);
}

/**
 * The colour words are written in. A church may choose any colour it likes,
 * and a pale one still draws the lines; but words in a colour that cannot be
 * read on white are written in ink instead (4.5:1 is the WCAG floor for text).
 */
export function wordColour(look: MeetingLook): string {
  return contrastOnWhite(look.colour) >= 4.5 ? look.colour : INK;
}

/** The face for headings: fonts every phone and computer already has, so nothing is fetched or licensed. */
export const HEADING_FACES: Record<HeadingStyle, { label: string; css: string; word: string }> = {
  classic: { label: 'Classic', css: "Georgia, 'Times New Roman', serif", word: 'Georgia' },
  clean: { label: 'Clean', css: "Arial, 'Helvetica Neue', Helvetica, sans-serif", word: 'Arial' },
  friendly: { label: 'Friendly', css: "Verdana, 'Trebuchet MS', Tahoma, sans-serif", word: 'Verdana' },
};

function tidyLook(raw: unknown): MeetingLook {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    colour: hexColour(r.colour) ?? DEFAULT_LOOK.colour,
    headings: r.headings === 'clean' || r.headings === 'friendly' ? r.headings : 'classic',
    align: r.align === 'left' ? 'left' : 'centre',
  };
}

// ---------------------------------------------------------------------------
// BLOCKS
// ---------------------------------------------------------------------------

/** What "Add a block" offers. Three of them are lists with their columns already named. */
export const BLOCK_CHOICES = [
  { key: 'program', label: 'A program', hint: 'Time, what happens, who' },
  { key: 'team', label: 'A team', hint: 'Role and name' },
  { key: 'schedule', label: 'A schedule', hint: 'Date, time, what' },
  { key: 'list', label: 'A list with your own columns', hint: 'Name the columns yourself' },
  { key: 'text', label: 'A paragraph', hint: 'Anything, in your own words' },
  { key: 'checklist', label: 'A checklist', hint: 'For the team: kept off what is shared' },
] as const;

export type BlockChoice = (typeof BLOCK_CHOICES)[number]['key'];

/** A list with these columns, and a line for each of `firsts` with its first or second column filled. */
export function listBlock(title: string, columns: string[], firsts: string[] = [], into = 0): ListBlock {
  const cols = columns.map((name) => ({ id: uuid(), name }));
  const target = cols[Math.min(into, cols.length - 1)];
  const rows = (firsts.length ? firsts : ['']).map((text) => ({
    id: uuid(),
    cells: text ? { [target.id]: text } : {},
  }));
  return { id: uuid(), kind: 'list', title, teamOnly: false, columns: cols, rows };
}

/**
 * A night of evangelistic meetings as the owner's church runs one, told on
 * 2 October 2026 ("crusade" is the old word; evangelistic meetings is what it
 * is called now, and it is team work): children's time with songs, a Bible
 * story and craft making, then a health talk, then the Bible study, then
 * snacks. Each part is a block of its own with its time in its name, so each
 * has its own team and can be moved, renamed or dropped.
 */
export function nightParts(): MeetingBlock[] {
  return [
    listBlock("Children's time, 5:30 to 6:30 PM", ['What happens', 'Who'], ['Songs', 'Bible story', 'Craft making']),
    listBlock('Health time, 6:30 to 7:30 PM', ['What happens', 'Who'], ['Health lecture']),
    listBlock('Bible study, 7:30 to 8:30 PM', ['What happens', 'Who'], ['Discussion or sermon on a Bible truth']),
    listBlock('Snacks', ['What happens', 'Who'], ['Snacks and fellowship']),
  ];
}

/** A program in one list, for "Add a block". No hymn titles: they are the hymnal's. */
export function programBlock(): ListBlock {
  return listBlock('Program', ['Time', 'What happens', 'Who'], [
    'Song service', 'Welcome and prayer', 'Health talk', "Children's story", 'Special music',
    'Message', 'Appeal and prayer', 'Closing prayer',
  ], 1);
}

export function newBlock(choice: BlockChoice): MeetingBlock {
  switch (choice) {
    case 'program': return programBlock();
    case 'team': return listBlock('Team', ['Role', 'Name']);
    case 'schedule': return listBlock('Schedule', ['Date', 'Time', 'What']);
    case 'list': return listBlock('', ['', '']);
    case 'text': return { id: uuid(), kind: 'text', title: '', teamOnly: false, body: '' };
    case 'checklist': return { id: uuid(), kind: 'checklist', title: 'To do', teamOnly: true, items: [newItem()] };
  }
}

export function newItem(text = ''): ChecklistItem {
  return { id: uuid(), text, done: false };
}

export function newRow(): MeetingRow {
  return { id: uuid(), cells: {} };
}

/** The same block with new ids throughout, and every line's cells moved to the new column ids. */
export function cloneBlock(b: MeetingBlock): MeetingBlock {
  if (b.kind === 'text') return { ...b, id: uuid() };
  if (b.kind === 'checklist') return { ...b, id: uuid(), items: b.items.map((i) => ({ ...i, id: uuid() })) };
  const ids = new Map(b.columns.map((c) => [c.id, uuid()]));
  return {
    ...b,
    id: uuid(),
    columns: b.columns.map((c) => ({ ...c, id: ids.get(c.id)! })),
    rows: b.rows.map((r) => ({
      id: uuid(),
      cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [ids.get(k) ?? k, v])),
    })),
  };
}

// ---------------------------------------------------------------------------
// NIGHTS AND MEETINGS
// ---------------------------------------------------------------------------

/** The day after a YYYY-MM-DD date, or '' when there is no date to count from. */
export function dayAfter(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  return dayKey(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
}

/** The coming Sunday, or today if today is Sunday: when a series most often begins. */
export function comingSunday(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return dayKey(d);
}

export function newNight(date = '', time = '', ends = ''): MeetingNight {
  return { id: uuid(), date, time, ends, topic: '', blocks: [] };
}

/** A copy of a night for `date`: the same blocks and names, a topic still to choose. */
export function copiedNight(n: MeetingNight, date: string): MeetingNight {
  return { ...n, id: uuid(), date, topic: '', blocks: n.blocks.map(cloneBlock) };
}

/**
 * Copy one night onto the end of the series, for the day after its last
 * night. At the end, not beside the night copied: in a series already laid
 * out night by night, the day after any night but the last is taken.
 */
export function withNightCopied(m: EvangelisticMeeting, nightId: string): EvangelisticMeeting {
  const source = m.nights.find((n) => n.id === nightId);
  if (!source || m.nights.length >= MEETING_LIMITS.nights) return m;
  return { ...m, nights: [...m.nights, copiedNight(source, dayAfter(lastDate(m) || source.date))] };
}

/**
 * A series laid out the way one usually runs, to be changed as freely as
 * anything else: a night for each of `count` days from `first`, 5:30 to 9:00
 * PM, each with its four parts (nightParts), and, for the whole series, a
 * paragraph about the meetings, the team for each part, and the team's own
 * list of what to get ready.
 */
export function plannedSeries(church: string, first: string, count: number): EvangelisticMeeting {
  const nights: MeetingNight[] = [];
  let date = first;
  const total = Math.min(MEETING_LIMITS.nights, Math.max(1, Math.round(count) || 1));
  for (let i = 0; i < total; i++) {
    nights.push({ ...newNight(date, '5:30 PM', '9:00 PM'), blocks: nightParts() });
    date = dayAfter(date);
  }
  return {
    id: uuid(),
    folder: '',
    name: '',
    church,
    place: '',
    tagline: '',
    look: { ...DEFAULT_LOOK },
    blocks: [
      { id: uuid(), kind: 'text', title: 'About the meetings', teamOnly: false, body: '' },
      listBlock('Team', ['Role', 'Name'], [
        "Children's time", 'Songs', 'Bible story', 'Craft making', 'Health lecture', 'Bible study',
        'Snacks', 'Welcome', 'Prayer team', 'Sound and projector',
      ]),
      {
        id: uuid(),
        kind: 'checklist',
        title: 'Before the first night',
        teamOnly: true,
        items: [
          'Book the place', 'Sound and projector', 'Invitations and flyers', 'Craft materials for the children',
          'Snacks for each night', 'Prayer partners', 'Bible study guides for anybody who asks',
          'Who follows up with each visitor',
        ].map(newItem),
      },
    ],
    nights,
    updated: Date.now(),
  };
}

/** Nothing laid out at all: one night, no blocks. For a church that knows exactly what it wants. */
export function blankSeries(church: string, first: string): EvangelisticMeeting {
  return {
    id: uuid(), folder: '', name: '', church, place: '', tagline: '', look: { ...DEFAULT_LOOK },
    blocks: [], nights: [newNight(first)], updated: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// TIDYING WHAT WAS STORED
// ---------------------------------------------------------------------------
//
// What comes back out of the browser's storage is treated as untrusted: it may
// be from an older version, hand-edited, or half written. Anything that is not
// what a meeting holds is dropped rather than trusted.

const obj = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);
const id = (raw: unknown): string => (typeof raw === 'string' && raw ? oneLine(raw, 64) : uuid());

function tidyBlock(raw: unknown): MeetingBlock | null {
  const r = obj(raw);
  if (!r) return null;
  const base = { id: id(r.id), title: oneLine(r.title, MEETING_LIMITS.title), teamOnly: r.teamOnly === true };
  if (r.kind === 'text') return { ...base, kind: 'text', body: manyLines(r.body, MEETING_LIMITS.text) };
  if (r.kind === 'checklist') {
    const items = list(r.items).map(obj).filter((i): i is Record<string, unknown> => !!i)
      .slice(0, MEETING_LIMITS.items)
      .map((i) => ({ id: id(i.id), text: oneLine(i.text, MEETING_LIMITS.item), done: i.done === true }));
    return { ...base, kind: 'checklist', items };
  }
  if (r.kind === 'list') {
    const columns = list(r.columns).map(obj).filter((c): c is Record<string, unknown> => !!c)
      .slice(0, MEETING_LIMITS.columns)
      .map((c) => ({ id: id(c.id), name: oneLine(c.name, MEETING_LIMITS.column) }));
    if (!columns.length) columns.push({ id: uuid(), name: '' });
    const known = new Set(columns.map((c) => c.id));
    const rows = list(r.rows).map(obj).filter((x): x is Record<string, unknown> => !!x)
      .slice(0, MEETING_LIMITS.rows)
      .map((x) => {
        const cells: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj(x.cells) ?? {})) {
          if (known.has(k) && typeof v === 'string') cells[k] = oneLine(v, MEETING_LIMITS.cell);
        }
        return { id: id(x.id), cells };
      });
    return { ...base, kind: 'list', columns, rows };
  }
  return null;
}

const tidyBlocks = (raw: unknown): MeetingBlock[] =>
  list(raw).map(tidyBlock).filter((b): b is MeetingBlock => !!b).slice(0, MEETING_LIMITS.blocks);

export function tidyMeeting(raw: unknown): EvangelisticMeeting | null {
  const r = obj(raw);
  if (!r || typeof r.id !== 'string') return null;
  const nights = list(r.nights).map(obj).filter((n): n is Record<string, unknown> => !!n)
    .slice(0, MEETING_LIMITS.nights)
    .map((n) => ({
      id: id(n.id),
      date: typeof n.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? n.date : '',
      time: oneLine(n.time, MEETING_LIMITS.time),
      ends: oneLine(n.ends, MEETING_LIMITS.time),
      topic: oneLine(n.topic, MEETING_LIMITS.topic),
      blocks: tidyBlocks(n.blocks),
    }));
  return {
    id: oneLine(r.id, 64),
    folder: oneLine(r.folder, MEETING_LIMITS.folder).trim(),
    name: oneLine(r.name, MEETING_LIMITS.name),
    church: oneLine(r.church, MEETING_LIMITS.church),
    place: oneLine(r.place, MEETING_LIMITS.place),
    tagline: oneLine(r.tagline, MEETING_LIMITS.tagline),
    look: tidyLook(r.look),
    blocks: tidyBlocks(r.blocks),
    nights,
    updated: typeof r.updated === 'number' && Number.isFinite(r.updated) ? r.updated : 0,
  };
}

// ---------------------------------------------------------------------------
// KEEPING THEM ON THE DEVICE, ONE LIST PER ACCOUNT
// ---------------------------------------------------------------------------

export const MEETINGS_KEY = 'beacon-meetings';
export function meetingsKey(owner: string): string {
  return `${MEETINGS_KEY}:${owner}`;
}

/** The first night's date, for sorting: undated series last. */
export function firstDate(m: EvangelisticMeeting): string {
  return m.nights.map((n) => n.date).filter(Boolean).sort()[0] ?? '';
}

export function lastDate(m: EvangelisticMeeting): string {
  const dates = m.nights.map((n) => n.date).filter(Boolean).sort();
  return dates[dates.length - 1] ?? '';
}

/** Soonest first, then the most recently touched. */
export function bySeries(a: EvangelisticMeeting, b: EvangelisticMeeting): number {
  const da = firstDate(a) || '9999';
  const db = firstDate(b) || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return b.updated - a.updated;
}

export function loadMeetings(owner: string): EvangelisticMeeting[] {
  const kept = readKept(meetingsKey(owner));
  if (!Array.isArray(kept)) return [];
  return kept.map(tidyMeeting).filter((m): m is EvangelisticMeeting => !!m).sort(bySeries);
}

/** False when the browser would not keep them, which the screen says in red. */
export function saveMeetings(owner: string, meetings: EvangelisticMeeting[]): boolean {
  return keep(meetingsKey(owner), meetings.slice(0, MEETING_LIMITS.meetings));
}

// ---------------------------------------------------------------------------
// WHAT IS PRINTED, POSTED AND DRAWN
// ---------------------------------------------------------------------------

/** Who a copy is for. What is shared leaves out every team-only block. */
export type MeetingCopy = 'shared' | 'team';

/** The blocks a copy may show. */
export function blocksFor(blocks: MeetingBlock[], copy: MeetingCopy): MeetingBlock[] {
  return copy === 'team' ? blocks : blocks.filter((b) => !b.teamOnly);
}

/** A list's lines that say anything, each as its cells in column order. */
export function filledRows(b: ListBlock): string[][] {
  return b.rows
    .map((r) => b.columns.map((c) => (r.cells[c.id] ?? '').trim()))
    .filter((cells) => cells.some(Boolean));
}

/** Whether a block has anything in it to print. */
export function hasContent(b: MeetingBlock): boolean {
  if (b.kind === 'text') return !!b.body.trim();
  if (b.kind === 'checklist') return b.items.some((i) => i.text.trim());
  return filledRows(b).length > 0;
}

/** "5:30 PM to 9:00 PM", "5:30 PM", or ''. */
export function nightHours(n: MeetingNight): string {
  return n.time && n.ends ? `${n.time} to ${n.ends}` : n.time;
}

/** "Night 2 · Monday, October 5, 2026 · 5:30 PM to 9:00 PM". */
export function nightLabel(m: EvangelisticMeeting, nightId: string): string {
  const at = m.nights.findIndex((n) => n.id === nightId);
  if (at < 0) return '';
  const n = m.nights[at];
  return [`Night ${at + 1}`, dateLabel(n.date), nightHours(n)].filter(Boolean).join(' · ');
}

/** "Sunday, October 4, 2026 to Saturday, October 10, 2026", or one date, or ''. */
export function seriesDates(m: EvangelisticMeeting): string {
  const first = dateLabel(firstDate(m));
  const last = dateLabel(lastDate(m));
  if (!first) return '';
  return first === last ? first : `${first} to ${last}`;
}

/** One block as plain text: its heading, then its lines. '' when it has nothing to say. */
function blockText(b: MeetingBlock, copy: MeetingCopy): string {
  if (!hasContent(b)) return '';
  const heading = `${(b.title || 'Untitled').toUpperCase()}${copy === 'team' && b.teamOnly ? ' (TEAM ONLY)' : ''}`;
  let lines: string[];
  if (b.kind === 'text') {
    lines = b.body.split('\n').map((l) => l.trim()).filter(Boolean);
  } else if (b.kind === 'checklist') {
    lines = b.items.filter((i) => i.text.trim()).map((i) => `- ${i.text.trim()}${i.done ? ' (done)' : ''}`);
  } else {
    lines = filledRows(b).map((cells) => `- ${cells.filter(Boolean).join(' · ')}`);
  }
  return [heading, ...lines].join('\n');
}

/**
 * The meetings as plain text, for a group chat and for a post: the whole
 * series at a glance (its own blocks, then each night's date and topic), or
 * one night in full. Laid out as This Sabbath reads a shared program: a head,
 * then blocks of a heading and its lines, a blank line between.
 */
export function meetingAsText(m: EvangelisticMeeting, nightId: string | null, copy: MeetingCopy = 'shared'): string {
  const night = nightId ? m.nights.find((n) => n.id === nightId) : undefined;
  const head = [
    m.name || 'Evangelistic meetings',
    [m.church, m.place].filter(Boolean).join(' · '),
    night ? nightLabel(m, night.id) : seriesDates(m),
    night?.topic ? `Topic: ${night.topic}` : '',
    m.tagline,
    copy === 'team' ? 'Team copy, with every block' : '',
  ].filter(Boolean).join('\n');

  const parts: string[] = [];
  if (night) {
    for (const b of blocksFor(night.blocks, copy)) parts.push(blockText(b, copy));
  } else {
    for (const b of blocksFor(m.blocks, copy)) parts.push(blockText(b, copy));
    const glance = m.nights.map((n, i) => {
      const when = [dateLabel(n.date), nightHours(n)].filter(Boolean).join(', ');
      return `- Night ${i + 1}${when ? ` · ${when}` : ''}${n.topic ? `: ${n.topic}` : ''}`;
    });
    if (glance.length) parts.push(['THE NIGHTS', ...glance].join('\n'));
  }
  return [head, ...parts.filter(Boolean)].join('\n\n');
}

// ---------------------------------------------------------------------------
// SHARED AS A POST, AND KEPT FOR READING WITH NO SIGNAL
// ---------------------------------------------------------------------------

/** How a shared meeting's post is titled, which is also how This Sabbath knows one. */
export const MEETING_PREFIX = 'Evangelistic meetings · ';

export function meetingShareTitle(m: EvangelisticMeeting, nightId: string | null): string {
  const at = nightId ? m.nights.findIndex((n) => n.id === nightId) : -1;
  const night = at >= 0 ? m.nights[at] : undefined;
  const when = night ? ` · Night ${at + 1}${dateLabel(night.date) ? `, ${dateLabel(night.date)}` : ''}` : '';
  return `${MEETING_PREFIX}${m.name || 'Untitled'}${when}`.slice(0, 200);
}

export function isSharedMeeting(title: string): boolean {
  return title.startsWith(MEETING_PREFIX);
}

export const RECEIVED_MEETINGS_KEY = 'beacon-meetings-received';
export function receivedMeetingsKey(owner: string): string {
  return `${RECEIVED_MEETINGS_KEY}:${owner}`;
}

export function tidyReceivedMeeting(raw: unknown): ReceivedProgram | null {
  const r = obj(raw);
  if (!r || typeof r.id !== 'string' || typeof r.title !== 'string' || !isSharedMeeting(r.title)) return null;
  return {
    id: oneLine(r.id, 64),
    title: oneLine(r.title, 200),
    body: manyLines(r.body, 20000),
    from: oneLine(r.from, 120),
    at: oneLine(r.at, 40),
  };
}

/** Newest first. */
export function byNewest(a: ReceivedProgram, b: ReceivedProgram): number {
  return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
}

export function loadReceivedMeetings(owner: string): ReceivedProgram[] {
  const kept = readKept(receivedMeetingsKey(owner));
  return Array.isArray(kept)
    ? kept.map(tidyReceivedMeeting).filter((x): x is ReceivedProgram => !!x).sort(byNewest)
    : [];
}

/** Keep what has been shared, as it stands now: a post taken down goes from the phone too. */
export function saveReceivedMeetings(owner: string, received: ReceivedProgram[]): boolean {
  return keep(receivedMeetingsKey(owner), received.slice().sort(byNewest).slice(0, MEETING_LIMITS.received));
}
